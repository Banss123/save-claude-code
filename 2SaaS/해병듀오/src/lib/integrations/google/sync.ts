import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database.types";
import {
  decryptGoogleToken,
  googleOAuthConfigured,
  googleTokenEncryptionConfigured,
  refreshGoogleAccessToken,
} from "@/lib/integrations/google/oauth";

type Supabase = SupabaseClient<Database>;
type GoogleAccountRow = Pick<
  Database["public"]["Tables"]["google_accounts"]["Row"],
  "id" | "profile_id" | "email" | "refresh_token_ciphertext"
>;
type CalendarSourceRow =
  Database["public"]["Tables"]["google_calendar_sync_sources"]["Row"];
type TaskSourceRow =
  Database["public"]["Tables"]["google_task_sync_sources"]["Row"];
type ProposedActionInsert =
  Database["public"]["Tables"]["proposed_actions"]["Insert"];
type QuestPriority = Database["public"]["Enums"]["quest_priority"];

export type GoogleSyncStats = {
  accounts: number;
  calendarsSeen: number;
  calendarsSynced: number;
  calendarProposalsCreated: number;
  calendarDuplicatesSkipped: number;
  taskListsSeen: number;
  taskListsSynced: number;
  taskProposalsCreated: number;
  taskDuplicatesSkipped: number;
  errors: string[];
};

type GoogleCalendarListItem = {
  id?: string;
  summary?: string;
  description?: string;
  timeZone?: string;
  accessRole?: string;
  primary?: boolean;
  deleted?: boolean;
};

type GoogleTaskListItem = {
  id?: string;
  title?: string;
};

type GoogleCalendarEvent = {
  id?: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  start?: {
    date?: string;
    dateTime?: string;
    timeZone?: string;
  };
  end?: {
    date?: string;
    dateTime?: string;
    timeZone?: string;
  };
  updated?: string;
};

type GoogleTask = {
  id?: string;
  title?: string;
  notes?: string;
  status?: string;
  due?: string;
  updated?: string;
  webViewLink?: string;
  selfLink?: string;
};

type StoreMatcher = {
  id: string;
  name: string;
  normalizedName: string;
};

const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const GOOGLE_TASKS_API = "https://tasks.googleapis.com/tasks/v1";
const INITIAL_CALENDAR_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const MAX_PAGES = 10;

export function emptyGoogleSyncStats(): GoogleSyncStats {
  return {
    accounts: 0,
    calendarsSeen: 0,
    calendarsSynced: 0,
    calendarProposalsCreated: 0,
    calendarDuplicatesSkipped: 0,
    taskListsSeen: 0,
    taskListsSynced: 0,
    taskProposalsCreated: 0,
    taskDuplicatesSkipped: 0,
    errors: [],
  };
}

export function mergeGoogleSyncStats(
  base: GoogleSyncStats,
  next: GoogleSyncStats,
) {
  base.accounts += next.accounts;
  base.calendarsSeen += next.calendarsSeen;
  base.calendarsSynced += next.calendarsSynced;
  base.calendarProposalsCreated += next.calendarProposalsCreated;
  base.calendarDuplicatesSkipped += next.calendarDuplicatesSkipped;
  base.taskListsSeen += next.taskListsSeen;
  base.taskListsSynced += next.taskListsSynced;
  base.taskProposalsCreated += next.taskProposalsCreated;
  base.taskDuplicatesSkipped += next.taskDuplicatesSkipped;
  base.errors.push(...next.errors);
  return base;
}

export async function refreshGoogleSourceCatalogForAccount(
  supabase: Supabase,
  account: GoogleAccountRow,
) {
  const accessToken = await accessTokenForAccount(supabase, account);
  return upsertGoogleSourceCatalog(supabase, account, accessToken);
}

