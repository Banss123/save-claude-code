import "server-only";

import type { AipContext, AipKakaoMessageSummary } from "@/lib/aip/context";
import {
  createOpenAiJsonResponse,
  llmDisabledReason,
  type AipLlmProvider,
} from "@/lib/aip/openai";

export type ForwardingDraft = {
  message: string;
  reasoning: string;
  provider: AipLlmProvider;
  model: string | null;
  riskFlags: string[];
  usedContext: {
    toneProfile: boolean;
    recentKakaoCount: number;
    activeQuestCount: number;
  };
};

type OpenAiForwardingOutput = {
  message: string;
  reasoning: string;
  risk_flags: string[];
};

const FORWARDING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    message: { type: "string", minLength: 1, maxLength: 1200 },
    reasoning: { type: "string", minLength: 1, maxLength: 500 },
    risk_flags: {
      type: "array",
      items: { type: "string", maxLength: 120 },
      maxItems: 5,
    },
  },
  required: ["message", "reasoning", "risk_flags"],
};

export async function draftForwardingMessage({
  rawText,
  context,
}: {
  rawText: string;
  context: AipContext;
}): Promise<ForwardingDraft> {
  const fallback = buildFallbackForwardingDraft(rawText, context);
  const disabledReason = llmDisabledReason();
  if (disabledReason) return fallback;

  try {
    const response = await createOpenAiJsonResponse<OpenAiForwardingOutput>({
      taskName: "forwarding_draft",
      instructions: [
        "너는 BizHigh SalesOps의 내부 포워딩 어시스턴트다.",
        "영업자가 붙여넣은 본사/내부 내용을 업주에게 보낼 카카오톡 문안으로 바꾼다.",
        "반드시 한국어로 작성한다.",
        "AIP 컨텍스트의 매장별 toneProfile, samplePhrases, recentKakaoMessages 안의 내부 발신 톤을 우선 반영한다.",
        "업주가 중요하게 보는 포인트(ownerProfile.priority)를 반영한다.",
        "원문에 없는 일정, 금액, 약속, 성과를 만들지 않는다.",
        "연락처, 이메일, private URL을 새로 만들거나 추측하지 않는다.",
        "자동 전송 문구가 아니라 사람이 복사 전 검수할 초안이다.",
      ].join("\n"),
      input: JSON.stringify({
        raw_forwarding_text: rawText,
        aip_context: compactForwardingContext(context),
      }),
      schema: FORWARDING_SCHEMA,
      maxOutputTokens: 900,
    });
    const parsed = normalizeOpenAiForwarding(response.parsed);
    if (!parsed) return fallback;
    return {
      message: parsed.message,
      reasoning: parsed.reasoning,
      provider: response.provider,
      model: response.model,
      riskFlags: parsed.risk_flags,
      usedContext: contextUsage(context),
    };
  } catch (error) {
    return {
      ...fallback,
      riskFlags: [
        ...fallback.riskFlags,
        `LLM fallback: ${error instanceof Error ? error.message : "unknown"}`,
      ].slice(0, 5),
    };
  }
}

function compactForwardingContext(context: AipContext) {
  return {
    version: context.version,
    source: context.source,
    store: {
      name: context.store.name,
      typeLabel: context.store.typeLabel,
      status: context.store.status,
      currentRound: context.store.currentRound,
      mainKeyword: context.store.mainKeyword,
      assignedOwnerName: context.store.assignedOwnerName,
    },
    ownerProfile: context.ownerProfile,
    operatingSignals: context.operatingSignals,
    selectedQuest: context.selectedQuest,
    activeQuests: context.activeQuests.slice(0, 5),
    recentIssues: context.recentIssues.slice(0, 4),
    toneProfile: context.toneProfile,
    recentKakaoMessages: context.recentKakaoMessages.slice(0, 8),
    guardrails: context.guardrails,
  };
}

function normalizeOpenAiForwarding(value: OpenAiForwardingOutput | null) {
  const message = typeof value?.message === "string" ? value.message.trim() : "";
  const reasoning = typeof value?.reasoning === "string" ? value.reasoning.trim() : "";
  if (!message || !reasoning || message.length > 1400) return null;
  return {
    message,
    reasoning,
    risk_flags: Array.isArray(value?.risk_flags)
      ? value.risk_flags.filter((flag) => typeof flag === "string").slice(0, 5)
      : [],
  };
}

