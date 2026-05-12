import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { insertAipExecutionLog } from "@/lib/aip/logging";
import { draftProposedQuestFromText } from "@/lib/aip/proposed-quest";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/lib/database.types";

type ProposedActionInsert =
  Database["public"]["Tables"]["proposed_actions"]["Insert"];
type KakaoEventInsert =
  Database["public"]["Tables"]["kakao_notification_events"]["Insert"];
type KakaoBatchInsert =
  Database["public"]["Tables"]["kakao_ingest_batches"]["Insert"];
type StoreToneExampleInsert =
  Database["public"]["Tables"]["store_tone_examples"]["Insert"];
type StoreToneProfileInsert =
  Database["public"]["Tables"]["store_tone_profiles"]["Insert"];
type SupabaseAdminClient = ReturnType<typeof createAdminClient>;

type StructuredKakaoRoom = {
  roomKind: "owner_seo" | "review_work";
  storeName: string;
};

type ResolvedRoom = {
  storeId: string | null;
  matchMethod: string | null;
  structuredRoom: StructuredKakaoRoom | null;
};

type StaffProfile = {
  id: string;
  name: string;
};

type SenderClassification = {
  kind: "internal" | "owner" | "reviewer" | "system" | "unknown";
  profileId: string | null;
};

type NormalizedKakaoEvent = {
  index: number;
  deviceId: string;
  eventKey: string | null;
  packageName: string;
  roomTitle: string | null;
  senderName: string | null;
  messageText: string;
  postedAt: string | null;
  sourceHash: string;
  messageHash: string;
  messageLength: number;
  rawPayload: Json;
};

type IngestResult = {
  index: number;
  ok: boolean;
  ignored?: boolean;
  duplicate?: boolean;
  proposed?: boolean;
  eventId?: string;
  proposedActionId?: string;
  sourceHash?: string;
  storeMatched?: boolean;
  storeMatchMethod?: string | null;
  reason?: string;
  error?: string;
};

type ToneFeatureSet = {
  formalityLevel: number;
  warmthLevel: number;
  emojiLevel: number;
  messageLength: "short" | "medium" | "detailed";
  hasQuestion: boolean;
  hasRequest: boolean;
  hasThanks: boolean;
  opening: string | null;
  closing: string | null;
};

type ToneExampleForProfile = {
  direction: "internal_to_owner" | "owner_to_internal";
  message_text: string;
  features: Json;
  observed_at: string;
};

export const runtime = "nodejs";

const INGEST_VERSION = "kakao_ingest_v2";
const MAX_BATCH_EVENTS = 50;
const MAX_MESSAGE_CHARS = 20_000;
const MAX_RAW_STRING_CHARS = 4_000;
const MAX_RAW_ARRAY_ITEMS = 30;
const MAX_RAW_OBJECT_KEYS = 80;
const ENABLE_KAKAO_PROPOSAL_LLM =
  process.env.AIP_ENABLE_KAKAO_PROPOSAL_AI === "true";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function limitedString(value: unknown, max: number) {
  const text = asString(value);
  return text.length > max ? text.slice(0, max) : text;
}

function nullableString(value: unknown, max = 1_000) {
  const text = limitedString(value, max);
  return text ? text : null;
}

function cleanRoomTitle(value: string | null) {
  return value?.trim().replace(/\s+/g, " ") || null;
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function tokenMatches(actual: string, expected: string) {
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return (
    actualBytes.length === expectedBytes.length &&
    timingSafeEqual(actualBytes, expectedBytes)
  );
}

function parseTimestamp(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const text = asString(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function sanitizeRawPayload(value: unknown, depth = 0): Json {
  if (value == null) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    return value.length > MAX_RAW_STRING_CHARS
      ? `${value.slice(0, MAX_RAW_STRING_CHARS)}...[truncated ${value.length - MAX_RAW_STRING_CHARS} chars]`
      : value;
  }
  if (Array.isArray(value)) {
    if (depth >= 2) return `[array:${value.length}]`;
    return value
      .slice(0, MAX_RAW_ARRAY_ITEMS)
      .map((item) => sanitizeRawPayload(item, depth + 1)) as Json;
  }
  if (!isRecord(value)) return null;
  if (depth >= 3) return "[object]";

  const sanitized: Record<string, Json> = {};
  const dropped: string[] = [];
  for (const [key, item] of Object.entries(value).slice(0, MAX_RAW_OBJECT_KEYS)) {
    if (/(authorization|cookie|password|token|secret|base64|bitmap|image|avatar|thumbnail|largeIcon|picture)/i.test(key)) {
      dropped.push(key);
      continue;
    }
    sanitized[key] = sanitizeRawPayload(item, depth + 1);
  }
  if (Object.keys(value).length > MAX_RAW_OBJECT_KEYS) {
    sanitized.__truncated_keys = Object.keys(value).length - MAX_RAW_OBJECT_KEYS;
  }
  if (dropped.length > 0) sanitized.__dropped_keys = dropped;
  return sanitized as Json;
}

function parseStructuredKakaoRoom(roomTitle: string | null): StructuredKakaoRoom | null {
  if (!roomTitle) return null;
  const match = roomTitle.match(/^\s*\[(SEO|작업)\]\s*(.+?)\s*$/i);
  if (!match?.[1] || !match?.[2]) return null;

  const label = match[1].toUpperCase();
  return {
    roomKind: label === "SEO" ? "owner_seo" : "review_work",
    storeName: match[2].trim(),
  };
}

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isAuthorized(request: Request) {
  const expected = process.env.KAKAO_NOTIFICATION_INGEST_TOKEN;
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";

  if (expected) return tokenMatches(token, expected);
  return process.env.NODE_ENV !== "production" && tokenMatches(token, "dev-kakao-test-token");
}

function inferDueDate(text: string): string | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const offset = (days: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + days);
    return formatLocalDate(d);
  };

  const iso = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];
  const slash = text.match(/\b(\d{1,2})[./](\d{1,2})\b/);
  if (slash) {
    const year = today.getFullYear();
    return `${year}-${slash[1].padStart(2, "0")}-${slash[2].padStart(2, "0")}`;
  }
  if (/(오늘|금일|당일)/.test(text)) return offset(0);
  if (/(내일|익일)/.test(text)) return offset(1);
  if (/모레/.test(text)) return offset(2);
  const weekday = text.match(/(이번|다음|차주)?\s*(월|화|수|목|금|토|일)요일?/);
  if (weekday?.[2]) {
    const target = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 }[weekday[2] as "일" | "월" | "화" | "수" | "목" | "금" | "토"];
    const current = today.getDay();
    let diff = (target - current + 7) % 7;
    if (diff === 0) diff = 7;
    if (weekday[1] === "다음" || weekday[1] === "차주") diff += 7;
    return offset(diff);
  }
  if (/(이번\s*주|주말)/.test(text)) return offset(7);
  if (/(다음\s*주|차주)/.test(text)) return offset(10);
  return null;
}