export async function syncGoogleAccountSources(
  supabase: Supabase,
  account: GoogleAccountRow,
) {
  const stats = emptyGoogleSyncStats();
  stats.accounts = 1;

  if (!googleOAuthConfigured() || !googleTokenEncryptionConfigured()) {
    stats.errors.push("Google OAuth env 또는 token encryption key가 없습니다.");
    return stats;
  }

  const accessToken = await accessTokenForAccount(supabase, account);
  const catalog = await upsertGoogleSourceCatalog(supabase, account, accessToken);
  stats.calendarsSeen += catalog.calendarsSeen;
  stats.taskListsSeen += catalog.taskListsSeen;

  const stores = await loadStoreMatchers(supabase);
  const [calendarSourcesResult, taskSourcesResult] = await Promise.all([
    supabase
      .from("google_calendar_sync_sources")
      .select("*")
      .eq("google_account_id", account.id)
      .eq("selected", true)
      .order("is_primary", { ascending: false })
      .order("summary"),
    supabase
      .from("google_task_sync_sources")
      .select("*")
      .eq("google_account_id", account.id)
      .eq("selected", true)
      .order("title"),
  ]);

  if (calendarSourcesResult.error) {
    stats.errors.push(calendarSourcesResult.error.message);
  }
  if (taskSourcesResult.error) {
    stats.errors.push(taskSourcesResult.error.message);
  }

  for (const source of calendarSourcesResult.data ?? []) {
    try {
      const result = await syncCalendarSource(supabase, account, source, accessToken, stores);
      stats.calendarsSynced += 1;
      stats.calendarProposalsCreated += result.created;
      stats.calendarDuplicatesSkipped += result.duplicates;
    } catch (error) {
      stats.errors.push(
        `${source.summary}: ${error instanceof Error ? error.message : "calendar sync failed"}`,
      );
    }
  }

  for (const source of taskSourcesResult.data ?? []) {
    try {
      const result = await syncTaskSource(supabase, account, source, accessToken, stores);
      stats.taskListsSynced += 1;
      stats.taskProposalsCreated += result.created;
      stats.taskDuplicatesSkipped += result.duplicates;
    } catch (error) {
      stats.errors.push(
        `${source.title}: ${error instanceof Error ? error.message : "tasks sync failed"}`,
      );
    }
  }

  await supabase
    .from("google_accounts")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("id", account.id);

  return stats;
}

export async function syncAllConnectedGoogleAccounts(supabase: Supabase) {
  const stats = emptyGoogleSyncStats();
  const { data, error } = await supabase
    .from("google_accounts")
    .select("id, profile_id, email, refresh_token_ciphertext")
    .is("revoked_at", null)
    .order("connected_at");
  if (error) {
    stats.errors.push(error.message);
    return stats;
  }

  for (const account of data ?? []) {
    try {
      mergeGoogleSyncStats(stats, await syncGoogleAccountSources(supabase, account));
    } catch (error) {
      stats.errors.push(
        `${account.email}: ${error instanceof Error ? error.message : "sync failed"}`,
      );
    }
  }

  return stats;
}

async function accessTokenForAccount(supabase: Supabase, account: GoogleAccountRow) {
  if (!googleTokenEncryptionConfigured()) {
    throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY가 없습니다.");
  }
  const refreshToken = decryptGoogleToken(account.refresh_token_ciphertext);
  const token = await refreshGoogleAccessToken(refreshToken);
  const expiresAt =
    typeof token.expires_in === "number"
      ? new Date(Date.now() + token.expires_in * 1000).toISOString()
      : null;
  await supabase
    .from("google_accounts")
    .update({
      token_expires_at: expiresAt,
      ...(token.scope ? { scopes: token.scope.split(/\s+/).filter(Boolean) } : {}),
    })
    .eq("id", account.id);
  return token.access_token!;
}

async function upsertGoogleSourceCatalog(
  supabase: Supabase,
  account: GoogleAccountRow,
  accessToken: string,
) {
  const [calendarItems, taskLists] = await Promise.all([
    fetchGoogleCalendars(accessToken),
    fetchGoogleTaskLists(accessToken),
  ]);

  const [existingCalendarsResult, existingTaskListsResult] = await Promise.all([
    supabase
      .from("google_calendar_sync_sources")
      .select("google_calendar_id, selected")
      .eq("google_account_id", account.id),
    supabase
      .from("google_task_sync_sources")
      .select("google_tasklist_id, selected")
      .eq("google_account_id", account.id),
  ]);

  if (existingCalendarsResult.error) throw existingCalendarsResult.error;
  if (existingTaskListsResult.error) throw existingTaskListsResult.error;

  const existingCalendarSelection = new Map(
    (existingCalendarsResult.data ?? []).map((row) => [
      row.google_calendar_id,
      row.selected,
    ]),
  );
  const existingTaskSelection = new Map(
    (existingTaskListsResult.data ?? []).map((row) => [
      row.google_tasklist_id,
      row.selected,
    ]),
  );

  const calendarRows = calendarItems
    .filter((item) => item.id && !item.deleted)
    .map((item) => ({
      google_account_id: account.id,
      profile_id: account.profile_id,
      google_calendar_id: item.id!,
      summary: item.summary || "이름 없는 캘린더",
      description: item.description ?? null,
      timezone: item.timeZone ?? null,
      access_role: item.accessRole ?? null,
      is_primary: Boolean(item.primary),
      selected: existingCalendarSelection.get(item.id!) ?? Boolean(item.primary),
    }));
  if (calendarRows.length > 0) {
    const { error } = await supabase
      .from("google_calendar_sync_sources")
      .upsert(calendarRows, { onConflict: "google_account_id,google_calendar_id" });
    if (error) throw error;
  }

  const taskRows = taskLists
    .filter((item) => item.id)
    .map((item, index) => ({
      google_account_id: account.id,
      profile_id: account.profile_id,
      google_tasklist_id: item.id!,
      title: item.title || "이름 없는 할일 목록",
      selected: existingTaskSelection.get(item.id!) ?? index === 0,
    }));
  if (taskRows.length > 0) {
    const { error } = await supabase
      .from("google_task_sync_sources")
      .upsert(taskRows, { onConflict: "google_account_id,google_tasklist_id" });
    if (error) throw error;
  }

  return {
    calendarsSeen: calendarRows.length,
    taskListsSeen: taskRows.length,
  };
}

