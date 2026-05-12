"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";
import type { ActionResult } from "@/lib/actions/quest";

type LeadStatus = Database["public"]["Enums"]["lead_status"];
type LeadUpdate = Database["public"]["Tables"]["leads"]["Update"];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LEAD_STATUSES = new Set<LeadStatus>([
  "new",
  "contacted",
  "interested",
  "booked",
  "closed",
  "dropped",
  "invalid",
]);

function ensureUuid(value: string, label: string): ActionResult | null {
  return UUID_RE.test(value)
    ? null
    : { ok: false, error: `${label} 형식이 올바르지 않습니다.` };
}

function ensureOptionalUuid(
  value: string | null | undefined,
  label: string,
): ActionResult | null {
  if (!value) return null;
  return ensureUuid(value, label);
}

function revalidateLeads() {
  revalidatePath("/app");
  revalidatePath("/app/leads");
}

export async function updateLeadStatus(
  leadId: string,
  status: LeadStatus,
): Promise<ActionResult> {
  const leadIdError = ensureUuid(leadId, "Lead ID");
  if (leadIdError) return leadIdError;
  if (!LEAD_STATUSES.has(status)) {
    return { ok: false, error: "Lead 상태가 올바르지 않습니다." };
  }

  const patch: LeadUpdate = { status };
  if (status === "contacted") patch.contacted_at = new Date().toISOString();
  if (status === "closed") patch.closed_at = new Date().toISOString();

  const supabase = await createClient();
  const { error } = await supabase
    .from("leads")
    .update(patch)
    .eq("id", leadId);
  if (error) return { ok: false, error: error.message };

  revalidateLeads();
  return { ok: true };
}

export async function updateLeadAssignee(
  leadId: string,
  assignedTo: string | null,
): Promise<ActionResult> {
  const leadIdError = ensureUuid(leadId, "Lead ID");
  if (leadIdError) return leadIdError;
  const assigneeError = ensureOptionalUuid(assignedTo, "담당자 ID");
  if (assigneeError) return assigneeError;

  const patch: LeadUpdate = { assigned_to: assignedTo || null };
  const supabase = await createClient();
  const { error } = await supabase
    .from("leads")
    .update(patch)
    .eq("id", leadId);
  if (error) return { ok: false, error: error.message };

  revalidateLeads();
  return { ok: true };
}

export async function updateLeadMemo(
  leadId: string,
  memo: string,
): Promise<ActionResult> {
  const leadIdError = ensureUuid(leadId, "Lead ID");
  if (leadIdError) return leadIdError;

  const patch: LeadUpdate = { memo: memo.trim() || null };
  const supabase = await createClient();
  const { error } = await supabase
    .from("leads")
    .update(patch)
    .eq("id", leadId);
  if (error) return { ok: false, error: error.message };

  revalidateLeads();
  return { ok: true };
}
