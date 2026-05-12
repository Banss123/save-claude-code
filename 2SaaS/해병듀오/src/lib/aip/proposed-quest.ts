import "server-only";

import type { Database } from "@/lib/database.types";
import {
  createOpenAiJsonResponse,
  llmDisabledReason,
  type AipLlmProvider,
} from "@/lib/aip/openai";

type QuestPriority = Database["public"]["Enums"]["quest_priority"];

export type ProposedQuestDraft = {
  title: string;
  description: string | null;
  priority: QuestPriority;
  dueDate: string | null;
  confidence: number;
  reasoning: string;
  actionCategory: string;
  provider: AipLlmProvider;
  model: string | null;
  parser: string;
};

type OpenAiProposedQuestOutput = {
  title: string;
  description: string;
  priority: QuestPriority;
  due_date: string;
  confidence: number;
  reasoning: string;
  action_category: string;
};

const PROPOSED_QUEST_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string", minLength: 1, maxLength: 80 },
    description: { type: "string", maxLength: 1200 },
    priority: { type: "string", enum: ["urgent", "normal", "low"] },
    due_date: { type: "string", maxLength: 10 },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    reasoning: { type: "string", minLength: 1, maxLength: 500 },
    action_category: { type: "string", minLength: 1, maxLength: 80 },
  },
  required: [
    "title",
    "description",
    "priority",
    "due_date",
    "confidence",
    "reasoning",
    "action_category",
  ],
};

export async function draftProposedQuestFromText({
  rawText,
  source,
  storeName,
  roomTitle,
  senderName,
  deterministicHint,
  useLlm = true,
}: {
  rawText: string;
  source: string;
  storeName?: string | null;
  roomTitle?: string | null;
  senderName?: string | null;
  deterministicHint?: Partial<ProposedQuestDraft>;
  useLlm?: boolean;
}): Promise<ProposedQuestDraft> {
  const fallback = buildFallbackProposedQuest(rawText, deterministicHint);
  const disabledReason = useLlm ? llmDisabledReason() : "LLM 사용 안 함";
  if (disabledReason) return fallback;

  try {
    const response = await createOpenAiJsonResponse<OpenAiProposedQuestOutput>({
      taskName: "proposed_quest_draft",
      instructions: [
        "너는 BizHigh SalesOps의 퀘스트 제안 분류기다.",
        "카톡 알림/메모/복붙 내용을 사람이 승인할 퀘스트 후보로 정리한다.",
        "자동 실행하지 않고 proposed_actions 제안함에 들어갈 초안만 만든다.",
        "원문에 없는 날짜, 담당자, 약속, 금액을 만들지 않는다.",
        "담당자 지정은 별도 로직이 하므로 제목/내용/우선순위/마감 후보만 판단한다.",
        "업무 액션이 약하면 confidence를 낮춘다.",
        "due_date는 YYYY-MM-DD만 사용하고 확정 불가하면 빈 문자열로 둔다.",
      ].join("\n"),
      input: JSON.stringify({
        source,
        store_name: storeName ?? null,
        room_title: roomTitle ?? null,
        sender_name: senderName ?? null,
        raw_text: rawText,
        deterministic_hint: deterministicHint ?? null,
      }),
      schema: PROPOSED_QUEST_SCHEMA,
      maxOutputTokens: 700,
    });
    const parsed = normalizeOpenAiProposedQuest(response.parsed);
    if (!parsed) return fallback;
    return {
      ...parsed,
      provider: response.provider,
      model: response.model,
      parser: `${response.provider}_structured_v1`,
    };
  } catch {
    return {
      ...fallback,
      model: null,
      parser: "fallback_after_llm_error",
    };
  }
}

function buildFallbackProposedQuest(
  rawText: string,
  hint?: Partial<ProposedQuestDraft>,
): ProposedQuestDraft {
  const dueDate = hint?.dueDate ?? inferDueDate(rawText);
  const priority = hint?.priority ?? inferPriority(rawText);
  const title = hint?.title ?? compactTitle(rawText);
  return {
    title,
    description: hint?.description ?? (rawText.length > title.length ? rawText : null),
    priority,
    dueDate,
    confidence: hint?.confidence ?? 0.62,
    reasoning: hint?.reasoning ?? inferReasoning(rawText, dueDate, priority),
    actionCategory: hint?.actionCategory ?? inferActionCategory(rawText),
    provider: "fallback",
    model: null,
    parser: "deterministic_v2",
  };
}