async function fetchGoogleCalendars(accessToken: string) {
  const items: GoogleCalendarListItem[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = new URL(`${GOOGLE_CALENDAR_API}/users/me/calendarList`);
    url.searchParams.set("maxResults", "250");
    url.searchParams.set("minAccessRole", "reader");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const data = await googleJson<{
      items?: GoogleCalendarListItem[];
      nextPageToken?: string;
    }>(url, accessToken);
    items.push(...(data.items ?? []));
    pageToken = data.nextPageToken;
    if (!pageToken) return items;
  }

  return items;
}

async function fetchGoogleTaskLists(accessToken: string) {
  const items: GoogleTaskListItem[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = new URL(`${GOOGLE_TASKS_API}/users/@me/lists`);
    url.searchParams.set("maxResults", "1000");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const data = await googleJson<{
      items?: GoogleTaskListItem[];
      nextPageToken?: string;
    }>(url, accessToken);
    items.push(...(data.items ?? []));
    pageToken = data.nextPageToken;
    if (!pageToken) return items;
  }

  return items;
}

async function syncCalendarSource(
  supabase: Supabase,
  account: GoogleAccountRow,
  source: CalendarSourceRow,
  accessToken: string,
  stores: StoreMatcher[],
) {
  let eventsResult: {
    events: GoogleCalendarEvent[];
    nextSyncToken: string | null;
    wasFullSync: boolean;
  };

  try {
    eventsResult = await fetchGoogleCalendarEvents({
      accessToken,
      calendarId: source.google_calendar_id,
      syncToken: source.sync_token,
    });
  } catch (error) {
    if (!(error instanceof GoogleApiError) || error.status !== 410 || !source.sync_token) {
      throw error;
    }
    eventsResult = await fetchGoogleCalendarEvents({
      accessToken,
      calendarId: source.google_calendar_id,
      syncToken: null,
    });
  }

  let created = 0;
  let duplicates = 0;
  for (const event of eventsResult.events) {
    if (!event.id || event.status === "cancelled") continue;
    const result = await insertCalendarProposalIfNeeded(
      supabase,
      account,
      source,
      event,
      stores,
    );
    if (result === "created") created += 1;
    if (result === "duplicate") duplicates += 1;
  }

  const now = new Date().toISOString();
  await supabase
    .from("google_calendar_sync_sources")
    .update({
      sync_token: eventsResult.nextSyncToken ?? source.sync_token,
      last_full_sync_at: eventsResult.wasFullSync ? now : source.last_full_sync_at,
      last_incremental_sync_at: eventsResult.wasFullSync ? source.last_incremental_sync_at : now,
    })
    .eq("id", source.id);

  return { created, duplicates };
}

async function fetchGoogleCalendarEvents({
  accessToken,
  calendarId,
  syncToken,
}: {
  accessToken: string;
  calendarId: string;
  syncToken: string | null;
}) {
  const events: GoogleCalendarEvent[] = [];
  let pageToken: string | undefined;
  let nextSyncToken: string | null = null;
  const wasFullSync = !syncToken;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = new URL(
      `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`,
    );
    url.searchParams.set("maxResults", "250");
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("showDeleted", syncToken ? "true" : "false");
    if (syncToken) {
      url.searchParams.set("syncToken", syncToken);
    } else {
      url.searchParams.set(
        "timeMin",
        new Date(Date.now() - INITIAL_CALENDAR_LOOKBACK_MS).toISOString(),
      );
    }
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const data = await googleJson<{
      items?: GoogleCalendarEvent[];
      nextPageToken?: string;
      nextSyncToken?: string;
    }>(url, accessToken);
    events.push(...(data.items ?? []));
    pageToken = data.nextPageToken;
    nextSyncToken = data.nextSyncToken ?? null;
    if (!pageToken) break;
  }

  return { events, nextSyncToken, wasFullSync };
}

