"use server";

/**
 * Quest Server Actions — palantir-patterns.md §2-3 (Action 정의)
 *
 * 모든 quest 운영 액션은 여기서. CLAUDE.md 규칙: 쓰기 = Server Action.
 * 트리거 흐름:
 *   - quest_completions INSERT → activity_log 자동 + quest.status='completed' (마이그 010)
 *   - quest.status 변경 자동 audit는 별도 트리거에 위임
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";

export type ActionResult = { ok: true } | { ok: false; error: string };

type QuestUpdate = Database["public"]["Tables"]["quests"]["Update"];
type QuestInsert = Database["public"]["Tables"]["quests"]["Insert"];
type QuestAssigneeInsert =
  Database["public"]["Tables"]["quest_assignees"]["Insert"];
type QuestPriority = Database["public"]["Enums"]["quest_priority"];
type QuestMetadata = Record<string, unknown>;
type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function invalidId(label: string): ActionResult {
  return { ok: false, error: `${label} 형식이 올바르지 않습니다.` };
}

function ensureUuid(value: string, label: string): ActionResult | null {
  return UUID_RE.test(value) ? null : invalidId(label);
}

function ensureDate(value: string, label: string): ActionResult | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? null
    : { ok: false, error: `${label} 형식은 YYYY-MM-DD여야 합니다.` };
}

function normalizeUuidList(values: string[], label: string): string[] | ActionResult {
  const unique = Array.from(new Set(values.filter(Boolean)));
  for (const value of unique) {
    const idError = ensureUuid(value, label);
    if (idError) return idError;
  }
  return unique;
}

function revalidateQuestSurfaces(storeId?: string | null) {
  revalidatePath("/app");
  if (storeId) revalidatePath(`/app/stores/${storeId}`);
}

async function getStoreAssigneeIds(
  supabase: SupabaseServerClient,
  storeId: string,
) {
  const { data, error } = await supabase
    .from("store_assignees")
    .select("profile_id")
    .eq("store_id", storeId)
    .order("is_primary", { ascending: false })
    .order("created_at");
  if (error) return { assigneeIds: [] as string[], error };
  return { assigneeIds: (data ?? []).map((row) => row.profile_id), error: null };
}

async function syncQuestAssignees(
  supabase: SupabaseServerClient,
  questId: string,
  assigneeIds: string[],
): Promise<ActionResult> {
  const { error: deleteError } = await supabase
    .from("quest_assignees")
    .delete()
    .eq("quest_id", questId);
  if (deleteError) return { ok: false, error: deleteError.message };

  if (assigneeIds.length === 0) return { ok: true };

  const rows: QuestAssigneeInsert[] = assigneeIds.map((profileId, index) => ({
    quest_id: questId,
    profile_id: profileId,
    is_primary: index === 0,
  }));
  const { error: insertError } = await supabase
    .from("quest_assignees")
    .insert(rows);
  if (insertError) return { ok: false, error: insertError.message };
  return { ok: true };
}

export async function createQuest(input: {
  storeId: string;
  title: string;
  description?: string | null;
  processStep?: string | null;
  priority: QuestPriority;
  dueDate?: string | null;
  assigneeIds?: string[];
}): Promise<ActionResult> {
  const storeIdError = ensureUuid(input.storeId, "매장 ID");
  if (storeIdError) return storeIdError;

  const title = input.title.trim();
  if (!title) return { ok: false, error: "퀘스트 제목을 입력해주세요." };

  if (input.dueDate) {
    const dueDateError = ensureDate(input.dueDate, "마감일");
    if (dueDateError) return dueDateError;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let assigneeIds: string[] | ActionResult;
  if (input.assigneeIds !== undefined) {
    assigneeIds = normalizeUuidList(input.assigneeIds, "담당자 ID");
  } else {
    const storeAssignees = await getStoreAssigneeIds(supabase, input.storeId);
    if (storeAssignees.error) {
      return { ok: false, error: storeAssignees.error.message };
    }
    assigneeIds = storeAssignees.assigneeIds;
  }
  if (!Array.isArray(assigneeIds)) return assigneeIds;

  const payload: QuestInsert = {
    store_id: input.storeId,
    title,
    description: input.description?.trim() || null,
    process_step: input.processStep?.trim() || null,
    status: "pending",
    priority: input.priority,
    source: "manual",
    due_date: input.dueDate || null,
    created_by: user?.id ?? null,
    assignee_id: assigneeIds[0] ?? null,
  };

  const { data: quest, error } = await supabase
    .from("quests")
    .insert(payload)
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  if (quest?.id) {
    const syncResult = await syncQuestAssignees(supabase, quest.id, assigneeIds);
    if (!syncResult.ok) return syncResult;
  }

  revalidateQuestSurfaces(input.storeId);
  return { ok: true };
}

export async function toggleQuestPin(
  questId: string,
  current: boolean,
): Promise<ActionResult> {
  const idError = ensureUuid(questId, "퀘스트 ID");
  if (idError) return idError;

  const supabase = await createClient();
  const { storeId, error: fetchError } = await getQuestStoreId(questId);
  if (fetchError) return { ok: false, error: fetchError.message };

  const patch: QuestUpdate = {
    is_pinned: !current,
    pinned_at: current ? null : new Date().toISOString(),
  };
  const { error } = await supabase
    .from("quests")
    .update(patch)
    .eq("id", questId);
  if (error) return { ok: false, error: error.message };

  revalidateQuestSurfaces(storeId);
  return { ok: true };
}

async function getQuestStoreId(questId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quests")
    .select("store_id")
    .eq("id", questId)
    .single();

  return { storeId: data?.store_id ?? null, error };
}

/**
 * 퀘스트 완료 — quest_completions INSERT
 * 트리거가 quest.status='completed' + activity_log 처리.
 */
