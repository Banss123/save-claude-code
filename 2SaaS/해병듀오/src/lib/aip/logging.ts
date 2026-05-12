import "server-only";

import { createHash } from "node:crypto";
import type { Database, Json } from "@/lib/database.types";

type AipExecutionLogInsert =
  Database["public"]["Tables"]["aip_execution_logs"]["Insert"];

type AipLogClient = {
  from(table: "aip_execution_logs"): {
    insert(
      payload: AipExecutionLogInsert | AipExecutionLogInsert[],
    ): PromiseLike<{ error: { message: string } | null }>;
  };
};

export async function insertAipExecutionLog(
  supabase: AipLogClient,
  input: {
    storeId?: string | null;
    questId?: string | null;
    proposedActionId?: string | null;
    actorId?: string | null;
    actionType: "forwarding_draft" | "proposed_quest_draft";
    provider: "openai" | "kimi" | "fallback";
    model?: string | null;
    contextVersion?: string | null;
    status?: "success" | "fallback" | "error";
    rawInput?: string | null;
    rawOutput?: string | null;
    reasoning?: string | null;
    riskFlags?: string[];
    metadata?: Record<string, Json>;
  },
) {
  const payload: AipExecutionLogInsert = {
    store_id: input.storeId ?? null,
    quest_id: input.questId ?? null,
    proposed_action_id: input.proposedActionId ?? null,
    actor_id: input.actorId ?? null,
    action_type: input.actionType,
    provider: input.provider,
    model: input.model ?? null,
    context_version: input.contextVersion ?? null,
    status:
      input.status ?? (input.provider === "fallback" ? "fallback" : "success"),
    input_hash: input.rawInput ? hashText(input.rawInput) : null,
    output_hash: input.rawOutput ? hashText(input.rawOutput) : null,
    input_preview: previewText(input.rawInput, 500),
    output_preview: previewText(input.rawOutput, 700),
    reasoning: input.reasoning ?? null,
    risk_flags: input.riskFlags ?? [],
    metadata: input.metadata ?? {},
  };

  const { error } = await supabase.from("aip_execution_logs").insert(payload);
  if (error) {
    console.error("[AIP log] insert failed", error.message);
  }
}

function hashText(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function previewText(value: string | null | undefined, maxLength: number) {
  if (!value) return null;
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength) || null;
}
