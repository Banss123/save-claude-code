"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/actions/quest";
import {
  decryptGoogleToken,
  googleOAuthConfigured,
  googleTokenEncryptionConfigured,
  revokeGoogleToken,
} from "@/lib/integrations/google/oauth";
import {
  refreshGoogleSourceCatalogForAccount,
  syncGoogleAccountSources,
  type GoogleSyncStats,
} from "@/lib/integrations/google/sync";

export type { GoogleSyncStats } from "@/lib/integrations/google/sync";

type AipExecutionLogSummary = {
  id: string;
  provider: string;
  model: string | null;
  status: string;
  actionType: string;
  createdAt: string;
};

export type OperationalStatusSnapshot = {
  aip: {
    providerPreference: "auto" | "openai" | "kimi";
    disableLlm: boolean;
    kimiModel: string;
    kimiApiKeyConfigured: boolean;
    kimiBaseUrlConfigured: boolean;
    kimiThinking: "enabled" | "disabled";
  };
  supabaseAdmin: {
    urlConfigured: boolean;
    serviceRoleKeyConfigured: boolean;
  };
  kakao: {
    ingestTokenConfigured: boolean;
  };
  google: {
    oauthConfigured: boolean;
    tokenEncryptionConfigured: boolean;
  };
  recentAipLogs: AipExecutionLogSummary[];
};

export type GoogleConnectionStatus = {
  configured: {
    oauth: boolean;
    tokenEncryption: boolean;
  };
  account: {
    connected: boolean;
    email: string | null;
    displayName: string | null;
    avatarUrl: string | null;
    scopes: string[];
    connectedAt: string | null;
    revokedAt: string | null;
  };
  sync: {
    lastSyncedAt: string | null;
    calendarCount: number;
    selectedCalendarCount: number;
    taskListCount: number;
    selectedTaskListCount: number;
  };
  sources: {
    calendars: GoogleCalendarSyncSource[];
    taskLists: GoogleTaskSyncSource[];
  };
};

export type GoogleCalendarSyncSource = {
  id: string;
  summary: string;
  timezone: string | null;
  accessRole: string | null;
  isPrimary: boolean;
  selected: boolean;
  lastFullSyncAt: string | null;
  lastIncrementalSyncAt: string | null;
};

export type GoogleTaskSyncSource = {
  id: string;
  title: string;
  selected: boolean;
  lastSyncedAt: string | null;
};

export type GoogleSyncActionResult =
  | {
      ok: true;
      data: GoogleSyncStats;
    }
  | {
      ok: false;
      error: string;
    };

type SettingKey =
  | "common_checklist_sheet_url"
  | "common_review_sheet_url"
  | "notification_new_quest_enabled"
  | "notification_due_soon_enabled"
  | "notification_blocked_enabled"
  | "notification_store_check_enabled"
  | "integration_kakao_ingest_enabled"
  | "integration_kakao_ingest_note";

function cleanUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "__INVALID__";
    }
    return url.toString();
  } catch {
    return "__INVALID__";
  }
}

function normalizedProviderPreference(): "auto" | "openai" | "kimi" {
  const provider = (process.env.AIP_PROVIDER ?? "auto").trim().toLowerCase();
  if (provider === "openai" || provider === "kimi") return provider;
  return "auto";
}

function hasEnvValue(value: string | undefined) {
  return Boolean(value?.trim());
}

export async function getOperationalStatus(): Promise<
  | {
      ok: true;
      data: OperationalStatusSnapshot;
    }
  | {
      ok: false;
      error: string;
    }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const { data, error } = await supabase
    .from("aip_execution_logs")
    .select("id, provider, model, status, action_type, created_at")
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    data: {
      aip: {
        providerPreference: normalizedProviderPreference(),
        disableLlm: process.env.AIP_DISABLE_LLM === "true",
        kimiModel:
          process.env.KIMI_MODEL ??
          process.env.MOONSHOT_MODEL ??
          process.env.AIP_MODEL ??
          "kimi-k2.5",
        kimiApiKeyConfigured: hasEnvValue(process.env.KIMI_API_KEY) || hasEnvValue(process.env.MOONSHOT_API_KEY),
        kimiBaseUrlConfigured: hasEnvValue(process.env.KIMI_BASE_URL),
        kimiThinking: process.env.KIMI_THINKING === "enabled" ? "enabled" : "disabled",
      },
      supabaseAdmin: {
        urlConfigured: hasEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL),
        serviceRoleKeyConfigured: hasEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY),
      },
      kakao: {
        ingestTokenConfigured: hasEnvValue(process.env.KAKAO_NOTIFICATION_INGEST_TOKEN),
      },
      google: {
        oauthConfigured: googleOAuthConfigured(),
        tokenEncryptionConfigured: googleTokenEncryptionConfigured(),
      },
      recentAipLogs: (data ?? []).map((row) => ({
        id: row.id,
        provider: row.provider,
        model: row.model,
        status: row.status,
        actionType: row.action_type,
        createdAt: row.created_at,
      })),
    },
  };
}

