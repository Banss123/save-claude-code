"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "@/lib/actions/quest";
import type { Database, Json } from "@/lib/database.types";

type ConversationMessageInsert =
  Database["public"]["Tables"]["kakao_conversation_messages"]["Insert"];
type ConversationImportInsert =
  Database["public"]["Tables"]["kakao_conversation_imports"]["Insert"];
type StoreToneExampleInsert =
  Database["public"]["Tables"]["store_tone_examples"]["Insert"];
type StoreToneProfileInsert =
  Database["public"]["Tables"]["store_tone_profiles"]["Insert"];
type SupabaseAdminClient = ReturnType<typeof createAdminClient>;
type StaffProfile = { id: string; name: string };
type SenderKind = "internal" | "owner" | "reviewer" | "system" | "unknown";
type ParsedKakaoMessage = {
  senderName: string;
  messageText: string;
  sentAt: string | null;
  lineNumber: number;
};
type ToneExampleForProfile = {
  direction: "internal_to_owner" | "owner_to_internal";
  message_text: string;
  features: Json;
  observed_at: string;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cleanRoomTitle(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizePersonName(name: string | null) {
  return (name ?? "").replace(/\s+/g, "").toLowerCase();
}

function classifySender(
  senderName: string | null,
  profiles: StaffProfile[],
): { kind: SenderKind; profileId: string | null } {
  const normalized = normalizePersonName(senderName);
  if (!normalized) return { kind: "unknown", profileId: null };
  const profile = profiles.find((item) => {
    const profileName = normalizePersonName(item.name);
    return profileName && (normalized === profileName || normalized.includes(profileName));
  });
  if (profile) return { kind: "internal", profileId: profile.id };
  if (/(알림|카카오톡|kakao|system|bot|봇|관리자)/i.test(senderName ?? "")) {
    return { kind: "system", profileId: null };
  }
  if (/(리뷰어|체험단|기자단|원고|작업자)/.test(senderName ?? "")) {
    return { kind: "reviewer", profileId: null };
  }
  if (/(업주|원장|대표|사장|담당자|직원|실장|매니저|팀장|선생님)/.test(senderName ?? "")) {
    return { kind: "owner", profileId: null };
  }
  return { kind: "unknown", profileId: null };
}

function parseKakaoDateHeader(line: string) {
  const match = line.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function toIsoFromKoreanTime(
  dateParts: { year: number; month: number; day: number },
  meridiem: string | undefined,
  hourRaw: string,
  minuteRaw: string,
) {
  let hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (/오후/.test(meridiem ?? "") && hour < 12) hour += 12;
  if (/오전/.test(meridiem ?? "") && hour === 12) hour = 0;
  const date = new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day, hour - 9, minute, 0));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseKakaoConversationText(rawText: string): ParsedKakaoMessage[] {
  const rows: ParsedKakaoMessage[] = [];
  let currentDate: { year: number; month: number; day: number } | null = null;
  let lastRow: ParsedKakaoMessage | null = null;

  rawText.split(/\r?\n/).forEach((line, index) => {
    const trimmed = line.trimEnd();
    if (!trimmed.trim()) return;

    const dateHeader = parseKakaoDateHeader(trimmed);
    if (dateHeader) {
      currentDate = dateHeader;
      return;
    }

    const bracket = trimmed.match(/^\[(.+?)\]\s*\[(오전|오후)\s*(\d{1,2}):(\d{2})\]\s?(.*)$/);
    if (bracket && currentDate) {
      const row = {
        senderName: bracket[1].trim(),
        messageText: bracket[5].trim(),
        sentAt: toIsoFromKoreanTime(currentDate, bracket[2], bracket[3], bracket[4]),
        lineNumber: index + 1,
      };
      rows.push(row);
      lastRow = row;
      return;
    }

    const csvLike = trimmed.match(
      /^(\d{4})[.\/-]\s*(\d{1,2})[.\/-]\s*(\d{1,2})\.?\s*(오전|오후)?\s*(\d{1,2}):(\d{2}),\s*(.+?)\s*:\s*(.*)$/,
    );
    if (csvLike) {
      const dateParts = {
        year: Number(csvLike[1]),
        month: Number(csvLike[2]),
        day: Number(csvLike[3]),
      };
      const row = {
        senderName: csvLike[7].trim(),
        messageText: csvLike[8].trim(),
        sentAt: toIsoFromKoreanTime(dateParts, csvLike[4], csvLike[5], csvLike[6]),
        lineNumber: index + 1,
      };
      rows.push(row);
      lastRow = row;
      return;
    }

    if (lastRow) {
      lastRow.messageText = `${lastRow.messageText}\n${trimmed}`.trim();
    }
  });

  return rows.filter((row) => row.messageText);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function pickOpening(text: string) {
  const firstLine = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstLine) return null;
  return /안녕|대표님|원장님|사장님|실장님|선생님/.test(firstLine)
    ? firstLine.slice(0, 80)
    : null;
}

function pickClosing(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const last = lines[lines.length - 1];
  if (!last) return null;
  return /감사|부탁|확인|드릴게|주세요/.test(last) ? last.slice(0, 80) : null;
}

function analyzeToneFeatures(text: string) {
  const emojiCount = Array.from(text.matchAll(/[\u{1F300}-\u{1FAFF}]/gu)).length;
  const politeSignals = (text.match(/습니다|십시오|드립니다|부탁드립니다|감사합니다|안녕하십니까/g) ?? []).length;
  const casualSignals = (text.match(/요~|ㅎㅎ|ㅋㅋ|봐주세요|한번만|해주시면|드릴게요|할게요/g) ?? []).length;
  const warmthSignals = (text.match(/감사|좋습니다|괜찮|편하게|😊|🙏|!|~/g) ?? []).length;
  const messageLength = text.length <= 90 ? "short" : text.length <= 260 ? "medium" : "detailed";
  return {
    formalityLevel: clamp(3 + Math.min(2, politeSignals) - Math.min(2, casualSignals), 1, 5),
    warmthLevel: clamp(2 + Math.min(3, warmthSignals + (emojiCount > 0 ? 1 : 0)), 1, 5),
    emojiLevel: clamp(emojiCount, 0, 3),
    messageLength,
    hasQuestion: /[?？]|언제|어떻게|가능|될까요|되실까요/.test(text),
    hasRequest: /부탁|확인|요청|전달|보내|주세요|해주/.test(text),
    hasThanks: /감사|고맙/.test(text),
    opening: pickOpening(text),
    closing: pickClosing(text),
  };
}

function numberFeature(features: Json, key: string, fallback: number) {
  if (!features || typeof features !== "object" || Array.isArray(features)) return fallback;
  const value = features[key as keyof typeof features];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringFeature(features: Json, key: string) {
  if (!features || typeof features !== "object" || Array.isArray(features)) return null;
  const value = features[key as keyof typeof features];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function averageRounded(values: number[], fallback: number) {
  if (values.length === 0) return fallback;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function modeLength(examples: ToneExampleForProfile[]) {
  const counts = { short: 0, medium: 0, detailed: 0 };
  for (const example of examples) {
    const value = stringFeature(example.features, "messageLength");
    if (value === "short" || value === "medium" || value === "detailed") counts[value] += 1;
  }
  if (counts.short >= counts.medium && counts.short >= counts.detailed) return "short";
  if (counts.detailed > counts.medium) return "detailed";
  return "medium";
}

function buildToneSummary(profile: {
  formalityLevel: number;
  warmthLevel: number;
  emojiLevel: number;
  messageLength: "short" | "medium" | "detailed";
}) {
  const formality =
    profile.formalityLevel >= 4
      ? "격식 있는 존댓말"
      : profile.formalityLevel <= 2
        ? "가벼운 존댓말"
        : "일반적인 존댓말";
  const warmth =
    profile.warmthLevel >= 4
      ? "친근한 설명"
      : profile.warmthLevel <= 2
        ? "건조하고 짧은 안내"
        : "담백한 안내";
  const length =
    profile.messageLength === "short"
      ? "짧게"
      : profile.messageLength === "detailed"
        ? "근거를 붙여 자세히"
        : "중간 길이로";
  const emoji = profile.emojiLevel > 0 ? "이모지 소량 허용" : "이모지 없이";
  return `${formality}, ${warmth}, ${length}, ${emoji}`;
}

function compactPhrase(text: string) {
  return text.replace(/\s+/g, " ").trim().slice(0, 90);
}

function buildToneProfile(storeId: string, examples: ToneExampleForProfile[]): StoreToneProfileInsert {
  const internal = examples.filter((example) => example.direction === "internal_to_owner");
  const owners = examples.filter((example) => example.direction === "owner_to_internal");
  const base = internal.length > 0 ? internal : examples;
  const formalityLevel = averageRounded(
    base.map((example) => numberFeature(example.features, "formalityLevel", 3)),
    3,
  );
  const warmthLevel = averageRounded(
    base.map((example) => numberFeature(example.features, "warmthLevel", 3)),
    3,
  );
  const emojiLevel = clamp(
    averageRounded(base.map((example) => numberFeature(example.features, "emojiLevel", 0)), 0),
    0,
    3,
  );
  const messageLength = modeLength(base);
  return {
    store_id: storeId,
    formality_level: formalityLevel,
    warmth_level: warmthLevel,
    emoji_level: emojiLevel,
    message_length: messageLength,
    honorific_style: formalityLevel >= 4 ? "formal" : "polite",
    preferred_opening:
      internal.map((example) => stringFeature(example.features, "opening")).find(Boolean) ?? null,
    preferred_closing:
      internal.map((example) => stringFeature(example.features, "closing")).find(Boolean) ?? null,
    tone_summary: buildToneSummary({ formalityLevel, warmthLevel, emojiLevel, messageLength }),
    owner_response_summary: owners.length > 0 ? `업주 응답 ${owners.length}건 관찰` : null,
    sample_phrases: Array.from(
      new Set(internal.slice(0, 8).map((example) => compactPhrase(example.message_text))),
    ).slice(0, 5),
    internal_message_count: internal.length,
    owner_message_count: owners.length,
    learned_from_event_count: examples.length,
    last_sample_at: examples[0]?.observed_at ?? null,
  };
}

async function refreshToneProfile(admin: SupabaseAdminClient, storeId: string) {
  const { data, error } = await admin
    .from("store_tone_examples")
    .select("direction, message_text, features, observed_at")
    .eq("store_id", storeId)
    .order("observed_at", { ascending: false })
    .limit(120);
  if (error || !data || data.length === 0) return;
  await admin
    .from("store_tone_profiles")
    .upsert(buildToneProfile(storeId, data as unknown as ToneExampleForProfile[]), {
      onConflict: "store_id",
    });
}

export async function upsertKakaoRoomMapping(input: {
  roomTitle: string;
  storeId: string;
}): Promise<ActionResult> {
  const roomTitle = cleanRoomTitle(input.roomTitle);
  if (!roomTitle) return { ok: false, error: "카톡방 이름이 비어 있습니다." };
  if (!UUID_RE.test(input.storeId)) {
    return { ok: false, error: "매장 ID 형식이 올바르지 않습니다." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const admin = createAdminClient();
  const { data: store, error: storeError } = await admin
    .from("stores")
    .select("id")
    .eq("id", input.storeId)
    .maybeSingle();
  if (storeError) return { ok: false, error: storeError.message };
  if (!store) return { ok: false, error: "매장을 찾을 수 없습니다." };

  const { error: mappingError } = await admin
    .from("kakao_room_mappings")
    .upsert(
      {
        room_title: roomTitle,
        store_id: input.storeId,
        active: true,
      },
      { onConflict: "room_title" },
    );
  if (mappingError) return { ok: false, error: mappingError.message };

  const { error: eventsError } = await admin
    .from("kakao_notification_events")
    .update({ store_id: input.storeId })
    .eq("room_title", roomTitle);
  if (eventsError) return { ok: false, error: eventsError.message };

  const { error: proposalsError } = await admin
    .from("proposed_actions")
    .update({ store_id: input.storeId })
    .eq("source", "kakao")
    .contains("payload", { room_title: roomTitle });
  if (proposalsError) return { ok: false, error: proposalsError.message };

  revalidatePath("/app");
  revalidatePath("/app/settings");
  revalidatePath(`/app/stores/${input.storeId}`);
  return { ok: true };
}

export async function deactivateKakaoRoomMapping(input: {
  roomTitle: string;
}): Promise<ActionResult> {
  const roomTitle = cleanRoomTitle(input.roomTitle);
  if (!roomTitle) return { ok: false, error: "카톡방 이름이 비어 있습니다." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("kakao_room_mappings")
    .update({ active: false })
    .eq("room_title", roomTitle);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/app/settings");
  return { ok: true };
}

export async function importKakaoConversationText(input: {
  storeId: string;
  roomTitle?: string | null;
  sourceFileName?: string | null;
  rawText: string;
}): Promise<ActionResult & { importedCount?: number; toneExampleCount?: number }> {
  if (!UUID_RE.test(input.storeId)) {
    return { ok: false, error: "매장 ID 형식이 올바르지 않습니다." };
  }
  const rawText = input.rawText.trim();
  if (!rawText) return { ok: false, error: "대화 내보내기 내용이 비어 있습니다." };
  if (rawText.length > 2_000_000) {
    return { ok: false, error: "대화 파일이 너무 큽니다. 매장별로 나눠서 올려주세요." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const admin = createAdminClient();
  const { data: store, error: storeError } = await admin
    .from("stores")
    .select("id")
    .eq("id", input.storeId)
    .maybeSingle();
  if (storeError) return { ok: false, error: storeError.message };
  if (!store) return { ok: false, error: "매장을 찾을 수 없습니다." };

  const parsed = parseKakaoConversationText(rawText);
  if (parsed.length === 0) {
    return {
      ok: false,
      error: "파싱된 메시지가 없습니다. 카카오톡 대화 내보내기 원문 형식인지 확인해주세요.",
    };
  }

  const roomTitle = cleanRoomTitle(input.roomTitle ?? "");
  const rawTextHash = sha256(rawText);
  const importPayload: ConversationImportInsert = {
    store_id: input.storeId,
    room_title: roomTitle || null,
    source_file_name: input.sourceFileName?.trim() || null,
    raw_text_hash: rawTextHash,
    message_count: parsed.length,
    imported_by: user.id,
    status: "parsed",
    parsed_at: new Date().toISOString(),
    raw_meta: {
      parser: "kakao_export_v1",
      raw_length: rawText.length,
    },
  };

  const { data: importRow, error: importError } = await admin
    .from("kakao_conversation_imports")
    .upsert(importPayload, { onConflict: "store_id,raw_text_hash" })
    .select("id")
    .single();
  if (importError) return { ok: false, error: importError.message };
  if (!importRow) return { ok: false, error: "대화 import 로그 생성 실패" };

  const { data: profileRows } = await admin.from("profiles").select("id, name");
  const profiles = (profileRows ?? []) as StaffProfile[];
  const messageRows: ConversationMessageInsert[] = parsed.map((message) => {
    const sender = classifySender(message.senderName, profiles);
    const sourceHash = sha256(
      JSON.stringify({
        storeId: input.storeId,
        roomTitle,
        senderName: message.senderName,
        sentAt: message.sentAt,
        messageText: message.messageText,
      }),
    );
    return {
      import_id: importRow.id,
      store_id: input.storeId,
      room_title: roomTitle || null,
      sender_name: message.senderName,
      sender_profile_id: sender.profileId,
      sender_kind: sender.kind,
      message_text: message.messageText,
      sent_at: message.sentAt,
      line_number: message.lineNumber,
      source_hash: sourceHash,
      features: analyzeToneFeatures(message.messageText) as unknown as Json,
    };
  });

  const { data: insertedMessages, error: messageError } = await admin
    .from("kakao_conversation_messages")
    .upsert(messageRows, { onConflict: "source_hash", ignoreDuplicates: true })
    .select("id, sender_name, sender_profile_id, sender_kind, message_text, sent_at, features");
  if (messageError) return { ok: false, error: messageError.message };

  const toneRows: StoreToneExampleInsert[] = [];
  for (const message of insertedMessages ?? []) {
    const senderKind = message.sender_kind as SenderKind | null;
    const direction =
      senderKind === "internal"
        ? "internal_to_owner"
        : senderKind === "owner" || senderKind === "unknown"
          ? "owner_to_internal"
          : null;
    if (!direction) continue;
    toneRows.push({
      store_id: input.storeId,
      conversation_message_id: message.id,
      sender_profile_id: message.sender_profile_id,
      direction,
      sender_name: message.sender_name,
      message_text: message.message_text,
      observed_at: message.sent_at ?? new Date().toISOString(),
      features: message.features,
    });
  }

  if (toneRows.length > 0) {
    const { error: toneError } = await admin
      .from("store_tone_examples")
      .upsert(toneRows, {
        onConflict: "conversation_message_id",
        ignoreDuplicates: true,
      });
    if (toneError) return { ok: false, error: toneError.message };
    await refreshToneProfile(admin, input.storeId);
  }

  revalidatePath("/app");
  revalidatePath("/app/settings");
  revalidatePath(`/app/stores/${input.storeId}`);
  return {
    ok: true,
    importedCount: insertedMessages?.length ?? 0,
    toneExampleCount: toneRows.length,
  };
}
