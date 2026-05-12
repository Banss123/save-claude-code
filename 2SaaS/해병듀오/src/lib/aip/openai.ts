import "server-only";

type JsonSchema = Record<string, unknown>;

type OpenAiJsonInput = {
  taskName: string;
  instructions: string;
  input: string;
  schema: JsonSchema;
  maxOutputTokens?: number;
};

type LlmProviderConfig =
  | {
      provider: "openai";
      apiKey: string;
      model: string;
    }
  | {
      provider: "kimi";
      apiKey: string;
      model: string;
      baseUrl: string;
      thinking: "enabled" | "disabled";
    };

type OpenAiResponsesPayload = {
  model: string;
  instructions: string;
  input: Array<{ role: "user"; content: string }>;
  text: {
    format: {
      type: "json_schema";
      name: string;
      strict: true;
      schema: JsonSchema;
    };
  };
  max_output_tokens: number;
  store: false;
};

type OpenAiResponse = {
  output_text?: unknown;
  output?: unknown;
  error?: { message?: string };
};

type KimiChatPayload = {
  model: string;
  messages: Array<{ role: "system" | "user"; content: string }>;
  response_format: {
    type: "json_schema";
    json_schema: {
      name: string;
      strict: true;
      schema: JsonSchema;
    };
  };
  max_completion_tokens: number;
  thinking?: { type: "enabled" | "disabled" };
};

type KimiChatResponse = {
  model?: unknown;
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
  error?: { message?: string };
};

export type AipLlmProvider = "openai" | "kimi" | "fallback";

export function llmDisabledReason() {
  if (process.env.AIP_DISABLE_LLM === "true") return "AIP_DISABLE_LLM=true";
  const config = resolveLlmProviderConfig();
  if (!config) {
    const requestedProvider = normalizedProviderPreference();
    if (requestedProvider === "kimi") return "KIMI_API_KEY 또는 MOONSHOT_API_KEY 없음";
    if (requestedProvider === "openai") return "OPENAI_API_KEY 없음";
    return "KIMI_API_KEY/MOONSHOT_API_KEY 또는 OPENAI_API_KEY 없음";
  }
  return null;
}

export async function createOpenAiJsonResponse<T>({
  taskName,
  instructions,
  input,
  schema,
  maxOutputTokens = 900,
}: OpenAiJsonInput): Promise<{
  parsed: T;
  provider: Exclude<AipLlmProvider, "fallback">;
  model: string;
  rawText: string;
}> {
  if (process.env.AIP_DISABLE_LLM === "true") throw new Error("AIP_DISABLE_LLM=true");
  const config = resolveLlmProviderConfig();
  if (!config) throw new Error(llmDisabledReason() ?? "LLM provider 설정 없음");
  const schemaName = safeSchemaName(taskName);

  if (config.provider === "kimi") {
    return createKimiJsonResponse<T>({
      config,
      taskName: schemaName,
      instructions,
      input,
      schema,
      maxOutputTokens,
    });
  }

  return createOpenAiResponsesJsonResponse<T>({
    config,
    taskName: schemaName,
    instructions,
    input,
    schema,
    maxOutputTokens,
  });
}

async function createOpenAiResponsesJsonResponse<T>({
  config,
  taskName,
  instructions,
  input,
  schema,
  maxOutputTokens,
}: OpenAiJsonInput & { config: Extract<LlmProviderConfig, { provider: "openai" }> }) {
  const payload: OpenAiResponsesPayload = {
    model: config.model,
    instructions,
    input: [{ role: "user", content: input }],
    text: {
      format: {
        type: "json_schema",
        name: taskName,
        strict: true,
        schema,
      },
    },
    max_output_tokens: maxOutputTokens ?? 900,
    store: false,
  };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = (await response.json().catch(() => ({}))) as OpenAiResponse;
  if (!response.ok) {
    throw new Error(data.error?.message || `OpenAI 요청 실패 (${response.status})`);
  }

  const rawText = extractOutputText(data);
  if (!rawText) throw new Error("OpenAI 응답에 output_text가 없습니다.");

  return {
    parsed: JSON.parse(rawText) as T,
    provider: "openai" as const,
    model: config.model,
    rawText,
  };
}

async function createKimiJsonResponse<T>({
  config,
  taskName,
  instructions,
  input,
  schema,
  maxOutputTokens,
}: OpenAiJsonInput & { config: Extract<LlmProviderConfig, { provider: "kimi" }> }) {
  const payload: KimiChatPayload = {
    model: config.model,
    messages: [
      { role: "system", content: instructions },
      { role: "user", content: input },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: taskName,
        strict: true,
        schema,
      },
    },
    max_completion_tokens: maxOutputTokens ?? 900,
  };

  if (shouldSendKimiThinking(config.model)) {
    payload.thinking = { type: config.thinking };
  }

  const response = await fetch(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = (await response.json().catch(() => ({}))) as KimiChatResponse;
  if (!response.ok) {
    throw new Error(data.error?.message || `Kimi 요청 실패 (${response.status})`);
  }

  const rawText = extractKimiOutputText(data);
  if (!rawText) throw new Error("Kimi 응답에 choices[0].message.content가 없습니다.");

  return {
    parsed: JSON.parse(rawText) as T,
    provider: "kimi" as const,
    model: typeof data.model === "string" ? data.model : config.model,
    rawText,
  };
}

function resolveLlmProviderConfig(): LlmProviderConfig | null {
  const provider = normalizedProviderPreference();
  const kimiKey = process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY;
  const openAiKey = process.env.OPENAI_API_KEY;

  if (provider === "kimi") return kimiKey ? kimiConfig(kimiKey) : null;
  if (provider === "openai") return openAiKey ? openAiConfig(openAiKey) : null;
  if (kimiKey) return kimiConfig(kimiKey);
  if (openAiKey) return openAiConfig(openAiKey);
  return null;
}

function normalizedProviderPreference(): "auto" | "openai" | "kimi" {
  const provider = (process.env.AIP_PROVIDER ?? "auto").trim().toLowerCase();
  if (provider === "openai" || provider === "kimi") return provider;
  return "auto";
}

function kimiConfig(apiKey: string): Extract<LlmProviderConfig, { provider: "kimi" }> {
  const thinking = process.env.KIMI_THINKING === "enabled" ? "enabled" : "disabled";
  return {
    provider: "kimi",
    apiKey,
    model: process.env.KIMI_MODEL || process.env.MOONSHOT_MODEL || process.env.AIP_MODEL || "kimi-k2.5",
    baseUrl: process.env.KIMI_BASE_URL || "https://api.moonshot.ai/v1",
    thinking,
  };
}

function openAiConfig(apiKey: string): Extract<LlmProviderConfig, { provider: "openai" }> {
  return {
    provider: "openai",
    apiKey,
    model: process.env.OPENAI_MODEL || process.env.AIP_MODEL || "gpt-5-mini",
  };
}

function safeSchemaName(taskName: string) {
  return taskName.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64) || "aip_json";
}

function shouldSendKimiThinking(model: string) {
  return /kimi-k2\.6|kimi-k2\.5/.test(model) || Boolean(process.env.KIMI_THINKING);
}

function extractOutputText(data: OpenAiResponse) {
  if (typeof data.output_text === "string") return data.output_text;
  if (!Array.isArray(data.output)) return "";

  const chunks: string[] = [];
  for (const item of data.output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const text = (part as { text?: unknown }).text;
      if (typeof text === "string") chunks.push(text);
    }
  }
  return chunks.join("").trim();
}

function extractKimiOutputText(data: KimiChatResponse) {
  const content = data.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  return "";
}
