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
  models: ModelInfo[];
  defaultHeaders?: Record<string, string>;
}

export const providers: Provider[] = [
  {
    id: "fireworks",
    name: "Fireworks AI",
    baseURL: "https://api.fireworks.ai/inference/v1",
    defaultModel: "accounts/fireworks/models/glm-5p1",
    models: [
      {
        id: "accounts/fireworks/models/glm-5p1",
        name: "GLM 5.1",
        description: "202K ctx",
        maxTokens: 16384,
        contextLength: 202752,
      },
      {
        id: "accounts/fireworks/models/kimi-k2p6",
        name: "Kimi K2.6",
        description: "262K ctx · reasoning",
        maxTokens: 32768,
        contextLength: 262000,
      },
      {
        id: "accounts/fireworks/models/deepseek-v4-pro",
        name: "DeepSeek V4 Pro",
        description: "1M ctx · reasoning",
        maxTokens: 4096,
        contextLength: 1000000,
      },
      {
        id: "accounts/fireworks/models/qwen3p6-plus",
        name: "Qwen3.6 Plus",
        description: "1M ctx",
        maxTokens: 16384,
        contextLength: 1000000,
      },
      {
        id: "accounts/fireworks/models/minimax-m2p7",
        name: "MiniMax M2.7",
        description: "196K ctx",
        maxTokens: 16384,
        contextLength: 196000,
      },
    ],
  },
  {
    id: "modal",
    name: "Modal",
    baseURL: "https://api.us-west-2.modal.direct/v1",
    defaultModel: "zai-org/GLM-5.1-FP8",
    models: [
      {
        id: "zai-org/GLM-5.1-FP8",
        name: "GLM 5.1",
        description: "202K ctx",
        maxTokens: 16384,
        contextLength: 202752,
      },
    ],
  },
  {
    id: "nvidia-nim",
    name: "NVIDIA NIM",
    baseURL: "https://integrate.api.nvidia.com/v1",
    defaultModel: "minimaxai/minimax-m2.7",
    models: [
      {
        id: "minimaxai/minimax-m2.7",
        name: "Minimax 2.7",
        description: "196K ctx",
        maxTokens: 16384,
        contextLength: 196608,
      },
      {
        id: "z-ai/glm4.7",
        name: "GLM 4.7",
        description: "200K ctx",
        maxTokens: 16384,
        contextLength: 200000,
      },
      {
        id: "moonshotai/kimi-k2.5",
        name: "Kimi K2.5",
        description: "200K ctx",
        maxTokens: 16384,
        contextLength: 200000,
      },
    ],
  },
  {
    id: "air-force",
    name: "Air Force",
    baseURL: "https://api.airforce/v1",
    defaultModel: "claude-sonnet-4.6",
    models: [
      {
        id: "claude-sonnet-4.6",
        name: "Claude Sonnet 4.6",
        description: "1M ctx",
        maxTokens: 16384,
        contextLength: 1000000,
      },
    ],
  },
  {
    id: "swiftrouter",
    name: "SwiftRouter",
    baseURL: "https://api.swiftrouter.com/v1",
    defaultModel: "gpt-5.4",
    models: [
      {
        id: "gpt-5.4",
        name: "GPT-5.4",
        description: "273K ctx · reasoning",
        maxTokens: 128000,
        contextLength: 273000,
      },
      {
        id: "gpt-5.5",
        name: "GPT-5.5",
        description: "1M ctx · reasoning",
        maxTokens: 128000,
        contextLength: 1000000,
      },
      {
        id: "gpt-5.4-mini",
        name: "GPT-5.4 Mini",
        description: "400K ctx · reasoning",
        maxTokens: 128000,
        contextLength: 400000,
      },
      {
        id: "gpt-5.3-codex",
        name: "GPT-5.3 Codex",
        description: "400K ctx · reasoning · code",
        maxTokens: 128000,
        contextLength: 400000,
      },
    ],
  },
  {
    id: "agentrouter",
    name: "AgentRouter",
    baseURL: "http://localhost:9777/v1",
    defaultModel: "claude-opus-4-6",
    defaultHeaders: {
      "User-Agent": "Kilo-Code/4.99.1",
      "HTTP-Referer": "https://kilocode.ai",
      "X-Title": "Kilo Code",
    },
    models: [
      {
        id: "claude-opus-4-6",
        name: "Claude Opus 4.6",
        description: "1M ctx",
        maxTokens: 16384,
        contextLength: 1000000,
      },
      {
        id: "claude-opus-4-7",
        name: "Claude Opus 4.7",
        description: "1M ctx",
        maxTokens: 16384,
        contextLength: 1000000,
      },
      {
        id: "deepseek-r1-0528",
        name: "DeepSeek R1 0528",
        description: "1M ctx · reasoning",
        maxTokens: 16384,
        contextLength: 1000000,
      },
      {
        id: "deepseek-v3.1",
        name: "DeepSeek V3.1",
        description: "1M ctx",
        maxTokens: 16384,
        contextLength: 1000000,
      },
      {
        id: "deepseek-v3.2",
        name: "DeepSeek V3.2",
        description: "1M ctx",
        maxTokens: 16384,
        contextLength: 1000000,
      },
      {
        id: "glm-4.5",
        name: "GLM 4.5",
        description: "1M ctx",
        maxTokens: 16384,
        contextLength: 1000000,
      },
      {
        id: "glm-4.6",
        name: "GLM 4.6",
        description: "1M ctx",
        maxTokens: 16384,
        contextLength: 1000000,
      },
      {
        id: "glm-5.1",
        name: "GLM 5.1",
        description: "1M ctx",
        maxTokens: 16384,
        contextLength: 1000000,
      },
    ],
  },
  {
    id: "canopywave",
    name: "CanopyWave",
    baseURL: "https://inference.canopywave.io/v1",
    defaultModel: "xiaomimimo/mimo-v2.5",
    models: [
      {
        id: "xiaomimimo/mimo-v2.5",
        name: "Mimo V2.5",
        description: "reasoning",
        maxTokens: 16384,
      },
    ],
  },
];