async function syncTaskSource(
  supabase: Supabase,
  account: GoogleAccountRow,
  source: TaskSourceRow,
  accessToken: string,
  stores: StoreMatcher[],
) {
  const tasks = await fetchGoogleTasks(accessToken, source.google_tasklist_id);
  let created = 0;
  let duplicates = 0;

  for (const task of tasks) {
    if (!task.id || task.status === "completed") continue;
    const result = await insertTaskProposalIfNeeded(
      supabase,
      account,
      source,
      task,
      stores,
    );
    if (result === "created") created += 1;
    if (result === "duplicate") duplicates += 1;
  }

  await supabase
    .from("google_task_sync_sources")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("id", source.id);

  return { created, duplicates };
}

async function fetchGoogleTasks(accessToken: string, taskListId: string) {
  const tasks: GoogleTask[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = new URL(
      `${GOOGLE_TASKS_API}/lists/${encodeURIComponent(taskListId)}/tasks`,
    );
    url.searchParams.set("maxResults", "100");
    url.searchParams.set("showCompleted", "false");
    url.searchParams.set("showDeleted", "false");
    url.searchParams.set("showHidden", "false");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const data = await googleJson<{
      items?: GoogleTask[];
      nextPageToken?: string;
    }>(url, accessToken);
    tasks.push(...(data.items ?? []));
    pageToken = data.nextPageToken;
    if (!pageToken) return tasks;
  }

  return tasks;
}