export async function completeQuest(
  questId: string,
  note?: string,
): Promise<ActionResult> {
  const idError = ensureUuid(questId, "퀘스트 ID");
  if (idError) return idError;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("quest_completions")
    .insert({
      quest_id: questId,
      note: note?.trim() || null,
      completed_by: user?.id ?? null,
    });
  if (error) return { ok: false, error: error.message };

  // store.last_health_check_at touch (헬스 신선도 갱신)
  // store_id 조회 후 update
  const { data: quest } = await supabase
    .from("quests")
    .select("store_id")
    .eq("id", questId)
    .single();
  if (quest?.store_id) {
    await supabase
      .from("stores")
      .update({ last_health_check_at: new Date().toISOString() })
      .eq("id", quest.store_id);
  }

  revalidateQuestSurfaces(quest?.store_id);
  return { ok: true };
}

/**
 * 완료/스킵한 퀘스트 되돌리기.
 * 완료 때문에 자동 생성된 다음 단계가 아직 미처리 상태면 함께 취소한다.
 */
export async function reopenQuest(
  questId: string,
  reason?: string,
): Promise<ActionResult> {
  const idError = ensureUuid(questId, "퀘스트 ID");
  if (idError) return idError;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: quest, error: questError } = await supabase
    .from("quests")
    .select("store_id, status, metadata")
    .eq("id", questId)
    .single();
  if (questError) return { ok: false, error: questError.message };
  if (!quest) return { ok: false, error: "퀘스트를 찾을 수 없습니다." };
  if (quest.status === "pending") return { ok: true };

  const { data: completion } = await supabase
    .from("quest_completions")
    .select("id")
    .eq("quest_id", questId)
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (completion?.id) {
    const { data: children, error: childError } = await supabase
      .from("quests")
      .select("id, title, status")
      .eq("metadata->>created_from_completion_id", String(completion.id));
    if (childError) return { ok: false, error: childError.message };

    const completedChild = (children ?? []).find((child) => child.status === "completed");
    if (completedChild) {
      return {
        ok: false,
        error: `다음 단계 "${completedChild.title}"까지 이미 완료되어 되돌릴 수 없습니다.`,
      };
    }

    const openChildIds = (children ?? [])
      .filter((child) => child.status === "pending" || child.status === "blocked")
      .map((child) => child.id);
    if (openChildIds.length > 0) {
      const childPatch: QuestUpdate = {
        status: "cancelled",
        blocked_reason: "이전 퀘스트 되돌리기로 자동 취소",
      };
      const { error: cancelError } = await supabase
        .from("quests")
        .update(childPatch)
        .in("id", openChildIds);
      if (cancelError) return { ok: false, error: cancelError.message };
    }
  }

  const currentMetadata =
    quest.metadata && typeof quest.metadata === "object" && !Array.isArray(quest.metadata)
      ? (quest.metadata as QuestMetadata)
      : {};
  const reopenNotes = Array.isArray(currentMetadata.reopen_notes)
    ? currentMetadata.reopen_notes
    : [];
  const patch: QuestUpdate = {
    status: "pending",
    blocked_reason: null,
    metadata: {
      ...currentMetadata,
      reopened_at: new Date().toISOString(),
      reopened_by: user?.id ?? null,
      reopen_notes: [
        ...reopenNotes,
        {
          text: reason?.trim() || null,
          at: new Date().toISOString(),
          by: user?.id ?? null,
        },
      ],
    },
  };

  const { error } = await supabase
    .from("quests")
    .update(patch)
    .eq("id", questId);
  if (error) return { ok: false, error: error.message };

  revalidateQuestSurfaces(quest.store_id);
  return { ok: true };
}