function inferPriority(text: string): "urgent" | "normal" | "low" {
  if (/(긴급|급함|급하게|바로|즉시|오늘|금일|당일|누락|클레임|불만|마감|ASAP|빨리|안됨|안 돼)/i.test(text)) {
    return "urgent";
  }
  if (/(나중|천천히|낮음|참고|보류)/.test(text)) return "low";
  return "normal";
}

function isPassiveKakaoSystemNotice(text: string) {
  const normalized = text.trim();
  return /^(사진|동영상|파일|이모티콘|음성메시지|연락처|위치|지도|프로필)을? 보냈습니다\.?$/.test(
    normalized,
  );
}

function isPassiveAcknowledgement(text: string) {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (/^(네|넵|예|옙|확인했습니다|확인요|알겠습니다|감사합니다|고맙습니다|좋습니다|오케이|ok|ㅇㅋ|넹|넵넵)[\s.!~]*$/i.test(normalized)) {
    return true;
  }
  return /^(네|넵|예|옙)[\s,.!~]*(확인했습니다|알겠습니다)[\s,.!~]*(감사합니다|고맙습니다)?[\s.!~]*$/i.test(normalized);
}

function shouldCreateProposal(text: string) {
  if (isPassiveKakaoSystemNotice(text)) return false;
  if (isPassiveAcknowledgement(text)) return false;
  return /(요청|해주세요|해줘|보내|전송|송부|전달|컨펌|확인|검토|검수|승인|봐주|봐\s*주|일정|언제|자료|메뉴|사진|링크|시트|드라이브|권한|초대|세팅|업로드|수정|변경|누락|클레임|불만|안됨|안 돼|리뷰|원고|답글|입금|결제|세금계산서|견적|계약|시작일|예약)/.test(text);
}

function isTrackedWorkRoomSender(senderName: string | null) {
  if (!senderName) return false;
  return /(민재|재원|업주|원장|대표|사장|담당자|직원|실장|매니저)/.test(senderName);
}

function normalizePersonName(name: string | null) {
  return (name ?? "").replace(/\s+/g, "").toLowerCase();
}