async function insertCalendarProposalIfNeeded(
  supabase: Supabase,
  account: GoogleAccountRow,
  source: CalendarSourceRow,
  event: GoogleCalendarEvent,
  stores: StoreMatcher[],
) {
  const dedupePayload = {
    google_account_id: account.id,
    google_calendar_id: source.google_calendar_id,
    google_event_id: event.id!,
  };
  if (await googleProposalExists(supabase, "google_calendar", dedupePayload)) {
    return "duplicate" as const;
  }

  const summary = event.summary?.trim() || "제목 없는 일정";
  const rawInput = [
    `[Calendar] ${source.summary}`,
    summary,
    event.description?.trim(),
    event.location ? `장소: ${event.location}` : null,
    event.htmlLink ? `링크: ${event.htmlLink}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  const storeId = inferStoreId(rawInput, stores);
  const dueDate = googleDateOnly(event.start?.dateTime ?? event.start?.date);

  const payload: ProposedActionInsert = {
    store_id: storeId,
    title: `일정 확인: ${summary}`.slice(0, 120),
    description: calendarProposalDescription(source, event),
    action_type: "quest",
    priority: priorityFromDueDate(dueDate),
    due_date: dueDate,
    source: "google_calendar",
    status: "pending",
    confidence: storeId ? 0.78 : 0.62,
    reasoning: storeId
      ? "일정 내용에 매장명이 포함되어 해당 매장 퀘스트 후보로 분류했습니다."
      : "Google Calendar 일정에서 읽은 항목입니다. 매장은 승인 전에 선택해주세요.",
    raw_input: rawInput,
    proposed_by: account.profile_id,
    payload: {
      ...dedupePayload,
      google_calendar_summary: source.summary,
      google_event_summary: summary,
      google_event_link: event.htmlLink ?? null,
      google_event_updated: event.updated ?? null,
      google_event_start: event.start ?? null,
      google_event_end: event.end ?? null,
    } satisfies Record<string, Json>,
  };

  return insertProposal(supabase, payload);
}

async function insertTaskProposalIfNeeded(
  supabase: Supabase,
  account: GoogleAccountRow,
  source: TaskSourceRow,
  task: GoogleTask,
  stores: StoreMatcher[],
) {
  const dedupePayload = {
    google_account_id: account.id,
    google_tasklist_id: source.google_tasklist_id,
    google_task_id: task.id!,
  };
  if (await googleProposalExists(supabase, "google_tasks", dedupePayload)) {
    return "duplicate" as const;
  }

  const title = task.title?.trim() || "제목 없는 할일";
  const rawInput = [
    `[Tasks] ${source.title}`,
    title,
    task.notes?.trim(),
    task.webViewLink ? `링크: ${task.webViewLink}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  const storeId = inferStoreId(rawInput, stores);
  const dueDate = googleDateOnly(task.due);

  const payload: ProposedActionInsert = {
    store_id: storeId,
    title: `할일 확인: ${title}`.slice(0, 120),
    description: taskProposalDescription(source, task),
    action_type: "quest",
    priority: priorityFromDueDate(dueDate),
    due_date: dueDate,
    source: "google_tasks",
    status: "pending",
    confidence: storeId ? 0.8 : 0.64,
    reasoning: storeId
      ? "할일 제목/메모에 매장명이 포함되어 해당 매장 퀘스트 후보로 분류했습니다."
      : "Google Tasks에서 읽은 미완료 할일입니다. 매장은 승인 전에 선택해주세요.",
    raw_input: rawInput,
    proposed_by: account.profile_id,
    payload: {
      ...dedupePayload,
      google_tasklist_title: source.title,
      google_task_title: title,
      google_task_link: task.webViewLink ?? task.selfLink ?? null,
      google_task_updated: task.updated ?? null,
      google_task_due: task.due ?? null,
    } satisfies Record<string, Json>,
  };

  return insertProposal(supabase, payload);
}

async function googleProposalExists(
  supabase: Supabase,
  source: "google_calendar" | "google_tasks",
  payload: Record<string, string>,
) {
  const { data, error } = await supabase
    .from("proposed_actions")
    .select("id")
    .eq("source", source)
    .contains("payload", payload)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

async function insertProposal(supabase: Supabase, payload: ProposedActionInsert) {
  const { error } = await supabase.from("proposed_actions").insert(payload);
  if (error) {
    if (error.code === "23505") return "duplicate" as const;
    throw error;
  }
  return "created" as const;
}

async function loadStoreMatchers(supabase: Supabase) {
  const { data, error } = await supabase
    .from("stores")
    .select("id, name")
    .is("archived_at", null);
  if (error) throw error;
  return (data ?? []).map((store) => ({
    id: store.id,
    name: store.name,
    normalizedName: normalizeMatchText(store.name),
  }));
}

function inferStoreId(rawText: string, stores: StoreMatcher[]) {
  const normalized = normalizeMatchText(rawText);
  const match = stores.find(
    (store) => store.normalizedName && normalized.includes(store.normalizedName),
  );
  return match?.id ?? null;
}

function normalizeMatchText(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[()[\]{}"'`.,·]/g, "");
}

function googleDateOnly(value: string | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    return date.toISOString().slice(0, 10);
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function priorityFromDueDate(dueDate: string | null): QuestPriority {
  if (!dueDate) return "normal";
  const due = new Date(`${dueDate}T00:00:00+09:00`).getTime();
  const today = new Date();
  const todayStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  ).getTime();
  const days = Math.round((due - todayStart) / (24 * 60 * 60 * 1000));
  if (days <= 2) return "urgent";
  if (days <= 14) return "normal";
  return "low";
}

function calendarProposalDescription(
  source: CalendarSourceRow,
  event: GoogleCalendarEvent,
) {
  const lines = [
    `캘린더: ${source.summary}`,
    event.start?.dateTime || event.start?.date
      ? `시작: ${event.start.dateTime ?? event.start.date}`
      : null,
    event.end?.dateTime || event.end?.date
      ? `종료: ${event.end.dateTime ?? event.end.date}`
      : null,
    event.location ? `장소: ${event.location}` : null,
    event.description?.trim() || null,
    event.htmlLink ? `Google Calendar: ${event.htmlLink}` : null,
  ].filter(Boolean);
  return lines.join("\n").slice(0, 1500) || null;
}

function taskProposalDescription(source: TaskSourceRow, task: GoogleTask) {
  const lines = [
    `할일 목록: ${source.title}`,
    task.due ? `마감: ${task.due}` : null,
    task.notes?.trim() || null,
    task.webViewLink ? `Google Tasks: ${task.webViewLink}` : null,
  ].filter(Boolean);
  return lines.join("\n").slice(0, 1500) || null;
}

async function googleJson<T>(url: URL, accessToken: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const parsed = data as { error?: { message?: string }; error_description?: string };
    throw new GoogleApiError(
      parsed.error?.message ||
        parsed.error_description ||
        `Google API 요청 실패 (${response.status})`,
      response.status,
    );
  }
  return data as T;
}

class GoogleApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "GoogleApiError";
  }
}
