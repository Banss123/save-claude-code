"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";
import type { ActionResult } from "@/lib/actions/quest";

type CalendarEventInsert =
  Database["public"]["Tables"]["calendar_events"]["Insert"];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EVENT_TYPES = new Set([
  "meeting",
  "visit",
  "report_due",
  "milestone",
  "other",
]);

function ensureOptionalUuid(value: string | null | undefined, label: string) {
  if (!value) return null;
  return UUID_RE.test(value)
    ? null
    : ({ ok: false, error: `${label} 형식이 올바르지 않습니다.` } as const);
}

function ensureIsoLocalDateTime(value: string) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(value)
    ? null
    : ({
        ok: false,
        error: "시작 일시 형식은 YYYY-MM-DDTHH:mm:ss여야 합니다.",
      } as const);
}

export async function createCalendarEvent(input: {
  title: string;
  eventType: string;
  storeId?: string | null;
  startAt: string;
  allDay: boolean;
  createdBy?: string | null;
}): Promise<ActionResult> {
  const title = input.title.trim();
  if (!title) return { ok: false, error: "일정 제목을 입력해주세요." };
  if (!EVENT_TYPES.has(input.eventType)) {
    return { ok: false, error: "일정 종류가 올바르지 않습니다." };
  }

  const startError = ensureIsoLocalDateTime(input.startAt);
  if (startError) return startError;

  const storeIdError = ensureOptionalUuid(input.storeId, "매장 ID");
  if (storeIdError) return storeIdError;

  const createdByError = ensureOptionalUuid(input.createdBy, "담당자 ID");
  if (createdByError) return createdByError;

  const payload: CalendarEventInsert = {
    title,
    event_type: input.eventType,
    store_id: input.storeId || null,
    start_at: input.startAt,
    all_day: input.allDay,
    created_by: input.createdBy || null,
  };

  const supabase = await createClient();
  const { error } = await supabase.from("calendar_events").insert(payload);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/app");
  return { ok: true };
}

export async function deleteCalendarEvent(id: string): Promise<ActionResult> {
  if (!UUID_RE.test(id)) {
    return { ok: false, error: "일정 ID 형식이 올바르지 않습니다." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("calendar_events").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/app");
  return { ok: true };
}