function classifySender(
  senderName: string | null,
  profiles: StaffProfile[],
): SenderClassification {
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

function isReviewerApprovalRequest(text: string) {
  return /(리뷰\s*(원고|답글|대댓글).*(컨펌|확인|검수|승인|봐주|봐\s*주)|(?:컨펌|확인|검수|승인).*(리뷰\s*(원고|답글|대댓글)))/.test(
    text,
  );
}

function inferActionCategory(text: string) {
  if (isReviewerApprovalRequest(text)) return "review_approval";
  if (/(원고|아티클|콘텐츠).*(컨펌|확인|검수|승인|봐주|봐\s*주)/.test(text)) return "content_approval";
  if (/(일정|시간|예약|방문|미팅|가능\s*시간)/.test(text)) return "schedule_check";
  if (/(자료|사진|메뉴|사업자|링크|시트|드라이브|파일|첨부|업로드)/.test(text)) return "material_request";
  if (/(권한|초대|GBP|구글\s*프로필|구글\s*비즈니스|소유자)/i.test(text)) return "access_request";
  if (/(입금|결제|세금계산서|견적|계약)/.test(text)) return "billing_contract";
  if (/(수정|변경|오타|잘못|누락|클레임|불만|안됨|안 돼)/.test(text)) return "issue_fix";
  return "general_action";
}

function inferActionTitle(text: string) {
  const category = inferActionCategory(text);
  if (category === "review_approval") {
    if (/답글|대댓글/.test(text)) return "리뷰 답글 컨펌 요청";
    if (/원고/.test(text)) return "리뷰 원고 컨펌 요청";
    return "리뷰 컨펌 요청";
  }
  if (category === "content_approval") return "콘텐츠 컨펌 요청";
  if (category === "schedule_check") return "일정 확인 요청";
  if (category === "material_request") return "자료 전달 요청";
  if (category === "access_request") return "권한/초대 확인";
  if (category === "billing_contract") return "계약/입금 확인";
  if (category === "issue_fix") return "수정 요청 확인";
  return null;
}

function ignoredReasonFor(
  event: NormalizedKakaoEvent,
  resolved: ResolvedRoom,
  sender: SenderClassification,
) {
  if (isPassiveKakaoSystemNotice(event.messageText)) return "passive_system_notice";
  if (!shouldCreateProposal(event.messageText)) return "no_action_signal";
  if (resolved.structuredRoom?.roomKind === "owner_seo" && sender.kind === "internal") {
    return "owner_room_internal_sender";
  }
  if (
    resolved.structuredRoom?.roomKind === "review_work" &&
    sender.kind !== "internal" &&
    !isTrackedWorkRoomSender(event.senderName) &&
    !isReviewerApprovalRequest(event.messageText)
  ) {
    return "review_work_sender_not_tracked";
  }
  return null;
}

function compactTitle(roomTitle: string | null, senderName: string | null, text: string) {
  const prefix = roomTitle
    ? roomTitle.startsWith("[")
      ? `${roomTitle} `
      : `[${roomTitle}] `
    : senderName
      ? `[${senderName}] `
      : "";
  const firstLine =
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) ?? text;
  const inferred = inferActionTitle(text);
  const base = `${prefix}${inferred ?? firstLine}`;
  return base.length > 72 ? `${base.slice(0, 72)}...` : base;
}