function normalizeOpenAiProposedQuest(
  value: OpenAiProposedQuestOutput | null,
): Omit<ProposedQuestDraft, "provider" | "model" | "parser"> | null {
  const title = typeof value?.title === "string" ? value.title.trim() : "";
  const description =
    typeof value?.description === "string" && value.description.trim()
      ? value.description.trim()
      : null;
  const priority =
    value?.priority === "urgent" || value?.priority === "low" ? value.priority : "normal";
  const dueDate =
    typeof value?.due_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.due_date)
      ? value.due_date
      : null;
  const confidence =
    typeof value?.confidence === "number"
      ? Math.min(0.95, Math.max(0.05, value.confidence))
      : 0.7;
  const reasoning = typeof value?.reasoning === "string" ? value.reasoning.trim() : "";
  const actionCategory =
    typeof value?.action_category === "string" && value.action_category.trim()
      ? value.action_category.trim()
      : "general_action";
  if (!title || !reasoning) return null;
  return {
    title,
    description,
    priority,
    dueDate,
    confidence,
    reasoning,
    actionCategory,
  };
}

function todayAtLocalMidnight() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isoDateFromOffset(days: number) {
  const d = todayAtLocalMidnight();
  d.setDate(d.getDate() + days);
  return formatLocalDate(d);
}

function inferDueDate(text: string): string | null {
  const iso = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];

  const slash = text.match(/\b(\d{1,2})[./](\d{1,2})\b/);
  if (slash) {
    const year = new Date().getFullYear();
    const month = slash[1].padStart(2, "0");
    const day = slash[2].padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  const weekday = text.match(/(이번|다음|차주)?\s*(월|화|수|목|금|토|일)요일?/);
  if (weekday?.[2]) {
    const target = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 }[
      weekday[2] as "일" | "월" | "화" | "수" | "목" | "금" | "토"
    ];
    const current = todayAtLocalMidnight().getDay();
    let diff = (target - current + 7) % 7;
    if (diff === 0) diff = 7;
    if (weekday[1] === "다음" || weekday[1] === "차주") diff += 7;
    return isoDateFromOffset(diff);
  }

  if (/(오늘|금일|당일)/.test(text)) return isoDateFromOffset(0);
  if (/(내일|익일)/.test(text)) return isoDateFromOffset(1);
  if (/모레/.test(text)) return isoDateFromOffset(2);
  if (/(이번\s*주|주말)/.test(text)) return isoDateFromOffset(7);
  if (/(다음\s*주|차주)/.test(text)) return isoDateFromOffset(10);
  return null;
}

function inferPriority(text: string): QuestPriority {
  if (/(긴급|급함|급하게|바로|즉시|오늘|금일|당일|누락|클레임|불만|마감|ASAP|빨리|안됨|안 돼)/i.test(text)) {
    return "urgent";
  }
  if (/(나중|천천히|낮음|참고|보류)/.test(text)) return "low";
  return "normal";
}

function compactTitle(text: string) {
  const firstLine =
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) ?? text;
  const inferred = inferActionTitle(text);
  const base = inferred ?? firstLine;
  return base.length > 72 ? `${base.slice(0, 72)}...` : base;
}

function inferReasoning(text: string, dueDate: string | null, priority: QuestPriority) {
  const reasons: string[] = [];
  if (dueDate) reasons.push(`마감 후보 ${dueDate}`);
  if (priority === "urgent") reasons.push("긴급 키워드 감지");
  if (priority === "low") reasons.push("낮은 우선순위 키워드 감지");
  if (/(요청|보내|전송|송부|컨펌|확인|검토|검수|승인|자료|일정|리마인드|답변)/.test(text)) {
    reasons.push("업무 액션 표현 감지");
  }
  reasons.push(`분류 ${inferActionCategory(text)}`);
  return reasons.join(" · ");
}

function inferActionCategory(text: string) {
  if (/(리뷰|답글|대댓글|원고).*(컨펌|확인|검수|승인|봐주|봐\s*주)/.test(text)) {
    return "review_approval";
  }
  if (/(원고|아티클|콘텐츠).*(컨펌|확인|검수|승인|봐주|봐\s*주)/.test(text)) {
    return "content_approval";
  }
  if (/(일정|시간|예약|방문|미팅|가능\s*시간)/.test(text)) return "schedule_check";
  if (/(자료|사진|메뉴|사업자|링크|시트|드라이브|파일|첨부|업로드)/.test(text)) {
    return "material_request";
  }
  if (/(권한|초대|GBP|구글\s*프로필|구글\s*비즈니스|소유자)/i.test(text)) {
    return "access_request";
  }
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
