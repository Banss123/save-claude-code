"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";
import type { ActionResult } from "@/lib/actions/quest";

type ReportInsert = Database["public"]["Tables"]["reports"]["Insert"];
type ReportUpdate = Database["public"]["Tables"]["reports"]["Update"];
type ReportType = Database["public"]["Enums"]["report_type"];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REPORT_TYPES = new Set<ReportType>(["weekly", "mid_rank", "monthly"]);

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

function revalidateReportSurfaces(storeId?: string | null) {
  revalidatePath("/app");
  revalidatePath("/app/reports");
  if (storeId) revalidatePath(`/app/stores/${storeId}`);
}

export async function createReport(input: {
  storeId: string;
  type: ReportType;
  periodStart: string;
  periodEnd: string;
  sourceUrl?: string | null;
  body?: string | null;
  receivedFrom?: string | null;
}): Promise<ActionResult> {
  const storeIdError = ensureUuid(input.storeId, "매장 ID");
  if (storeIdError) return storeIdError;
  if (!REPORT_TYPES.has(input.type)) {
    return { ok: false, error: "보고서 종류가 올바르지 않습니다." };
  }
  const startError = ensureDate(input.periodStart, "기간 시작");
  if (startError) return startError;
  const endError = ensureDate(input.periodEnd, "기간 종료");
  if (endError) return endError;

  const payload: ReportInsert = {
    store_id: input.storeId,
    type: input.type,
    period_start: input.periodStart,
    period_end: input.periodEnd,
    status: "received",
    source_url: input.sourceUrl?.trim() || null,
    body: input.body?.trim() || null,
    received_from: input.receivedFrom?.trim() || null,
  };

  const supabase = await createClient();
  const { error } = await supabase.from("reports").insert(payload);
  if (error) return { ok: false, error: error.message };

  revalidateReportSurfaces(input.storeId);
  return { ok: true };
}

export async function confirmReport(
  reportId: string,
  note?: string,
): Promise<ActionResult> {
  const idError = ensureUuid(reportId, "보고서 ID");
  if (idError) return idError;

  const supabase = await createClient();
  const patch: ReportUpdate = {
    status: "confirmed",
    confirmed_at: new Date().toISOString(),
    confirm_note: note?.trim() || null,
  };
  const { error } = await supabase
    .from("reports")
    .update(patch)
    .eq("id", reportId);
  if (error) return { ok: false, error: error.message };

  revalidateReportSurfaces();
  return { ok: true };
}

export async function requestReportRevision(
  reportId: string,
  note: string,
): Promise<ActionResult> {
  const idError = ensureUuid(reportId, "보고서 ID");
  if (idError) return idError;

  const trimmedNote = note.trim();
  if (!trimmedNote) return { ok: false, error: "수정 요청 내용을 입력해주세요." };

  const supabase = await createClient();
  const patch: ReportUpdate = {
    status: "revision_requested",
    confirm_note: trimmedNote,
  };
  const { error } = await supabase
    .from("reports")
    .update(patch)
    .eq("id", reportId);
  if (error) return { ok: false, error: error.message };

  revalidateReportSurfaces();
  return { ok: true };
}

export async function markReportSent(input: {
  reportId: string;
  sentTo: string;
  note?: string | null;
}): Promise<ActionResult> {
  const idError = ensureUuid(input.reportId, "보고서 ID");
  if (idError) return idError;

  const sentTo = input.sentTo.trim();
  if (!sentTo) return { ok: false, error: "송부 채널을 입력해주세요." };

  const supabase = await createClient();
  const patch: ReportUpdate = {
    status: "sent",
    sent_at: new Date().toISOString(),
    sent_to: sentTo,
    send_note: input.note?.trim() || null,
  };
  const { error } = await supabase
    .from("reports")
    .update(patch)
    .eq("id", input.reportId);
  if (error) return { ok: false, error: error.message };

  revalidateReportSurfaces();
  return { ok: true };
}
