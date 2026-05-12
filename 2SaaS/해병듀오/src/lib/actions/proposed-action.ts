"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { insertAipExecutionLog } from "@/lib/aip/logging";
import { draftProposedQuestFromText } from "@/lib/aip/proposed-quest";
import type { Database, Json } from "@/lib/database.types";
import type { ActionResult } from "@/lib/actions/quest";

type QuestPriority = Database["public"]["Enums"]["quest_priority"];
type ProposedActionInsert =
  Database["public"]["Tables"]["proposed_actions"]["Insert"];
type ProposedActionUpdate =
  Database["public"]["Tables"]["proposed_actions"]["Update"];
type QuestInsert = Database["public"]["Tables"]["quests"]["Insert"];
type QuestAssigneeInsert =
  Database["public"]["Tables"]["quest_assignees"]["Insert"];
type ApproveProposedActionInput = {
  title?: string;
  description?: string | null;
  storeId?: string | null;
  priority?: QuestPriority;
  dueDate?: string | null;
  assigneeIds?: string[];
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ensureOptionalUuid(value: string | null | undefined, label: string) {
  if (!value) return null;
  return UUID_RE.test(value)
    ? null
    : ({ ok: false, error: `${label} 형식이 올바르지 않습니다.` } as const);
}

function ensureUuid(value: string, label: string) {
  return UUID_RE.test(value)
    ? null
    : ({ ok: false, error: `${label} 형식이 올바르지 않습니다.` } as const);
}

function normalizeUuidList(values: string[] | undefined, label: string) {
  if (values === undefined) return undefined;
  const unique = Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
  const invalid = unique.find((value) => !UUID_RE.test(value));
  return invalid
    ? ({ ok: false, error: `${label} 형식이 올바르지 않습니다.` } as const)
    : unique;
}

function ensurePriority(value: string | undefined) {
  if (value === undefined) return null;
  return value === "urgent" || value === "normal" || value === "low"
    ? null
    : ({ ok: false, error: "우선순위 값이 올바르지 않습니다." } as const);
}

function ensureOptionalDate(value: string | null | undefined, label: string) {
  if (!value) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? null
    : ({ ok: false, error: `${label} 형식이 올바르지 않습니다.` } as const);
}

function jsonObject(value: Json): Record<string, Json> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Json>)
    : {};
}

export async function createProposedActionFromText(input: {
  rawText: string;
  storeId?: string | null;
  source?: ProposedActionInsert["source"];
}): Promise<ActionResult> {
  const rawText = input.rawText.trim();
  if (!rawText) return { ok: false, error: "분석할 내용을 입력해주세요." };

  const storeIdError = ensureOptionalUuid(input.storeId, "매장 ID");
  if (storeIdError) return storeIdError;

  const draft = await draftProposedQuestFromText({
    rawText,
    source: input.source ?? "manual_capture",
    useLlm: true,
  });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const payload: ProposedActionInsert = {
    store_id: input.storeId || null,
    title: draft.title,
    description: draft.description,
    action_type: "quest",
    priority: draft.priority,
    due_date: draft.dueDate,
    source: input.source ?? "manual_capture",
    status: "pending",
    confidence: draft.confidence,
    reasoning: draft.reasoning,
    raw_input: rawText,
    proposed_by: user?.id ?? null,
    payload: {
      parser: draft.parser,
      llm_provider: draft.provider,
      llm_model: draft.model,
      action_category: draft.actionCategory,
    },
  };

  const { data: proposedAction, error } = await supabase
    .from("proposed_actions")
    .insert(payload)
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  await insertAipExecutionLog(supabase, {
    storeId: input.storeId || null,
    proposedActionId: proposedAction?.id ?? null,
    actorId: user?.id ?? null,
    actionType: "proposed_quest_draft",
    provider: draft.provider,
    model: draft.model,
    rawInput: rawText,
    rawOutput: [draft.title, draft.description].filter(Boolean).join("\n\n"),
    reasoning: draft.reasoning,
    metadata: {
      source: input.source ?? "manual_capture",
      action_category: draft.actionCategory,
      confidence: draft.confidence,
      parser: draft.parser,
    },
  });

  revalidatePath("/app");
  return { ok: true };
}