function proposalReasoning(
  event: NormalizedKakaoEvent,
  resolved: ResolvedRoom,
  dueDate: string | null,
) {
  return [
    "카카오톡 알림에서 액션성 표현 감지",
    dueDate ? `마감 후보 ${dueDate}` : null,
    resolved.storeId ? "카톡방-매장 매핑됨" : "매장 미지정",
    resolved.matchMethod,
    resolved.structuredRoom?.roomKind === "review_work" ? "작업방 조건 통과" : null,
    isReviewerApprovalRequest(event.messageText) ? "리뷰 컨펌 요청 감지" : null,
    `분류 ${inferActionCategory(event.messageText)}`,
  ]
    .filter(Boolean)
    .join(" · ");
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

function analyzeToneFeatures(text: string): ToneFeatureSet {
  const emojiCount = Array.from(text.matchAll(/[\u{1F300}-\u{1FAFF}]/gu)).length;
  const politeSignals = (text.match(/습니다|십시오|드립니다|부탁드립니다|감사합니다|안녕하십니까/g) ?? []).length;
  const casualSignals = (text.match(/요~|ㅎㅎ|ㅋㅋ|봐주세요|한번만|해주시면|드릴게요|할게요/g) ?? []).length;
  const warmthSignals = (text.match(/감사|좋습니다|괜찮|편하게|😊|🙏|!|~/g) ?? []).length;

  const formalityLevel = clamp(3 + Math.min(2, politeSignals) - Math.min(2, casualSignals), 1, 5);
  const warmthLevel = clamp(2 + Math.min(3, warmthSignals + (emojiCount > 0 ? 1 : 0)), 1, 5);
  const emojiLevel = clamp(emojiCount, 0, 3);
  const messageLength =
    text.length <= 90 ? "short" : text.length <= 260 ? "medium" : "detailed";

  return {
    formalityLevel,
    warmthLevel,
    emojiLevel,
    messageLength,
    hasQuestion: /[?？]|언제|어떻게|가능|될까요|되실까요/.test(text),
    hasRequest: /부탁|확인|요청|전달|보내|주세요|해주/.test(text),
    hasThanks: /감사|고맙/.test(text),
    opening: pickOpening(text),
    closing: pickClosing(text),
  };
}

function numberFeature(features: Json, key: keyof ToneFeatureSet, fallback: number) {
  if (!isRecord(features)) return fallback;
  const value = features[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringFeature(features: Json, key: keyof ToneFeatureSet) {
  if (!isRecord(features)) return null;
  const value = features[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function averageRounded(values: number[], fallback: number) {
  if (values.length === 0) return fallback;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function modeLength(examples: ToneExampleForProfile[]): "short" | "medium" | "detailed" {
  const counts = { short: 0, medium: 0, detailed: 0 };
  for (const example of examples) {
    const value = stringFeature(example.features, "messageLength");
    if (value === "short" || value === "medium" || value === "detailed") counts[value] += 1;
  }
  if (counts.short >= counts.medium && counts.short >= counts.detailed) return "short";
  if (counts.detailed > counts.medium) return "detailed";
  return "medium";
}

function compactPhrase(text: string) {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90);
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

function buildOwnerResponseSummary(ownerExamples: ToneExampleForProfile[]) {
  if (ownerExamples.length === 0) return null;
  const questionCount = ownerExamples.filter((example) =>
    Boolean(isRecord(example.features) && example.features.hasQuestion),
  ).length;
  const shortCount = ownerExamples.filter(
    (example) => stringFeature(example.features, "messageLength") === "short",
  ).length;
  const parts = [`업주 응답 ${ownerExamples.length}건 관찰`];
  if (questionCount > 0) parts.push(`질문형 ${questionCount}건`);
  if (shortCount / ownerExamples.length >= 0.6) parts.push("짧은 답변 선호");
  return parts.join(" · ");
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
  const preferredOpening =
    internal.map((example) => stringFeature(example.features, "opening")).find(Boolean) ?? null;
  const preferredClosing =
    internal.map((example) => stringFeature(example.features, "closing")).find(Boolean) ?? null;
  const samplePhrases = Array.from(
    new Set(
      internal
        .slice(0, 8)
        .map((example) => compactPhrase(example.message_text))
        .filter((text) => text.length >= 8),
    ),
  ).slice(0, 5);
  const lastSampleAt = examples[0]?.observed_at ?? null;

  return {
    store_id: storeId,
    formality_level: formalityLevel,
    warmth_level: warmthLevel,
    emoji_level: emojiLevel,
    message_length: messageLength,
    honorific_style: formalityLevel >= 4 ? "formal" : "polite",
    preferred_opening: preferredOpening,
    preferred_closing: preferredClosing,
    tone_summary: buildToneSummary({
      formalityLevel,
      warmthLevel,
      emojiLevel,
      messageLength,
    }),
    owner_response_summary: buildOwnerResponseSummary(owners),
    sample_phrases: samplePhrases,
    internal_message_count: internal.length,
    owner_message_count: owners.length,
    learned_from_event_count: examples.length,
    last_sample_at: lastSampleAt,
  };
}

async function refreshToneProfile(supabase: SupabaseAdminClient, storeId: string) {
  const { data, error } = await supabase
    .from("store_tone_examples")
    .select("direction, message_text, features, observed_at")
    .eq("store_id", storeId)
    .order("observed_at", { ascending: false })
    .limit(120);
  if (error || !data || data.length === 0) return;

  const profile = buildToneProfile(storeId, data as unknown as ToneExampleForProfile[]);
  await supabase.from("store_tone_profiles").upsert(profile, { onConflict: "store_id" });
}

async function syncToneExamplesForEvents({
  supabase,
  events,
  insertedByHash,
  roomResolution,
  senderByHash,
}: {
  supabase: SupabaseAdminClient;
  events: NormalizedKakaoEvent[];
  insertedByHash: Map<string, { id: string; source_hash: string; status: string }>;
  roomResolution: Map<string, ResolvedRoom>;
  senderByHash: Map<string, SenderClassification>;
}) {
  const rows: StoreToneExampleInsert[] = [];
  const affectedStoreIds = new Set<string>();

  for (const event of events) {
    const inserted = insertedByHash.get(event.sourceHash);
    if (!inserted) continue;
    const resolved = event.roomTitle
      ? roomResolution.get(event.roomTitle) ?? {
          storeId: null,
          matchMethod: null,
          structuredRoom: null,
        }
      : { storeId: null, matchMethod: null, structuredRoom: null };
    if (!resolved.storeId || resolved.structuredRoom?.roomKind !== "owner_seo") continue;

    const sender = senderByHash.get(event.sourceHash) ?? {
      kind: "unknown" as const,
      profileId: null,
    };
    const direction =
      sender.kind === "internal"
        ? "internal_to_owner"
        : sender.kind === "owner" || sender.kind === "unknown"
          ? "owner_to_internal"
          : null;
    if (!direction || isPassiveKakaoSystemNotice(event.messageText)) continue;

    rows.push({
      store_id: resolved.storeId,
      kakao_notification_event_id: inserted.id,
      sender_profile_id: sender.profileId,
      direction,
      sender_name: event.senderName,
      message_text: event.messageText,
      observed_at: event.postedAt ?? new Date().toISOString(),
      features: analyzeToneFeatures(event.messageText) as unknown as Json,
    });
    affectedStoreIds.add(resolved.storeId);
  }

  if (rows.length === 0) return;
  const { error } = await supabase
    .from("store_tone_examples")
    .upsert(rows, {
      onConflict: "kakao_notification_event_id",
      ignoreDuplicates: true,
    });
  if (error) return;

  await Promise.all(
    Array.from(affectedStoreIds).map((storeId) => refreshToneProfile(supabase, storeId)),
  );
}

async function isKakaoIngestEnabled(supabase: SupabaseAdminClient) {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "integration_kakao_ingest_enabled")
    .maybeSingle();
  return data?.value !== "false";
}

async function resolveStoresForRooms(
  supabase: SupabaseAdminClient,
  roomTitles: string[],
) {
  const uniqueRooms = Array.from(new Set(roomTitles.filter(Boolean)));
  const resolved = new Map<string, ResolvedRoom>();
  for (const roomTitle of uniqueRooms) {
    resolved.set(roomTitle, {
      storeId: null,
      matchMethod: null,
      structuredRoom: parseStructuredKakaoRoom(roomTitle),
    });
  }
  if (uniqueRooms.length === 0) return resolved;

  const { data: mappings } = await supabase
    .from("kakao_room_mappings")
    .select("room_title, store_id")
    .in("room_title", uniqueRooms)
    .eq("active", true);

  for (const mapping of mappings ?? []) {
    resolved.set(mapping.room_title, {
      storeId: mapping.store_id,
      matchMethod: "manual_mapping",
      structuredRoom: parseStructuredKakaoRoom(mapping.room_title),
    });
  }

  const structuredRooms = uniqueRooms
    .filter((roomTitle) => !resolved.get(roomTitle)?.storeId)
    .map((roomTitle) => ({
      roomTitle,
      structuredRoom: parseStructuredKakaoRoom(roomTitle),
    }))
    .filter((item): item is { roomTitle: string; structuredRoom: StructuredKakaoRoom } =>
      Boolean(item.structuredRoom),
    );

  const storeNames = Array.from(
    new Set(structuredRooms.map((item) => item.structuredRoom.storeName)),
  );
  if (storeNames.length === 0) return resolved;

  const { data: stores } = await supabase
    .from("stores")
    .select("id, name")
    .in("name", storeNames);
  const storeIdByName = new Map((stores ?? []).map((store) => [store.name, store.id]));

  for (const { roomTitle, structuredRoom } of structuredRooms) {
    const storeId = storeIdByName.get(structuredRoom.storeName) ?? null;
    resolved.set(roomTitle, {
      storeId,
      matchMethod: storeId ? `${structuredRoom.roomKind}_room_name` : null,
      structuredRoom,
    });
  }

  return resolved;
}

function normalizeKakaoEvent(
  payload: Record<string, unknown>,
  index: number,
  fallbackDeviceId: string | null,
): NormalizedKakaoEvent | IngestResult {
  const packageName =
    nullableString(payload.packageName, 120) ||
    nullableString(payload.package_name, 120) ||
    "com.kakao.talk";
  if (packageName !== "com.kakao.talk") {
    return { index, ok: true, ignored: true, reason: "not_kakao" };
  }

  const deviceId =
    nullableString(payload.deviceId, 120) ||
    nullableString(payload.device_id, 120) ||
    fallbackDeviceId ||
    "unknown-device";
  const eventKey =
    nullableString(payload.eventKey, 500) ??
    nullableString(payload.event_key, 500) ??
    nullableString(payload.notificationKey, 500) ??
    nullableString(payload.notification_key, 500) ??
    nullableString(payload.clientEventId, 500) ??
    nullableString(payload.client_event_id, 500) ??
    nullableString(payload.id, 500);
  const roomTitle = cleanRoomTitle(
    nullableString(payload.roomTitle, 300) ??
      nullableString(payload.room_title, 300) ??
      nullableString(payload.conversationTitle, 300) ??
      nullableString(payload.conversation_title, 300) ??
      nullableString(payload.title, 300),
  );
  const senderName =
    nullableString(payload.senderName, 160) ??
    nullableString(payload.sender_name, 160) ??
    nullableString(payload.subText, 160) ??
    nullableString(payload.sub_text, 160);
  const messageText =
    asString(payload.messageText) ||
    asString(payload.message_text) ||
    asString(payload.bigText) ||
    asString(payload.big_text) ||
    asString(payload.text);
  const postedAt =
    parseTimestamp(payload.postedAt) ??
    parseTimestamp(payload.posted_at) ??
    parseTimestamp(payload.postTime) ??
    parseTimestamp(payload.post_time) ??
    parseTimestamp(payload.when) ??
    parseTimestamp(payload.timestamp);

  if (!messageText) {
    return { index, ok: false, error: "message_text_required" };
  }
  if (messageText.length > MAX_MESSAGE_CHARS) {
    return { index, ok: false, error: "message_text_too_long" };
  }

  const sourceHash = sha256(
    JSON.stringify({
      deviceId,
      eventKey,
      packageName,
      roomTitle,
      senderName,
      messageText,
      postedAt,
    }),
  );

  return {
    index,
    deviceId,
    eventKey,
    packageName,
    roomTitle,
    senderName,
    messageText,
    postedAt,
    sourceHash,
    messageHash: sha256(messageText),
    messageLength: messageText.length,
    rawPayload: sanitizeRawPayload(payload),
  };
}

function shouldProposeEvent(
  event: NormalizedKakaoEvent,
  resolved: ResolvedRoom,
  sender: SenderClassification,
) {
  if (!shouldCreateProposal(event.messageText)) return false;
  if (resolved.structuredRoom?.roomKind === "owner_seo" && sender.kind === "internal") {
    return false;
  }
  if (resolved.structuredRoom?.roomKind !== "review_work") return true;
  return (
    sender.kind === "internal" ||
    sender.kind === "owner" ||
    isTrackedWorkRoomSender(event.senderName) ||
    isReviewerApprovalRequest(event.messageText)
  );
}

function isNormalizedEvent(
  value: NormalizedKakaoEvent | IngestResult,
): value is NormalizedKakaoEvent {
  return "sourceHash" in value && "messageText" in value;
}

function payloadSourceHash(payload: Json) {
  if (!isRecord(payload)) return null;
  return typeof payload.source_hash === "string" ? payload.source_hash : null;
}

async function updateBatch(
  supabase: SupabaseAdminClient,
  batchId: string | null,
  patch: Partial<KakaoBatchInsert>,
) {
  if (!batchId) return;
  await supabase
    .from("kakao_ingest_batches")
    .update({
      ...patch,
      completed_at: new Date().toISOString(),
    })
    .eq("id", batchId);
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const isBatchRequest = Array.isArray(body) || (isRecord(body) && Array.isArray(body.events));
  const envelope = isRecord(body) ? body : {};
  const payloads = Array.isArray(body)
    ? body
    : isRecord(body) && Array.isArray(body.events)
      ? body.events
      : [body];

  if (payloads.length === 0) {
    return NextResponse.json({ ok: false, error: "events_required" }, { status: 400 });
  }
  if (payloads.length > MAX_BATCH_EVENTS) {
    return NextResponse.json(
      { ok: false, error: `too_many_events_max_${MAX_BATCH_EVENTS}` },
      { status: 413 },
    );
  }

  const fallbackDeviceId =
    nullableString(envelope.deviceId, 120) ?? nullableString(envelope.device_id, 120);
  const initialResults: IngestResult[] = [];
  const normalized: NormalizedKakaoEvent[] = [];
  for (const [index, payload] of payloads.entries()) {
    if (!isRecord(payload)) {
      initialResults.push({ index, ok: false, error: "event_must_be_object" });
      continue;
    }
    const event = normalizeKakaoEvent(payload, index, fallbackDeviceId);
    if (isNormalizedEvent(event)) {
      normalized.push(event);
    } else {
      initialResults.push(event);
    }
  }

  if (!isBatchRequest && initialResults[0]?.error === "message_text_required") {
    return NextResponse.json(initialResults[0], { status: 400 });
  }

  const supabase = createAdminClient();
  const enabled = await isKakaoIngestEnabled(supabase);
  if (!enabled) {
    return NextResponse.json({ ok: true, ignored: true, reason: "ingest_disabled" });
  }

  const seenHashes = new Set<string>();
  const uniqueEvents: NormalizedKakaoEvent[] = [];
  const duplicateInRequestResults: IngestResult[] = [];
  for (const event of normalized) {
    if (seenHashes.has(event.sourceHash)) {
      duplicateInRequestResults.push({
        index: event.index,
        ok: true,
        duplicate: true,
        sourceHash: event.sourceHash,
        reason: "duplicate_in_request",
      });
      continue;
    }
    seenHashes.add(event.sourceHash);
    uniqueEvents.push(event);
  }

  const requestHash = sha256(
    JSON.stringify(uniqueEvents.map((event) => event.sourceHash).sort()),
  );
  const batchPayload: KakaoBatchInsert = {
    device_id: fallbackDeviceId ?? uniqueEvents[0]?.deviceId ?? null,
    request_hash: requestHash,
    event_count: payloads.length,
    failed_count: initialResults.filter((result) => !result.ok).length,
    raw_meta: {
      ingest_version: INGEST_VERSION,
      shape: isBatchRequest ? "batch" : "single",
      accepted_events: uniqueEvents.length,
      ignored_before_db: initialResults.filter((result) => result.ignored).length,
      duplicate_in_request: duplicateInRequestResults.length,
    },
  };
  const { data: batch, error: batchError } = await supabase
    .from("kakao_ingest_batches")
    .insert(batchPayload)
    .select("id")
    .single();
  if (batchError) {
    return NextResponse.json({ ok: false, error: batchError.message }, { status: 500 });
  }

  const roomResolution = await resolveStoresForRooms(
    supabase,
    uniqueEvents.map((event) => event.roomTitle).filter((room): room is string => Boolean(room)),
  );
  const { data: profileRows } = await supabase
    .from("profiles")
    .select("id, name");
  const profiles = (profileRows ?? []) as StaffProfile[];
  const senderByHash = new Map(
    uniqueEvents.map((event) => [
      event.sourceHash,
      classifySender(event.senderName, profiles),
    ]),
  );

  const eventRows: KakaoEventInsert[] = uniqueEvents.map((event) => {
    const resolved = event.roomTitle
      ? roomResolution.get(event.roomTitle) ?? {
          storeId: null,
          matchMethod: null,
          structuredRoom: null,
        }
      : { storeId: null, matchMethod: null, structuredRoom: null };
    const sender = senderByHash.get(event.sourceHash) ?? {
      kind: "unknown" as const,
      profileId: null,
    };
    const shouldPropose = shouldProposeEvent(event, resolved, sender);
    const ignoredReason = shouldPropose ? null : ignoredReasonFor(event, resolved, sender);
    return {
      device_id: event.deviceId,
      event_key: event.eventKey,
      package_name: event.packageName,
      room_title: event.roomTitle,
      sender_name: event.senderName,
      message_text: event.messageText,
      posted_at: event.postedAt,
      source_hash: event.sourceHash,
      store_id: resolved.storeId,
      status: shouldPropose ? "received" : "ignored",
      raw_payload: event.rawPayload,
      ingest_batch_id: batch.id,
      room_kind: resolved.structuredRoom?.roomKind ?? null,
      store_match_method: resolved.matchMethod,
      message_text_hash: event.messageHash,
      message_text_length: event.messageLength,
      processed_at: shouldPropose ? null : new Date().toISOString(),
      ingest_version: INGEST_VERSION,
      sender_profile_id: sender.profileId,
      sender_kind: sender.kind,
      ignored_reason: ignoredReason,
      classification: {
        action_signal: shouldCreateProposal(event.messageText),
        passive_system_notice: isPassiveKakaoSystemNotice(event.messageText),
        reviewer_approval_request: isReviewerApprovalRequest(event.messageText),
        sender_kind: sender.kind,
        sender_profile_id: sender.profileId,
        room_kind: resolved.structuredRoom?.roomKind ?? null,
        store_match_method: resolved.matchMethod,
        ignored_reason: ignoredReason,
      },
    };
  });

  const { data: insertedEvents, error: eventError } = await supabase
    .from("kakao_notification_events")
    .upsert(eventRows, { onConflict: "source_hash", ignoreDuplicates: true })
    .select("id, source_hash, status");
  if (eventError) {
    await updateBatch(supabase, batch.id, {
      failed_count: payloads.length,
      raw_meta: {
        ingest_version: INGEST_VERSION,
        error: eventError.message,
      },
    });
    return NextResponse.json({ ok: false, error: eventError.message }, { status: 500 });
  }

  const insertedByHash = new Map(
    (insertedEvents ?? []).map((event) => [event.source_hash, event]),
  );
  await syncToneExamplesForEvents({
    supabase,
    events: uniqueEvents,
    insertedByHash,
    roomResolution,
    senderByHash,
  });
  const ingestResults: IngestResult[] = [
    ...initialResults,
    ...duplicateInRequestResults,
  ];

  for (const event of uniqueEvents) {
    const inserted = insertedByHash.get(event.sourceHash);
    const resolved = event.roomTitle
      ? roomResolution.get(event.roomTitle) ?? {
          storeId: null,
          matchMethod: null,
          structuredRoom: null,
        }
      : { storeId: null, matchMethod: null, structuredRoom: null };
    if (!inserted) {
      ingestResults.push({
        index: event.index,
        ok: true,
        duplicate: true,
        sourceHash: event.sourceHash,
      });
      continue;
    }
    ingestResults.push({
      index: event.index,
      ok: true,
      eventId: inserted.id,
      proposed: false,
      sourceHash: event.sourceHash,
      storeMatched: Boolean(resolved.storeId),
      storeMatchMethod: resolved.matchMethod,
      reason: inserted.status === "ignored" ? ignoredReasonFor(
        event,
        resolved,
        senderByHash.get(event.sourceHash) ?? { kind: "unknown", profileId: null },
      ) ?? "ignored" : undefined,
    });
  }

  const proposalCandidates = uniqueEvents.filter((event) => {
    const inserted = insertedByHash.get(event.sourceHash);
    if (!inserted) return false;
    const resolved = event.roomTitle
      ? roomResolution.get(event.roomTitle) ?? {
          storeId: null,
          matchMethod: null,
          structuredRoom: null,
        }
      : { storeId: null, matchMethod: null, structuredRoom: null };
    return shouldProposeEvent(
      event,
      resolved,
      senderByHash.get(event.sourceHash) ?? { kind: "unknown", profileId: null },
    );
  });

  let proposedCount = 0;
  if (proposalCandidates.length > 0) {
    const proposalRows: ProposedActionInsert[] = [];
    for (const event of proposalCandidates) {
      const resolved = event.roomTitle
        ? roomResolution.get(event.roomTitle) ?? {
            storeId: null,
            matchMethod: null,
            structuredRoom: null,
          }
        : { storeId: null, matchMethod: null, structuredRoom: null };
      const dueDate = inferDueDate(event.messageText);
      const priority = inferPriority(event.messageText);
      const inserted = insertedByHash.get(event.sourceHash);
      const actionCategory = inferActionCategory(event.messageText);
      const draft = await draftProposedQuestFromText({
        rawText: event.messageText,
        source: "kakao",
        storeName: resolved.structuredRoom?.storeName ?? null,
        roomTitle: event.roomTitle,
        senderName: event.senderName,
        deterministicHint: {
          title: compactTitle(event.roomTitle, event.senderName, event.messageText),
          description: event.messageText,
          priority,
          dueDate,
          confidence: resolved.storeId ? 0.74 : 0.58,
          reasoning: proposalReasoning(event, resolved, dueDate),
          actionCategory,
        },
        useLlm: ENABLE_KAKAO_PROPOSAL_LLM,
      });
      proposalRows.push({
        store_id: resolved.storeId,
        title: draft.title,
        description: draft.description,
        action_type: "quest",
        priority: draft.priority,
        due_date: draft.dueDate,
        source: "kakao",
        status: "pending",
        confidence: draft.confidence,
        reasoning: draft.reasoning,
        raw_input: [
          event.roomTitle ? `방: ${event.roomTitle}` : null,
          event.senderName ? `발신: ${event.senderName}` : null,
          event.messageText,
        ]
          .filter(Boolean)
          .join("\n"),
        payload: {
          kakao_notification_event_id: inserted?.id ?? null,
          kakao_ingest_batch_id: batch.id,
          ingest_version: INGEST_VERSION,
          device_id: event.deviceId,
          room_title: event.roomTitle,
          sender_name: event.senderName,
          source_hash: event.sourceHash,
          message_text_hash: event.messageHash,
          action_category: draft.actionCategory,
          parser: draft.parser,
          llm_provider: draft.provider,
          llm_model: draft.model,
          store_match_method: resolved.matchMethod,
          structured_room_kind: resolved.structuredRoom?.roomKind ?? null,
          structured_store_name: resolved.structuredRoom?.storeName ?? null,
        } satisfies Record<string, Json>,
      });
    }

    const { data: proposals, error: proposedError } = await supabase
      .from("proposed_actions")
      .insert(proposalRows)
      .select("id, store_id, title, description, reasoning, payload");
    if (proposedError) {
      await supabase
        .from("kakao_notification_events")
        .update({
          status: "failed",
          processed_at: new Date().toISOString(),
          error_message: proposedError.message,
        })
        .in(
          "source_hash",
          proposalCandidates.map((event) => event.sourceHash),
        );
      await updateBatch(supabase, batch.id, {
        inserted_count: insertedEvents?.length ?? 0,
        duplicate_count: uniqueEvents.length - (insertedEvents?.length ?? 0),
        failed_count: proposalCandidates.length,
        raw_meta: {
          ingest_version: INGEST_VERSION,
          error: proposedError.message,
        },
      });
      return NextResponse.json(
        { ok: false, error: proposedError.message, batchId: batch.id },
        { status: 500 },
      );
    }

    proposedCount = proposals?.length ?? 0;
    for (const proposal of proposals ?? []) {
      const sourceHash = payloadSourceHash(proposal.payload);
      if (!sourceHash) continue;
      const sourceEvent = proposalCandidates.find(
        (event) => event.sourceHash === sourceHash,
      );
      const proposalPayload = isRecord(proposal.payload) ? proposal.payload : {};
      const provider =
        proposalPayload.llm_provider === "openai" || proposalPayload.llm_provider === "kimi"
          ? proposalPayload.llm_provider
          : "fallback";
      await insertAipExecutionLog(supabase, {
        storeId: proposal.store_id,
        proposedActionId: proposal.id,
        actionType: "proposed_quest_draft",
        provider,
        model:
          typeof proposalPayload.llm_model === "string"
            ? proposalPayload.llm_model
            : null,
        rawInput: sourceEvent?.messageText ?? null,
        rawOutput: [proposal.title, proposal.description].filter(Boolean).join("\n\n"),
        reasoning: proposal.reasoning,
        metadata: {
          source: "kakao",
          action_category:
            typeof proposalPayload.action_category === "string"
              ? proposalPayload.action_category
              : null,
          parser:
            typeof proposalPayload.parser === "string"
              ? proposalPayload.parser
              : null,
          room_title: sourceEvent?.roomTitle ?? null,
          sender_name: sourceEvent?.senderName ?? null,
          ingest_version: INGEST_VERSION,
        },
      });
      await supabase
        .from("kakao_notification_events")
        .update({
          status: "proposed",
          proposed_action_id: proposal.id,
          processed_at: new Date().toISOString(),
        })
        .eq("source_hash", sourceHash);

      const result = ingestResults.find(
        (item) => item.sourceHash === sourceHash && item.eventId,
      );
      if (result) {
        result.proposed = true;
        result.proposedActionId = proposal.id;
        result.reason = undefined;
      }
    }
  }

  const insertedCount = insertedEvents?.length ?? 0;
  const duplicateCount =
    uniqueEvents.length - insertedCount + duplicateInRequestResults.length;
  const ignoredCount =
    initialResults.filter((result) => result.ignored).length +
    (insertedEvents ?? []).filter((event) => event.status === "ignored").length;
  const failedCount = ingestResults.filter((result) => !result.ok).length;

  await updateBatch(supabase, batch.id, {
    inserted_count: insertedCount,
    duplicate_count: duplicateCount,
    proposed_count: proposedCount,
    ignored_count: ignoredCount,
    failed_count: failedCount,
  });

  const results = ingestResults.sort((a, b) => a.index - b.index);
  const summary = {
    received: payloads.length,
    inserted: insertedCount,
    duplicate: duplicateCount,
    proposed: proposedCount,
    ignored: ignoredCount,
    failed: failedCount,
  };

  if (!isBatchRequest) {
    const first = results[0] ?? { index: 0, ok: true };
    return NextResponse.json({
      ...first,
      batchId: batch.id,
      summary,
    });
  }

  return NextResponse.json({
    ok: failedCount === 0,
    batchId: batch.id,
    summary,
    results,
  });
}
