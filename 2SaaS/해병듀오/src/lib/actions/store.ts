"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/database.types";
import type { ActionResult } from "@/lib/actions/quest";

type StoreStatus = Database["public"]["Enums"]["store_status"];
type StoreInsert = Database["public"]["Tables"]["stores"]["Insert"];
type StoreUpdate = Database["public"]["Tables"]["stores"]["Update"];
type StoreAssigneeInsert =
  Database["public"]["Tables"]["store_assignees"]["Insert"];
type CommunicationInsert =
  Database["public"]["Tables"]["communications"]["Insert"];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STORE_STATUSES = new Set<StoreStatus>([
  "contract_pending",
  "contract_signed",
  "ready_to_start",
  "active",
  "paused",
  "churned",
  "archived",
]);

function ensureUuid(value: string, label: string): ActionResult | null {
  return UUID_RE.test(value)
    ? null
    : { ok: false, error: `${label} 형식이 올바르지 않습니다.` };
}

function ensureDate(value: string, label: string): ActionResult | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? null
    : { ok: false, error: `${label} 형식은 YYYY-MM-DD여야 합니다.` };
}

function uniqueUuidList(values: string[], label: string): string[] | ActionResult {
  const unique = Array.from(new Set(values.filter(Boolean)));
  for (const value of unique) {
    const idError = ensureUuid(value, label);
    if (idError) return idError;
  }
  return unique;
}

function revalidateStoreSurfaces(storeId: string) {
  revalidatePath("/app");
  revalidatePath("/app/stores");
  revalidatePath(`/app/stores/${storeId}`);
}

export async function updateStoreStatus(
  storeId: string,
  status: StoreStatus,
): Promise<ActionResult> {
  const idError = ensureUuid(storeId, "매장 ID");
  if (idError) return idError;
  if (!STORE_STATUSES.has(status)) {
    return { ok: false, error: "매장 상태가 올바르지 않습니다." };
  }

  const supabase = await createClient();
  const patch: StoreUpdate = { status };
  const { error } = await supabase
    .from("stores")
    .update(patch)
    .eq("id", storeId);
  if (error) return { ok: false, error: error.message };

  revalidateStoreSurfaces(storeId);
  return { ok: true };
}

export async function updateStoreOwner(
  storeId: string,
  ownerId: string | null,
): Promise<ActionResult> {
  return updateStoreAssignees(storeId, ownerId ? [ownerId] : []);
}

export async function updateStoreAssignees(
  storeId: string,
  assigneeIds: string[],
): Promise<ActionResult> {
  const storeIdError = ensureUuid(storeId, "매장 ID");
  if (storeIdError) return storeIdError;
  const normalized = uniqueUuidList(assigneeIds, "담당자 ID");
  if (!Array.isArray(normalized)) return normalized;

  const supabase = await createClient();
  const patch: StoreUpdate = { assigned_owner_id: normalized[0] ?? null };
  const { error } = await supabase
    .from("stores")
    .update(patch)
    .eq("id", storeId);
  if (error) return { ok: false, error: error.message };

  const { error: deleteError } = await supabase
    .from("store_assignees")
    .delete()
    .eq("store_id", storeId);
  if (deleteError) return { ok: false, error: deleteError.message };

  if (normalized.length > 0) {
    const rows: StoreAssigneeInsert[] = normalized.map((profileId, index) => ({
      store_id: storeId,
      profile_id: profileId,
      is_primary: index === 0,
    }));
    const { error: insertError } = await supabase
      .from("store_assignees")
      .insert(rows);
    if (insertError) return { ok: false, error: insertError.message };
  }

  revalidateStoreSurfaces(storeId);
  return { ok: true };
}

export async function updateStoreMemo(
  storeId: string,
  memo: string,
): Promise<ActionResult> {
  const idError = ensureUuid(storeId, "매장 ID");
  if (idError) return idError;

  const supabase = await createClient();
  const { data, error: readError } = await supabase
    .from("stores")
    .select("metadata")
    .eq("id", storeId)
    .single();
  if (readError) return { ok: false, error: readError.message };

  const current =
    data.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
      ? (data.metadata as Record<string, Json>)
      : {};
  const nextMetadata: Record<string, Json> = { ...current };
  const trimmed = memo.trim();
  if (trimmed) {
    nextMetadata.memo = trimmed;
  } else {
    delete nextMetadata.memo;
  }
  nextMetadata.memo_updated_at = new Date().toISOString();

  const patch: StoreUpdate = { metadata: nextMetadata };
  const { error } = await supabase
    .from("stores")
    .update(patch)
    .eq("id", storeId);
  if (error) return { ok: false, error: error.message };

  revalidateStoreSurfaces(storeId);
  return { ok: true };
}

