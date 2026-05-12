"use server";

import { createClient } from "@/lib/supabase/server";
import { getAipContextForStore } from "@/lib/aip/context";
import { draftForwardingMessage } from "@/lib/aip/forwarding";
import { insertAipExecutionLog } from "@/lib/aip/logging";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type GenerateForwardingDraftResult =
  | { ok: false; error: string }
  | {
      ok: true;
      draft: string;
      provider: "openai" | "kimi" | "fallback";
      model: string | null;
      reasoning: string;
      riskFlags: string[];
      usedContext: {
        toneProfile: boolean;
        recentKakaoCount: number;
        activeQuestCount: number;
      };
    };

export async function generateForwardingDraftAction(input: {
  storeId: string;
  rawText: string;
}): Promise<GenerateForwardingDraftResult> {
  if (!UUID_RE.test(input.storeId)) {
    return { ok: false, error: "매장 ID 형식이 올바르지 않습니다." };
  }
  const rawText = input.rawText.trim();
  if (!rawText) return { ok: false, error: "포워딩할 내용을 입력해주세요." };
  if (rawText.length > 4000) {
    return { ok: false, error: "포워딩 내용은 4,000자 이하로 입력해주세요." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const context = await getAipContextForStore(input.storeId);
  if (!context) return { ok: false, error: "매장 컨텍스트를 찾을 수 없습니다." };

  const draft = await draftForwardingMessage({ rawText, context });
  await insertAipExecutionLog(supabase, {
    storeId: context.store.id,
    actorId: user.id,
    actionType: "forwarding_draft",
    provider: draft.provider,
    model: draft.model,
    contextVersion: context.version,
    rawInput: rawText,
    rawOutput: draft.message,
    reasoning: draft.reasoning,
    riskFlags: draft.riskFlags,
    metadata: {
      used_context: {
        tone_profile: draft.usedContext.toneProfile,
        recent_kakao_count: draft.usedContext.recentKakaoCount,
        active_quest_count: draft.usedContext.activeQuestCount,
      },
      owner_priority: context.ownerProfile.priority,
    },
  });
  return {
    ok: true,
    draft: draft.message,
    provider: draft.provider,
    model: draft.model,
    reasoning: draft.reasoning,
    riskFlags: draft.riskFlags,
    usedContext: draft.usedContext,
  };
}
