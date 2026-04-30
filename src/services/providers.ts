export interface ModelInfo {
  id: string;
  name: string;
  description: string;
  maxTokens: number;
  contextLength?: number;
}

export interface Provider {
  id: string;
  name: string;
  baseURL: string;
  defaultModel: string;
  models: ModelInfo[]; // fallback static list
}

export const providers: Provider[] = [
  {
    id: "fireworks",
    name: "Fireworks AI",
    baseURL: "https://api.fireworks.ai/inference/v1",
    defaultModel: "accounts/fireworks/models/kimi-k2p6",
    models: [
      {
        id: "accounts/fireworks/models/kimi-k2p6",
        name: "Kimi K2.6",
        description: "Reasoning, code, multimodal",
        maxTokens: 32768,
        contextLength: 262144,
      },
    ],
  },
  {
    id: "openai",
    name: "OpenAI",
    baseURL: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    models: [
      {
        id: "gpt-4o",
        name: "GPT-4o",
        description: "Omni general model",
        maxTokens: 16384,
        contextLength: 128000,
      },
      {
        id: "gpt-4o-mini",
        name: "GPT-4o Mini",
        description: "Fast & affordable",
        maxTokens: 16384,
        contextLength: 128000,
      },
    ],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    baseURL: "https://api.anthropic.com/v1",
    defaultModel: "claude-sonnet-4-20250514",
    models: [
      {
        id: "claude-sonnet-4-20250514",
        name: "Claude Sonnet 4",
        description: "Balanced coding/reasoning",
        maxTokens: 16384,
        contextLength: 200000,
      },
      {
        id: "claude-3-5-haiku-latest",
        name: "Claude 3.5 Haiku",
        description: "Fast & lightweight",
        maxTokens: 8192,
        contextLength: 200000,
      },
    ],
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    baseURL: "https://openrouter.ai/api/v1",
    defaultModel: "anthropic/claude-3.5-sonnet",
    models: [
      {
        id: "anthropic/claude-3.5-sonnet",
        name: "Claude 3.5 Sonnet",
        description: "Anthropic via OpenRouter",
        maxTokens: 16384,
        contextLength: 200000,
      },
      {
        id: "openai/gpt-4o-mini",
        name: "GPT-4o Mini",
        description: "OpenAI via OpenRouter",
        maxTokens: 16384,
        contextLength: 128000,
      },
      {
        id: "google/gemini-2.0-flash-001",
        name: "Gemini 2.0 Flash",
        description: "Google via OpenRouter",
        maxTokens: 16384,
        contextLength: 1048576,
      },
    ],
  },
];

// --- Dynamic model fetching from provider API ---

interface ApiModel {
  id: string;
  context_length?: number;
  max_model_tokens?: number;
  // OpenAI-style
  object?: string;
  owned_by?: string;
  // Fireworks-style
  kind?: string;
  supports_chat?: boolean;
  supports_tools?: boolean;
  contextWindow?: number;
}

export async function fetchModelsFromAPI(
  baseURL: string,
  apiKey: string,
): Promise<ModelInfo[]> {
  try {
    const url = `${baseURL.replace(/\/$/, "")}/models`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return [];

    const json = (await res.json()) as { data?: ApiModel[] };
    const raw = json.data || [];
    if (!Array.isArray(raw) || raw.length === 0) return [];

    // Filter to chat models only, sort by id
    const chatModels = raw
      .filter((m: ApiModel) => {
        // Must support chat (explicitly or implicitly)
        if (m.supports_chat === false) return false;
        // Must support chat or tools (filters out PEFT/embedding/image models)
        if (m.supports_chat !== true && m.supports_tools !== true) return false;
        // Skip known non-chat
        const id = m.id.toLowerCase();
        if (
          id.includes("embed") ||
          id.includes("whisper") ||
          id.includes("tts") ||
          id.includes("dall-e") ||
          id.includes("flux") ||
          id.includes("image")
        )
          return false;
        return true;
      })
      .sort((a: ApiModel, b: ApiModel) => a.id.localeCompare(b.id));

    return chatModels.map((m: ApiModel) => {
      const ctx = m.context_length || m.contextWindow || undefined;
      // Pretty name: strip provider prefix
      const name = m.id.split("/").pop() || m.id;
      return {
        id: m.id,
        name,
        description:
          formatContextInfo(ctx) + (m.supports_tools ? " · tools" : ""),
        maxTokens: m.max_model_tokens || 16384,
        contextLength: ctx,
      };
    });
  } catch {
    return [];
  }
}

function formatContextInfo(ctx?: number): string {
  if (!ctx) return "";
  if (ctx >= 1_000_000) return `${(ctx / 1_000_000).toFixed(1)}M ctx`;
  if (ctx >= 1000) return `${Math.round(ctx / 1000)}K ctx`;
  return `${ctx} ctx`;
}

export function getProvider(id: string): Provider | undefined {
  return providers.find((p) => p.id === id);
}

export function getProviderByBaseURL(baseURL: string): Provider | undefined {
  return providers.find(
    (p) => baseURL.includes(p.baseURL) || p.baseURL.includes(baseURL),
  );
}

export function getModelInfo(
  providerId: string,
  modelId: string,
): ModelInfo | undefined {
  const provider = getProvider(providerId);
  return provider?.models.find((m) => m.id === modelId);
}

export function detectProvider(baseURL: string): Provider | undefined {
  if (baseURL.includes("fireworks")) return getProvider("fireworks");
  if (baseURL.includes("api.openai.com")) return getProvider("openai");
  if (baseURL.includes("api.anthropic.com")) return getProvider("anthropic");
  if (baseURL.includes("openrouter.ai")) return getProvider("openrouter");
  return undefined;
}