export async function createStore(input: {
  name: string;
  typeCode: string;
  businessNumber?: string | null;
  address?: string | null;
  ownerName?: string | null;
  ownerEmail?: string | null;
  ownerPhone?: string | null;
  contractMonths: number;
  keywordsCount: number;
  monthlyFee: number;
  discountAmount?: number | null;
  paymentMethodCode: string;
  taxInvoice: boolean;
  gbpAlreadyCreated: boolean;
  memo?: string | null;
  selectedServices?: string[] | null;
  pricingMetadata?: Json;
  currentRound?: number | null;
  mainKeywordsI18n?: Record<string, string> | null;
  naverPlaceUrl?: string | null;
  googleMapUrl?: string | null;
  driveFolderUrl?: string | null;
  onboardingSheetUrl?: string | null;
  checklistSheetUrl?: string | null;
  reviewSheetUrl?: string | null;
  ownerPriority?: string | null;
  ownerMemo?: string | null;
  assigneeIds?: string[] | null;
}): Promise<ActionResult> {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "매장명을 입력해주세요." };
  if (!input.typeCode.trim()) return { ok: false, error: "업종을 선택해주세요." };
  if (!input.paymentMethodCode.trim()) {
    return { ok: false, error: "결제 방식을 선택해주세요." };
  }
  if (!input.selectedServices?.length) {
    return { ok: false, error: "서비스를 하나 이상 선택해주세요." };
  }
  if (!Number.isInteger(input.contractMonths) || input.contractMonths < 1) {
    return { ok: false, error: "약정 기간은 1개월 이상이어야 합니다." };
  }
  if (!Number.isInteger(input.keywordsCount) || input.keywordsCount < 1) {
    return { ok: false, error: "키워드 수는 1개 이상이어야 합니다." };
  }
  if (!Number.isFinite(input.monthlyFee) || input.monthlyFee < 0) {
    return { ok: false, error: "월 단가가 올바르지 않습니다." };
  }

  const discountAmount =
    input.discountAmount != null &&
    input.discountAmount > 0 &&
    input.discountAmount < input.monthlyFee
      ? input.discountAmount
      : null;
  const discountPct =
    discountAmount != null && input.monthlyFee > 0
      ? Math.round(((input.monthlyFee - discountAmount) / input.monthlyFee) * 100)
      : 0;

  const metadata: Record<string, Json> = {};
  if (input.memo?.trim()) metadata.memo = input.memo.trim();
  if (input.selectedServices?.length) {
    metadata.services = input.selectedServices.filter(Boolean);
  }
  if (input.pricingMetadata !== undefined) {
    metadata.pricing = input.pricingMetadata;
  }
  const assigneeIds = uniqueUuidList(input.assigneeIds ?? [], "담당자 ID");
  if (!Array.isArray(assigneeIds)) return assigneeIds;

  const payload: StoreInsert = {
    name,
    type_code: input.typeCode,
    status: "contract_pending",
    business_number: input.businessNumber?.trim() || null,
    address: input.address?.trim() || null,
    owner_name: input.ownerName?.trim() || null,
    owner_email: input.ownerEmail?.trim() || null,
    owner_phone: input.ownerPhone?.trim() || null,
    contract_months: input.contractMonths,
    keywords_count: input.keywordsCount,
    monthly_fee: input.monthlyFee,
    discount_amount: discountAmount,
    discount_pct: discountPct,
    payment_method_code: input.paymentMethodCode,
    tax_invoice: input.taxInvoice,
    gbp_already_created: input.gbpAlreadyCreated,
    metadata,
    current_round: input.currentRound ?? null,
    main_keywords_i18n: input.mainKeywordsI18n ?? null,
    naver_place_url: input.naverPlaceUrl?.trim() || null,
    google_map_url: input.googleMapUrl?.trim() || null,
    drive_folder_url: input.driveFolderUrl?.trim() || null,
    onboarding_sheet_url: input.onboardingSheetUrl?.trim() || null,
    checklist_sheet_url: input.checklistSheetUrl?.trim() || null,
    review_sheet_url: input.reviewSheetUrl?.trim() || null,
    owner_priority: input.ownerPriority || null,
    owner_memo: input.ownerMemo?.trim() || null,
    assigned_owner_id: assigneeIds[0] ?? null,
  };

  const supabase = await createClient();
  const { data: store, error } = await supabase
    .from("stores")
    .insert(payload)
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  if (store?.id && assigneeIds.length > 0) {
    const rows: StoreAssigneeInsert[] = assigneeIds.map((profileId, index) => ({
      store_id: store.id,
      profile_id: profileId,
      is_primary: index === 0,
    }));
    const { error: assigneeError } = await supabase
      .from("store_assignees")
      .insert(rows);
    if (assigneeError) {
      await supabase.from("stores").delete().eq("id", store.id);
      return { ok: false, error: assigneeError.message };
    }
  }

  const xhsServices =
    input.selectedServices?.filter((service) => service.startsWith("xhs_")) ?? [];
  if (store?.id && xhsServices.length > 0) {
    const today = new Date().toISOString().slice(0, 10);
    const { error: questError } = await supabase.from("quests").insert({
      store_id: store.id,
      title: "샤오홍슈 체험단·기자단 일정양식 수취",
      description: "본사 제공 일정양식을 받아 일정 확정 후 세부 퀘스트로 쪼개기",
      process_step: "XHS.schedule",
      status: "pending",
      priority: "normal",
      source: "auto",
      due_date: today,
      assignee_id: assigneeIds[0] ?? null,
      metadata: {
        services: xhsServices,
        source: "store_registration",
      },
    });
    if (questError) {
      await supabase.from("stores").delete().eq("id", store.id);
      return { ok: false, error: questError.message };
    }
  }

  revalidatePath("/app");
  revalidatePath("/app/stores");
  return { ok: true };
}