// --- Dynamic model fetching from provider API ---

interface ApiModel {
  id: string;
  context_length?: number;
  max_model_tokens?: number;
  object?: string;
  owned_by?: string;
  kind?: string;
  supports_chat?: boolean;
  supports_tools?: boolean;
  contextWindow?: number;
  architecture?: {
    modality?: string;
    tokenizer?: string;
    instruct_type?: string | null;
  };
  pricing?: {
    prompt?: string;
    completion?: string;
  };
}

const SKIP_PATTERNS = [
  "embed", "whisper", "tts", "dall-e", "flux", "image",
  "stable-diffusion", "midjourney", "dpo", "rlhf",
  "instruct-beta", "moderation", "audio",
];

function isChatModel(m: ApiModel): boolean {
  const id = m.id.toLowerCase();
  if (m.supports_chat === false) return false;
  for (const pat of SKIP_PATTERNS) {
    if (id.includes(pat)) return false;
  }
  if (m.object === "model" && (id.includes("text-") || id.includes("babbage") || id.includes("davinci"))) {
    return false;
  }
  if (m.supports_chat === true || m.supports_tools === true) return true;
  if (m.architecture?.instruct_type || m.architecture?.modality?.includes("text")) return true;
  return true;
}

export async function fetchModelsFromAPI(
  baseURL: string,
  apiKey: string,
  headers?: Record<string, string>,
): Promise<ModelInfo[]> {
  try {
    const url = `${baseURL.replace(/\/$/, "")}/models`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...headers,
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return [];

    const json = (await res.json()) as { data?: ApiModel[] };
    const raw = json.data || [];
    if (!Array.isArray(raw) || raw.length === 0) return [];

    const chatModels = raw
      .filter(isChatModel)
      .sort((a: ApiModel, b: ApiModel) => a.id.localeCompare(b.id));

    return chatModels.map((m: ApiModel) => {
      const ctx = m.context_length || m.contextWindow || undefined;
      const name = m.id.split("/").pop() || m.id;
      const parts: string[] = [];
      if (ctx) parts.push(formatContextInfo(ctx));
      if (m.supports_tools) parts.push("tools");
      return {
        id: m.id,
        name,
        description: parts.length > 0 ? parts.join(" · ") : "chat model",
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
  if (baseURL.includes("modal.direct")) return getProvider("modal");
  if (baseURL.includes("integrate.api.nvidia")) return getProvider("nvidia-nim");
  if (baseURL.includes("api.airforce")) return getProvider("air-force");
  if (baseURL.includes("swiftrouter")) return getProvider("swiftrouter");
  if (baseURL.includes("localhost:9777") || baseURL.includes("agentrouter")) return getProvider("agentrouter");
  if (baseURL.includes("canopywave")) return getProvider("canopywave");
  return undefined;
}