export async function approveProposedAction(
  id: string,
  input: ApproveProposedActionInput = {},
): Promise<ActionResult> {
  const idError = ensureUuid(id, "제안 ID");
  if (idError) return idError;
  const storeIdError = ensureOptionalUuid(input.storeId, "매장 ID");
  if (storeIdError) return storeIdError;
  const priorityError = ensurePriority(input.priority);
  if (priorityError) return priorityError;
  const dueDateError = ensureOptionalDate(input.dueDate, "마감일");
  if (dueDateError) return dueDateError;
  const normalizedAssigneeIds = normalizeUuidList(input.assigneeIds, "담당자 ID");
  if (normalizedAssigneeIds && !Array.isArray(normalizedAssigneeIds)) {
    return normalizedAssigneeIds;
  }
  const titleOverride = input.title?.trim();
  if (input.title !== undefined && !titleOverride) {
    return { ok: false, error: "퀘스트 제목을 입력해주세요." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: action, error: readError } = await supabase
    .from("proposed_actions")
    .select("*")
    .eq("id", id)
    .single();
  if (readError) return { ok: false, error: readError.message };
  if (!action) return { ok: false, error: "제안을 찾을 수 없습니다." };
  if (action.status !== "pending") {
    return { ok: false, error: "이미 처리된 제안입니다." };
  }
  if (action.action_type !== "quest") {
    return { ok: false, error: "아직 퀘스트 생성 제안만 승인할 수 있습니다." };
  }
  const finalStoreId = input.storeId ?? action.store_id;
  if (!finalStoreId) {
    return { ok: false, error: "매장이 없는 제안은 먼저 매장을 지정해야 합니다." };
  }
  const finalTitle = titleOverride ?? action.title;
  const finalDescription =
    input.description !== undefined ? input.description?.trim() || null : action.description;
  const finalPriority = input.priority ?? action.priority;
  const finalDueDate = input.dueDate !== undefined ? input.dueDate || null : action.due_date;

  let assigneeIds = normalizedAssigneeIds;
  if (assigneeIds === undefined) {
    const { data: storeAssignees, error: assigneeReadError } = await supabase
      .from("store_assignees")
      .select("profile_id")
      .eq("store_id", finalStoreId)
      .order("is_primary", { ascending: false })
      .order("created_at");
    if (assigneeReadError) {
      return { ok: false, error: assigneeReadError.message };
    }
    assigneeIds = (storeAssignees ?? []).map((row) => row.profile_id);
  }

  const questPayload: QuestInsert = {
    store_id: finalStoreId,
    title: finalTitle,
    description: finalDescription,
    process_step: "AI.proposed",
    status: "pending",
    priority: finalPriority,
    source: "manual",
    due_date: finalDueDate,
    assignee_id: assigneeIds[0] ?? null,
    created_by: user?.id ?? null,
    metadata: {
      created_from: "proposed_actions",
      proposed_action_id: action.id,
      proposed_source: action.source,
      reasoning: action.reasoning,
      raw_input: action.raw_input,
      reviewed_values: {
        title: finalTitle,
        description: finalDescription,
        store_id: finalStoreId,
        priority: finalPriority,
        due_date: finalDueDate,
        assignee_ids: assigneeIds,
      },
    } satisfies Record<string, Json>,
  };

  const { data: quest, error: questError } = await supabase
    .from("quests")
    .insert(questPayload)
    .select("id")
    .single();
  if (questError) return { ok: false, error: questError.message };

  if (quest?.id && assigneeIds.length > 0) {
    const rows: QuestAssigneeInsert[] = assigneeIds.map((profileId, index) => ({
      quest_id: quest.id,
      profile_id: profileId,
      is_primary: index === 0,
    }));
    const { error: assigneeInsertError } = await supabase
      .from("quest_assignees")
      .insert(rows);
    if (assigneeInsertError) {
      return { ok: false, error: assigneeInsertError.message };
    }
  }

  const patch: ProposedActionUpdate = {
    status: "approved",
    store_id: finalStoreId,
    title: finalTitle,
    description: finalDescription,
    priority: finalPriority,
    due_date: finalDueDate,
    quest_id: quest?.id ?? null,
    reviewed_by: user?.id ?? null,
    reviewed_at: new Date().toISOString(),
    payload: {
      ...jsonObject(action.payload),
      reviewed_values: {
        title: finalTitle,
        description: finalDescription,
        store_id: finalStoreId,
        priority: finalPriority,
        due_date: finalDueDate,
        assignee_ids: assigneeIds,
      },
    },
  };
  const { error: updateError } = await supabase
    .from("proposed_actions")
    .update(patch)
    .eq("id", id);
  if (updateError) return { ok: false, error: updateError.message };

  revalidatePath("/app");
  revalidatePath(`/app/stores/${finalStoreId}`);
  if (action.store_id && action.store_id !== finalStoreId) {
    revalidatePath(`/app/stores/${action.store_id}`);
  }
  return { ok: true };
}

export async function dismissProposedAction(
  id: string,
  reason?: string,
): Promise<ActionResult> {
  const idError = ensureUuid(id, "제안 ID");
  if (idError) return idError;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const patch: ProposedActionUpdate = {
    status: "dismissed",
    reviewed_by: user?.id ?? null,
    reviewed_at: new Date().toISOString(),
    payload: {
      dismissed_reason: reason?.trim() || null,
    },
  };

  const { error } = await supabase
    .from("proposed_actions")
    .update(patch)
    .eq("id", id)
    .eq("status", "pending");
  if (error) return { ok: false, error: error.message };

  revalidatePath("/app");
  return { ok: true };
}
