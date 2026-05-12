"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";
import type { ActionResult } from "@/lib/actions/quest";

type KeywordInsert = Database["public"]["Tables"]["keywords"]["Insert"];
type KeywordRankingInsert =
  Database["public"]["Tables"]["keyword_rankings"]["Insert"];
type GbpSnapshotInsert =
  Database["public"]["Tables"]["gbp_snapshots"]["Insert"];
type RecurringCheckInsert =
  Database["public"]["Tables"]["recurring_checks"]["Insert"];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

function revalidateStore(storeId?: string) {
  revalidatePath("/app");
  if (storeId) revalidatePath(`/app/stores/${storeId}`);
}

function numberOrNull(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function performRecurringCheck(input: {
  storeId: string;
  templateId: string;
}): Promise<ActionResult> {
  const storeIdError = ensureUuid(input.storeId, "매장 ID");
  if (storeIdError) return storeIdError;
  const templateIdError = ensureUuid(input.templateId, "템플릿 ID");
  if (templateIdError) return templateIdError;

  const now = new Date();
  const payload: RecurringCheckInsert = {
    store_id: input.storeId,
    template_id: input.templateId,
    scheduled_for: now.toISOString().slice(0, 10),
    performed_at: now.toISOString(),
    result: "ok",
  };

  const supabase = await createClient();
  const { error } = await supabase.from("recurring_checks").insert(payload);
  if (error) return { ok: false, error: error.message };

  revalidateStore(input.storeId);
  return { ok: true };
}

export async function completeRecurringCheck(
  checkId: string,
): Promise<ActionResult> {
  const checkIdError = ensureUuid(checkId, "체크 ID");
  if (checkIdError) return checkIdError;

  const supabase = await createClient();
  const { error } = await supabase
    .from("recurring_checks")
    .update({ performed_at: new Date().toISOString(), result: "ok" })
    .eq("id", checkId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/app");
  revalidatePath("/app/checks");
  return { ok: true };
}

export async function addKeyword(input: {
  storeId: string;
  text: string;
  region?: string | null;
}): Promise<ActionResult> {
  const storeIdError = ensureUuid(input.storeId, "매장 ID");
  if (storeIdError) return storeIdError;

  const text = input.text.trim();
  if (!text) return { ok: false, error: "키워드를 입력해주세요." };

  const payload: KeywordInsert = {
    store_id: input.storeId,
    text,
    region: input.region?.trim() || null,
  };

  const supabase = await createClient();
  const { error } = await supabase.from("keywords").insert(payload);
  if (error) return { ok: false, error: error.message };

  revalidateStore(input.storeId);
  return { ok: true };
}

export async function recordKeywordRank(input: {
  keywordId: string;
  rank: string;
}): Promise<ActionResult> {
  const keywordIdError = ensureUuid(input.keywordId, "키워드 ID");
  if (keywordIdError) return keywordIdError;

  const trimmedRank = input.rank.trim();
  if (!trimmedRank) return { ok: false, error: "순위를 입력해주세요." };

  const rank =
    trimmedRank === "권외" || trimmedRank === "0" ? null : Number(trimmedRank);
  if (rank !== null && (!Number.isInteger(rank) || rank < 1)) {
    return { ok: false, error: "순위는 1 이상의 정수 또는 권외여야 합니다." };
  }

  const payload: KeywordRankingInsert = {
    keyword_id: input.keywordId,
    measured_on: new Date().toISOString().slice(0, 10),
    rank,
    source: "manual",
  };

  const supabase = await createClient();
  const { error } = await supabase.from("keyword_rankings").insert(payload);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/app");
  return { ok: true };
}

export async function addGbpSnapshot(input: {
  storeId: string;
  measuredOn: string;
  views: string;
  calls: string;
  directionRequests: string;
  websiteClicks: string;
  reviewsCount: string;
  reviewsAvg: string;
}): Promise<ActionResult> {
  const storeIdError = ensureUuid(input.storeId, "매장 ID");
  if (storeIdError) return storeIdError;
  const dateError = ensureDate(input.measuredOn, "측정일");
  if (dateError) return dateError;

  const payload: GbpSnapshotInsert = {
    store_id: input.storeId,
    measured_on: input.measuredOn,
    views: numberOrNull(input.views),
    calls: numberOrNull(input.calls),
    direction_requests: numberOrNull(input.directionRequests),
    website_clicks: numberOrNull(input.websiteClicks),
    reviews_count: numberOrNull(input.reviewsCount),
    reviews_avg: numberOrNull(input.reviewsAvg),
    source: "manual",
  };

  const supabase = await createClient();
  const { error } = await supabase.from("gbp_snapshots").insert(payload);
  if (error) return { ok: false, error: error.message };

  revalidateStore(input.storeId);
  return { ok: true };
}