/**
 * 퀘스트 위임 — assignee_id 변경
 */
export async function delegateQuest(
  questId: string,
  toUserIds: string | string[],
): Promise<ActionResult> {
  const questIdError = ensureUuid(questId, "퀘스트 ID");
  if (questIdError) return questIdError;
  const normalized = normalizeUuidList(
    Array.isArray(toUserIds) ? toUserIds : [toUserIds],
    "위임 대상 ID",
  );
  if (!Array.isArray(normalized)) return normalized;

  const supabase = await createClient();
  const { storeId, error: fetchError } = await getQuestStoreId(questId);
  if (fetchError) return { ok: false, error: fetchError.message };

  const patch: QuestUpdate = { assignee_id: normalized[0] ?? null };
  const { error } = await supabase
    .from("quests")
    .update(patch)
    .eq("id", questId);
  if (error) return { ok: false, error: error.message };

  const syncResult = await syncQuestAssignees(supabase, questId, normalized);
  if (!syncResult.ok) return syncResult;

  revalidateQuestSurfaces(storeId);
  return { ok: true };
}

/**
 * 퀘스트 스킵 — status='cancelled' + 사유는 blocked_reason에 저장
 * (cancelled는 영구 표시. quest_completions에 안 들어감)
 */
export async function skipQuest(
  questId: string,
  reason: string,
): Promise<ActionResult> {
  const idError = ensureUuid(questId, "퀘스트 ID");
  if (idError) return idError;

  if (!reason.trim()) {
    return { ok: false, error: "스킵 사유를 입력해주세요." };
  }
  const supabase = await createClient();
  const { storeId, error: fetchError } = await getQuestStoreId(questId);
  if (fetchError) return { ok: false, error: fetchError.message };

  const patch: QuestUpdate = {
    status: "cancelled",
    blocked_reason: reason.trim(),
  };
  const { error } = await supabase
    .from("quests")
    .update(patch)
    .eq("id", questId);
  if (error) return { ok: false, error: error.message };

  revalidateQuestSurfaces(storeId);
  return { ok: true };
}

/**
 * 퀘스트에 메모 추가 — quest.metadata.notes 배열에 누적
 * (완료 X, 메모만)
 */
export async function addQuestNote(
  questId: string,
  note: string,
): Promise<ActionResult> {
  const idError = ensureUuid(questId, "퀘스트 ID");
  if (idError) return idError;

  if (!note.trim()) {
    return { ok: false, error: "메모를 입력해주세요." };
  }
  const supabase = await createClient();

  // 기존 metadata 조회
  const { data: q, error: fetchErr } = await supabase
    .from("quests")
    .select("metadata")
    .eq("id", questId)
    .single();
  if (fetchErr) return { ok: false, error: fetchErr.message };

  const metadata = (q?.metadata ?? {}) as Record<string, unknown>;
  const notes = Array.isArray(metadata.notes) ? metadata.notes : [];
  const newNotes = [
    ...notes,
    { text: note.trim(), at: new Date().toISOString() },
  ];

  const { storeId } = await getQuestStoreId(questId);
  const { error } = await supabase
    .from("quests")
    .update({ metadata: { ...metadata, notes: newNotes } })
    .eq("id", questId);
  if (error) return { ok: false, error: error.message };

  revalidateQuestSurfaces(storeId);
  return { ok: true };
}