export async function getGoogleConnectionStatus(): Promise<
  | {
      ok: true;
      data: GoogleConnectionStatus;
    }
  | {
      ok: false;
      error: string;
    }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const { data, error } = await supabase
    .from("google_accounts")
    .select("id, email, display_name, avatar_url, scopes, connected_at, revoked_at, last_synced_at")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };

  const [calendarSourcesResult, taskSourcesResult] = data
    ? await Promise.all([
        supabase
          .from("google_calendar_sync_sources")
          .select(
            "id, summary, timezone, access_role, is_primary, selected, last_full_sync_at, last_incremental_sync_at",
          )
          .eq("google_account_id", data.id)
          .order("is_primary", { ascending: false })
          .order("summary"),
        supabase
          .from("google_task_sync_sources")
          .select("id, title, selected, last_synced_at")
          .eq("google_account_id", data.id)
          .order("title"),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
      ];
  if (calendarSourcesResult.error) {
    return { ok: false, error: calendarSourcesResult.error.message };
  }
  if (taskSourcesResult.error) {
    return { ok: false, error: taskSourcesResult.error.message };
  }

  const calendars: GoogleCalendarSyncSource[] = (calendarSourcesResult.data ?? []).map(
    (row) => ({
      id: row.id,
      summary: row.summary,
      timezone: row.timezone,
      accessRole: row.access_role,
      isPrimary: row.is_primary,
      selected: row.selected,
      lastFullSyncAt: row.last_full_sync_at,
      lastIncrementalSyncAt: row.last_incremental_sync_at,
    }),
  );
  const taskLists: GoogleTaskSyncSource[] = (taskSourcesResult.data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    selected: row.selected,
    lastSyncedAt: row.last_synced_at,
  }));

  return {
    ok: true,
    data: {
      configured: {
        oauth: googleOAuthConfigured(),
        tokenEncryption: googleTokenEncryptionConfigured(),
      },
      account: {
        connected: Boolean(data && !data.revoked_at),
        email: data?.email ?? null,
        displayName: data?.display_name ?? null,
        avatarUrl: data?.avatar_url ?? null,
        scopes: data?.scopes ?? [],
        connectedAt: data?.connected_at ?? null,
        revokedAt: data?.revoked_at ?? null,
      },
      sync: {
        lastSyncedAt: data?.last_synced_at ?? null,
        calendarCount: calendars.length,
        selectedCalendarCount: calendars.filter((source) => source.selected).length,
        taskListCount: taskLists.length,
        selectedTaskListCount: taskLists.filter((source) => source.selected).length,
      },
      sources: {
        calendars,
        taskLists,
      },
    },
  };
}

export async function refreshGoogleSyncSources(): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };
  if (!googleOAuthConfigured()) return { ok: false, error: "Google OAuth env가 없습니다." };
  if (!googleTokenEncryptionConfigured()) {
    return { ok: false, error: "GOOGLE_TOKEN_ENCRYPTION_KEY가 없습니다." };
  }

  const { data, error } = await supabase
    .from("google_accounts")
    .select("id, profile_id, email, refresh_token_ciphertext")
    .eq("profile_id", user.id)
    .is("revoked_at", null)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "연결된 Google 계정이 없습니다." };

  try {
    await refreshGoogleSourceCatalogForAccount(supabase, data);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Google 목록을 가져오지 못했습니다.",
    };
  }

  revalidatePath("/app/settings");
  return { ok: true };
}

export async function updateGoogleSyncSourceSelection(input: {
  calendarSourceIds: string[];
  taskSourceIds: string[];
}): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const { data: account, error: accountError } = await supabase
    .from("google_accounts")
    .select("id")
    .eq("profile_id", user.id)
    .is("revoked_at", null)
    .maybeSingle();
  if (accountError) return { ok: false, error: accountError.message };
  if (!account) return { ok: false, error: "연결된 Google 계정이 없습니다." };

  const calendarIds = Array.from(new Set(input.calendarSourceIds));
  const taskIds = Array.from(new Set(input.taskSourceIds));

  const [calendarUpdate, taskUpdate] = await Promise.all([
    supabase
      .from("google_calendar_sync_sources")
      .update({ selected: false })
      .eq("google_account_id", account.id),
    supabase
      .from("google_task_sync_sources")
      .update({ selected: false })
      .eq("google_account_id", account.id),
  ]);
  if (calendarUpdate.error) return { ok: false, error: calendarUpdate.error.message };
  if (taskUpdate.error) return { ok: false, error: taskUpdate.error.message };

  if (calendarIds.length > 0) {
    const { error } = await supabase
      .from("google_calendar_sync_sources")
      .update({ selected: true })
      .eq("google_account_id", account.id)
      .in("id", calendarIds);
    if (error) return { ok: false, error: error.message };
  }

  if (taskIds.length > 0) {
    const { error } = await supabase
      .from("google_task_sync_sources")
      .update({ selected: true })
      .eq("google_account_id", account.id)
      .in("id", taskIds);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/app/settings");
  return { ok: true };
}