function buildFallbackForwardingDraft(rawText: string, context: AipContext): ForwardingDraft {
  const trimmed = rawText.trim();
  const ownerName = context.ownerProfile.ownerName ?? "사장님";
  const toneProfile = context.toneProfile;
  const recentKakao = context.recentKakaoMessages;
  const recentInternal = recentKakao.filter((message) => message.senderKind === "internal");
  const recentOwner = recentKakao.filter(
    (message) => message.senderKind === "owner" || message.senderKind === "unknown",
  );
  const latestInternalText = recentInternal[0]?.messageSnippet ?? "";
  const ownerAvgLength =
    recentOwner.length > 0
      ? recentOwner.reduce((sum, message) => sum + message.messageSnippet.length, 0) /
        recentOwner.length
      : null;
  const formal = toneProfile
    ? toneProfile.formalityLevel >= 4
    : context.ownerProfile.priority === "authority" ||
      /습니다|드립니다|부탁드립니다/.test(latestInternalText);
  const warm = toneProfile
    ? toneProfile.warmthLevel >= 4
    : context.ownerProfile.priority === "rapport" ||
      /ㅎㅎ|감사|좋습니다|편하게|~/.test(latestInternalText);
  const allowEmoji =
    (toneProfile?.emojiLevel ?? 0) > 0 ||
    (!toneProfile && /[\u{1F300}-\u{1FAFF}]/u.test(latestInternalText));
  const shortByContext =
    toneProfile?.messageLength === "short" ||
    (ownerAvgLength != null && ownerAvgLength <= 45);
  const greeting =
    cleanReusablePhrase(toneProfile?.samplePhrases[0]) ??
    (formal
      ? `${ownerName}, 안녕하십니까.`
      : warm
        ? `${ownerName} 안녕하세요~${allowEmoji ? " 😊" : ""}`
        : `${ownerName}, 안녕하세요.`);
  const closing = buildForwardingClosing({
    input: trimmed,
    formal,
    warm,
    allowEmoji,
    priority: context.ownerProfile.priority,
  });
  const body = buildForwardingBody(trimmed, {
    formal,
    warm,
    shortByContext,
    recentOwner,
  });

  return {
    message: shortByContext
      ? `${greeting}\n\n${trimmed}\n\n${closing}`
      : `${greeting}\n\n${body}\n\n${closing}`,
    reasoning: "룰 기반 포워딩 초안",
    provider: "fallback",
    model: null,
    riskFlags: [],
    usedContext: contextUsage(context),
  };
}

function buildForwardingClosing({
  input,
  formal,
  warm,
  allowEmoji,
  priority,
}: {
  input: string;
  formal: boolean;
  warm: boolean;
  allowEmoji: boolean;
  priority: string | null;
}) {
  if (/(일정|시간|언제|예약|방문|미팅)/.test(input)) {
    return formal
      ? "가능하신 일정 확인 부탁드립니다. 감사합니다."
      : `가능하신 일정 한번 확인 부탁드립니다${allowEmoji && warm ? " 🙏" : ""}`;
  }
  if (/(자료|사진|메뉴|사업자|링크|시트|드라이브|권한)/.test(input)) {
    return formal
      ? "자료 확인 후 전달 부탁드립니다. 감사합니다."
      : `확인 후 자료 전달 부탁드립니다${allowEmoji && warm ? " 🙏" : ""}`;
  }
  if (/(컨펌|확인|검수|승인|수정)/.test(input)) {
    return formal
      ? "검토 후 컨펌 부탁드립니다. 감사합니다."
      : `검토 후 컨펌 부탁드립니다${allowEmoji && warm ? " 🙏" : ""}`;
  }
  if (formal) return "확인 부탁드립니다. 감사합니다.";
  if (warm) return `확인 한번만 해주시면 감사하겠습니다${allowEmoji ? " 🙏" : ""}`;
  if (priority === "revenue") return "관련 내용 확인 후 답변 부탁드립니다.";
  return "확인 부탁드립니다.";
}

function buildForwardingBody(
  input: string,
  {
    formal,
    warm,
    shortByContext,
    recentOwner,
  }: {
    formal: boolean;
    warm: boolean;
    shortByContext: boolean;
    recentOwner: AipKakaoMessageSummary[];
  },
) {
  if (shortByContext) return input;
  const ownerAskedRecently = recentOwner.some((message) =>
    /[?？]|언제|어떻게|가능|될까요|되실까요|확인|요청|수정/.test(
      message.messageSnippet,
    ),
  );
  const contextLine = ownerAskedRecently
    ? "최근 말씀주신 내용도 같이 참고해서 안내드립니다."
    : null;
  if (formal) {
    return [contextLine, "아래 사항 안내드립니다.", "", input].filter(Boolean).join("\n");
  }
  if (warm) {
    return [contextLine, input, "", "위 내용 한번 봐주세요!"].filter(Boolean).join("\n");
  }
  return [contextLine, input].filter(Boolean).join("\n\n");
}

function cleanReusablePhrase(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 80) return null;
  if (/[?？]/.test(trimmed)) return null;
  return trimmed;
}

function contextUsage(context: AipContext) {
  return {
    toneProfile: Boolean(context.toneProfile),
    recentKakaoCount: context.recentKakaoMessages.length,
    activeQuestCount: context.activeQuests.length,
  };
}