export async function markStoreHealthChecked(
  storeId: string,
  note?: string,
): Promise<ActionResult> {
  const idError = ensureUuid(storeId, "매장 ID");
  if (idError) return idError;

  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_health_checked", {
    p_store_id: storeId,
    p_note: note?.trim() || undefined,
  });
  if (error) return { ok: false, error: error.message };

  revalidateStoreSurfaces(storeId);
  return { ok: true };
}

export async function archiveStore(
  storeId: string,
  reason: string,
): Promise<ActionResult> {
  const idError = ensureUuid(storeId, "매장 ID");
  if (idError) return idError;

  const trimmedReason = reason.trim();
  if (!trimmedReason) {
    return { ok: false, error: "아카이브 사유를 입력해주세요." };
  }

  const supabase = await createClient();
  const archivedAt = new Date().toISOString();
  const patch: StoreUpdate = {
    archived_at: archivedAt,
    status: "archived",
  };
  const { error } = await supabase
    .from("stores")
    .update(patch)
    .eq("id", storeId);
  if (error) return { ok: false, error: error.message };

  await supabase.from("store_audit_log").insert({
    store_id: storeId,
    action: "archive_reason",
    after: { archived_at: archivedAt, status: "archived" },
    reason: trimmedReason,
  });

  revalidateStoreSurfaces(storeId);
  return { ok: true };
}

export async function setStoreStartDate(
  storeId: string,
  startDate: string,
): Promise<ActionResult> {
  const idError = ensureUuid(storeId, "매장 ID");
  if (idError) return idError;
  const dateError = ensureDate(startDate, "시작일");
  if (dateError) return dateError;

  const supabase = await createClient();
  const patch: StoreUpdate = { start_date: startDate };
  const { error } = await supabase
    .from("stores")
    .update(patch)
    .eq("id", storeId);
  if (error) return { ok: false, error: error.message };

  revalidateStoreSurfaces(storeId);
  return { ok: true };
}

export type RollNextMonthResult =
  | { ok: true; questsAdded: number; checksAdded: number }
  | { ok: false; error: string };

export async function rollStoreNextMonth(
  storeId: string,
): Promise<RollNextMonthResult> {
  if (!UUID_RE.test(storeId)) {
    return { ok: false, error: "매장 ID 형식이 올바르지 않습니다." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_seed_next_month", {
    p_store_id: storeId,
  });
  if (error) return { ok: false, error: error.message };

  const row = data?.[0];
  revalidateStoreSurfaces(storeId);
  return {
    ok: true,
    questsAdded: row?.quests_added ?? 0,
    checksAdded: row?.checks_added ?? 0,
  };
}

export async function addCommunication(input: {
  storeId: string;
  channelCode: string;
  direction: "inbound" | "outbound";
  summary: string;
  nextAction?: string | null;
  nextActionDate?: string | null;
}): Promise<ActionResult> {
  const idError = ensureUuid(input.storeId, "매장 ID");
  if (idError) return idError;

  const summary = input.summary.trim();
  if (!summary) return { ok: false, error: "연락 요약을 입력해주세요." };
  if (input.direction !== "inbound" && input.direction !== "outbound") {
    return { ok: false, error: "연락 방향이 올바르지 않습니다." };
  }
  if (!input.channelCode.trim()) {
    return { ok: false, error: "연락 채널을 선택해주세요." };
  }
  if (input.nextActionDate) {
    const dateError = ensureDate(input.nextActionDate, "다음 액션 날짜");
    if (dateError) return dateError;
  }

  const payload: CommunicationInsert = {
    store_id: input.storeId,
    channel_code: input.channelCode,
    direction: input.direction,
    summary,
    next_action: input.nextAction?.trim() || null,
    next_action_date: input.nextActionDate || null,
  };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  payload.recorded_by = user?.id ?? null;

  const { error } = await supabase.from("communications").insert(payload);
  if (error) return { ok: false, error: error.message };

  revalidateStoreSurfaces(input.storeId);
  return { ok: true };
}
