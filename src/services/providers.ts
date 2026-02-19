export interface ModelInfo {
  id: string;
  name: string;
  description: string;
  maxTokens: number;
}

export interface Provider {
  id: string;
  name: string;
  baseURL: string;
  models: ModelInfo[];
  defaultModel: string;
}

export const providers: Provider[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    models: [
      { id: 'gpt-5', name: 'GPT-5', description: 'Frontier reasoning', maxTokens: 16384 },
      { id: 'gpt-5-mini', name: 'GPT-5 Mini', description: 'Fast & strong default', maxTokens: 16384 },
      { id: 'gpt-4o', name: 'GPT-4o', description: 'Omni general model', maxTokens: 16384 },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Cost-efficient', maxTokens: 16384 },
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    baseURL: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-3-5-sonnet-latest',
    models: [
      { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', description: 'Balanced coding/reasoning', maxTokens: 16384 },
      { id: 'claude-3-5-sonnet-latest', name: 'Claude 3.5 Sonnet', description: 'Reliable coding assistant', maxTokens: 16384 },
      { id: 'claude-3-5-haiku-latest', name: 'Claude 3.5 Haiku', description: 'Fast & lightweight', maxTokens: 16384 },
    ],
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    baseURL: 'https://openrouter.ai/api/v1',
    defaultModel: 'anthropic/claude-3.5-sonnet',
    models: [
      { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', description: 'Anthropic via OpenRouter', maxTokens: 16384 },
      { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', description: 'OpenAI via OpenRouter', maxTokens: 16384 },
      { id: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash', description: 'Google via OpenRouter', maxTokens: 16384 },
      { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B', description: 'Open-source strong baseline', maxTokens: 16384 },
    ],
  },
  {
    id: 'nvidia',
    name: 'NVIDIA NIM',
    baseURL: 'https://integrate.api.nvidia.com/v1',
    defaultModel: 'z-ai/glm4.7',
    models: [
      { id: 'z-ai/glm5', name: 'GLM-5 744B', description: 'MoE reasoning model', maxTokens: 16384 },
      { id: 'z-ai/glm4.7', name: 'GLM-4.7', description: 'Multilingual agentic coding', maxTokens: 16384 },
      { id: 'kimi-k2.5', name: 'Kimi K2.5', description: 'Multimodal MoE', maxTokens: 16384 },
      { id: 'deepseek-ai/deepseek-v3_2', name: 'DeepSeek V3.2', description: '685B reasoning LLM', maxTokens: 16384 },
      { id: 'deepseek-ai/deepseek-v3_1', name: 'DeepSeek V3.1', description: 'Hybrid reasoning', maxTokens: 16384 },
      { id: 'nvidia/llama-3_3-nemotron-super-49b-v1_5', name: 'Nemotron Super 49B', description: 'Llama 3.3 Nemotron reasoning', maxTokens: 16384 },
      { id: 'nvidia/nemotron-3-nano-30b-a3b', name: 'Nemotron Nano 30B', description: 'MoE model', maxTokens: 16384 },
      { id: 'nvidia/nvidia-nemotron-nano-9b-v2', name: 'Nemotron Nano 9B v2', description: 'Compact reasoning', maxTokens: 16384 },
      { id: 'qwen/qwen3.5-397b-a17b', name: 'Qwen 3.5 397B', description: 'Agentic VLM', maxTokens: 16384 },
      { id: 'qwen/qwen3-coder-480b-a35b-instruct', name: 'Qwen3 Coder 480B', description: 'MoE coder', maxTokens: 16384 },
      { id: 'mistralai/mistral-large-3-675b-instruct-2512', name: 'Mistral Large 3 675B', description: 'MoE VLM', maxTokens: 16384 },
      { id: 'mistralai/devstral-2-123b-instruct-2512', name: 'Devstral 2 123B', description: 'Coding model', maxTokens: 16384 },
      { id: 'minimax/minimax-m2_1', name: 'MiniMax M2.1', description: 'Multi-language coding', maxTokens: 16384 },
      { id: 'step/step-3.5-flash', name: 'Step 3.5 Flash', description: '200B reasoning engine', maxTokens: 16384 },
      { id: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B', description: 'MoE reasoning', maxTokens: 16384 },
      { id: 'openai/gpt-oss-20b', name: 'GPT-OSS 20B', description: 'MoE compact', maxTokens: 16384 },
    ],
  },
  {
    id: 'fireworks',
    name: 'Fireworks AI',
    baseURL: 'https://api.fireworks.ai/inference/v1',
    defaultModel: 'accounts/fireworks/models/glm-5',
    models: [
      { id: 'accounts/fireworks/models/glm-5', name: 'GLM-5 744B', description: 'SOTA MoE reasoning', maxTokens: 65536 },
      { id: 'accounts/fireworks/models/kimi-k2p5', name: 'Kimi K2.5', description: 'Code, reasoning, multimodal', maxTokens: 65536 },
      { id: 'accounts/fireworks/models/glm-4p7', name: 'GLM-4.7', description: 'Code reasoning & tool agents', maxTokens: 65536 },
      { id: 'accounts/fireworks/models/deepseek-v3p2', name: 'DeepSeek V3.2', description: 'Code gen & agentic', maxTokens: 65536 },
      { id: 'accounts/fireworks/models/kimi-k2-thinking', name: 'Kimi K2 Thinking', description: 'Advanced reasoning', maxTokens: 65536 },
      { id: 'accounts/fireworks/models/kimi-k2-instruct-0905', name: 'Kimi K2 Instruct', description: 'Code tasks & bug fixing', maxTokens: 65536 },
      { id: 'accounts/fireworks/models/gpt-oss-120b', name: 'GPT-OSS 120B', description: 'Reasoning & summarization', maxTokens: 65536 },
      { id: 'accounts/fireworks/models/qwen3-235b-a22b', name: 'Qwen3 235B', description: 'Medium coding model', maxTokens: 65536 },
      { id: 'accounts/fireworks/models/qwen2p5-72b-instruct', name: 'Qwen2.5 72B', description: 'General reasoning', maxTokens: 32768 },
      { id: 'accounts/fireworks/models/qwen2p5-coder-32b-instruct', name: 'Qwen2.5 Coder 32B', description: 'Code tasks', maxTokens: 32768 },
      { id: 'accounts/fireworks/models/llama-v3p3-70b-instruct', name: 'Llama 3.3 70B', description: 'Planning & reasoning', maxTokens: 32768 },
      { id: 'accounts/fireworks/models/qwen3-14b', name: 'Qwen3 14B', description: 'Code completion, low latency', maxTokens: 32768 },
      { id: 'accounts/fireworks/models/qwen3-8b', name: 'Qwen3 8B', description: 'Code & extraction', maxTokens: 32768 },
      { id: 'accounts/fireworks/models/gpt-oss-20b', name: 'GPT-OSS 20B', description: 'Search & extraction', maxTokens: 32768 },
      { id: 'accounts/fireworks/models/llama-v3p1-8b-instruct', name: 'Llama 3.1 8B', description: 'Extraction tasks', maxTokens: 16384 },
      { id: 'accounts/fireworks/models/llama-v3p2-3b-instruct', name: 'Llama 3.2 3B', description: 'Lightweight', maxTokens: 16384 },
    ],
  },
];

export function getProvider(id: string): Provider | undefined {
  return providers.find(p => p.id === id);
}

export function getProviderByBaseURL(baseURL: string): Provider | undefined {
  return providers.find(p => baseURL.includes(p.baseURL) || p.baseURL.includes(baseURL));
}

export function getModelInfo(providerId: string, modelId: string): ModelInfo | undefined {
  const provider = getProvider(providerId);
  return provider?.models.find(m => m.id === modelId);
}

export function detectProvider(baseURL: string): Provider | undefined {
  if (baseURL.includes('api.openai.com')) return getProvider('openai');
  if (baseURL.includes('api.anthropic.com')) return getProvider('anthropic');
  if (baseURL.includes('openrouter.ai')) return getProvider('openrouter');
  if (baseURL.includes('nvidia')) return getProvider('nvidia');
  if (baseURL.includes('fireworks')) return getProvider('fireworks');
  return undefined;
}