export async function syncMyGoogleSources(): Promise<GoogleSyncActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const { data, error } = await supabase
    .from("google_accounts")
    .select("id, profile_id, email, refresh_token_ciphertext")
    .eq("profile_id", user.id)
    .is("revoked_at", null)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "연결된 Google 계정이 없습니다." };

  try {
    const stats = await syncGoogleAccountSources(supabase, data);
    revalidatePath("/app");
    revalidatePath("/app/settings");
    return { ok: true, data: stats };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Google 동기화에 실패했습니다.",
    };
  }
}

export async function disconnectGoogleAccount(): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const { data, error } = await supabase
    .from("google_accounts")
    .select("id, refresh_token_ciphertext")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: true };

  if (googleTokenEncryptionConfigured()) {
    try {
      const refreshToken = decryptGoogleToken(data.refresh_token_ciphertext);
      await revokeGoogleToken(refreshToken);
    } catch (error) {
      console.error("[Google OAuth] revoke failed", error);
    }
  }

  const revokedAt = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("google_accounts")
    .update({ revoked_at: revokedAt })
    .eq("id", data.id);
  if (updateError) return { ok: false, error: updateError.message };

  await supabase
    .from("google_calendar_sync_sources")
    .update({ selected: false })
    .eq("google_account_id", data.id);
  await supabase
    .from("google_task_sync_sources")
    .update({ selected: false })
    .eq("google_account_id", data.id);

  revalidatePath("/app/settings");
  return { ok: true };
}

export async function updateCommonSheetLinks(input: {
  checklistSheetUrl: string;
  reviewSheetUrl: string;
}): Promise<ActionResult> {
  const checklist = cleanUrl(input.checklistSheetUrl);
  const review = cleanUrl(input.reviewSheetUrl);
  if (checklist === "__INVALID__") {
    return { ok: false, error: "체크리스트 시트 URL이 올바르지 않습니다." };
  }
  if (review === "__INVALID__") {
    return { ok: false, error: "리뷰 시트 URL이 올바르지 않습니다." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const rows: Array<{
    key: SettingKey;
    value: string | null;
    description: string;
    updated_by: string | null;
  }> = [
    {
      key: "common_checklist_sheet_url",
      value: checklist,
      description: "공용 매장 체크리스트 시트 URL",
      updated_by: user?.id ?? null,
    },
    {
      key: "common_review_sheet_url",
      value: review,
      description: "공용 리뷰 시트 URL",
      updated_by: user?.id ?? null,
    },
  ];

  const { error } = await supabase
    .from("app_settings")
    .upsert(rows, { onConflict: "key" });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/app");
  revalidatePath("/app/settings");
  return { ok: true };
}

function boolValue(value: boolean) {
  return value ? "true" : "false";
}

function cleanText(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 500) : null;
}

export async function updateOperationalSettings(input: {
  notificationNewQuestEnabled: boolean;
  notificationDueSoonEnabled: boolean;
  notificationBlockedEnabled: boolean;
  notificationStoreCheckEnabled: boolean;
  kakaoIngestEnabled: boolean;
  kakaoIngestNote: string;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const rows: Array<{
    key: SettingKey;
    value: string | null;
    description: string;
    updated_by: string | null;
  }> = [
    {
      key: "notification_new_quest_enabled",
      value: boolValue(input.notificationNewQuestEnabled),
      description: "새 퀘스트/수동 알림 표시 여부",
      updated_by: user.id,
    },
    {
      key: "notification_due_soon_enabled",
      value: boolValue(input.notificationDueSoonEnabled),
      description: "마감/계약 종료 알림 표시 여부",
      updated_by: user.id,
    },
    {
      key: "notification_blocked_enabled",
      value: boolValue(input.notificationBlockedEnabled),
      description: "차단/시트 누락/의료법 컨펌 알림 표시 여부",
      updated_by: user.id,
    },
    {
      key: "notification_store_check_enabled",
      value: boolValue(input.notificationStoreCheckEnabled),
      description: "매장 점검 필요 알림 표시 여부",
      updated_by: user.id,
    },
    {
      key: "integration_kakao_ingest_enabled",
      value: boolValue(input.kakaoIngestEnabled),
      description: "카톡 알림 수집 API 활성화 여부",
      updated_by: user.id,
    },
    {
      key: "integration_kakao_ingest_note",
      value: cleanText(input.kakaoIngestNote),
      description: "카톡 수집 운영 메모",
      updated_by: user.id,
    },
  ];

  const { error } = await supabase
    .from("app_settings")
    .upsert(rows, { onConflict: "key" });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/app");
  revalidatePath("/app/settings");
  return { ok: true };
}
