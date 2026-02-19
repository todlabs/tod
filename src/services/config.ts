import { z } from 'zod';
import { config } from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { providers, getProvider } from './providers.js';

config();

const McpServerStdioSchema = z.object({
  type: z.literal('stdio').default('stdio'),
  command: z.string(),
  args: z.array(z.string()).default([]),
  env: z.record(z.string()).optional(),
  enabled: z.boolean().default(true),
});

const McpServerRemoteSchema = z.object({
  type: z.literal('remote'),
  url: z.string().url(),
  headers: z.record(z.string()).optional(),
  enabled: z.boolean().default(true),
});

const McpServerSchema = z.union([McpServerStdioSchema, McpServerRemoteSchema]);
export type McpServerConfig = z.infer<typeof McpServerSchema>;

const ProviderProfileSchema = z.object({
  apiKey: z.string().default(''),
  baseURL: z.string().url('Invalid base URL'),
  model: z.string().min(1, 'Model is required'),
  maxTokens: z.number().positive().max(128000).default(16384),
  temperature: z.number().min(0).max(2).default(1),
});

const ConfigSchema = z.object({
  // active runtime profile
  activeProvider: z.string().default('nvidia'),
  providerConfigs: z.record(ProviderProfileSchema).default({}),

  // backward-compatible fields (still written)
  provider: z.string().optional(),
  apiKey: z.string().default(''),
  baseURL: z.string().url('Invalid base URL').default('https://integrate.api.nvidia.com/v1'),
  model: z.string().min(1, 'Model is required').default('z-ai/glm4.7'),
  maxTokens: z.number().positive().max(128000).default(16384),
  temperature: z.number().min(0).max(2).default(1),
  providerKeys: z.record(z.string()).default({}),

  mcpServers: z.record(McpServerSchema).default({}),
});

export type Config = z.infer<typeof ConfigSchema>;

type ProviderProfile = z.infer<typeof ProviderProfileSchema>;

const getHomeDir = (): string => os.homedir();

const getConfigPath = (): string => {
  const homeDir = getHomeDir();
  const configDir = path.join(homeDir, '.tod');
  return path.join(configDir, 'config.json');
};

const ensureConfigDir = (): void => {
  const homeDir = getHomeDir();
  const configDir = path.join(homeDir, '.tod');
  if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
};

const readConfigFile = (): Partial<Config> => {
  const configPath = getConfigPath();
  if (fs.existsSync(configPath)) {
    try {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch {
      console.warn('Failed to read config file, using defaults');
    }
  }
  return {};
};

const writeConfigFile = (config: Config): void => {
  ensureConfigDir();
  try {
    fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2), 'utf-8');
  } catch (error) {
    console.error('Failed to write config file:', error);
  }
};

const defaultProfileFor = (providerId: string): ProviderProfile => {
  const p = getProvider(providerId) || getProvider('nvidia')!;
  return {
    apiKey: '',
    baseURL: p.baseURL,
    model: p.defaultModel,
    maxTokens: 16384,
    temperature: 1,
  };
};

const ensureProviderProfiles = (fileConfig: Partial<Config>): Record<string, ProviderProfile> => {
  const profiles: Record<string, ProviderProfile> = {};

  for (const p of providers) profiles[p.id] = defaultProfileFor(p.id);

  // Migrate old providerConfigs if present
  const oldProfiles = (fileConfig as any).providerConfigs || {};
  for (const [providerId, profile] of Object.entries(oldProfiles)) {
    const base = profiles[providerId] || defaultProfileFor(providerId);
    profiles[providerId] = {
      ...base,
      ...(profile as Partial<ProviderProfile>),
      baseURL: (profile as any)?.baseURL || base.baseURL,
      model: (profile as any)?.model || base.model,
      apiKey: (profile as any)?.apiKey || base.apiKey,
    };
  }

  // Migrate providerKeys + active fields from legacy shape
  const oldKeys = (fileConfig as any).providerKeys || {};
  for (const [providerId, key] of Object.entries(oldKeys)) {
    if (!profiles[providerId]) profiles[providerId] = defaultProfileFor(providerId);
    if (typeof key === 'string' && key) profiles[providerId].apiKey = key;
  }

  const activeProvider = (fileConfig as any).activeProvider || (fileConfig as any).provider;
  const legacyProvider = activeProvider && profiles[activeProvider] ? activeProvider : undefined;
  if (legacyProvider && (fileConfig as any).apiKey) {
    profiles[legacyProvider].apiKey = String((fileConfig as any).apiKey);
  }
  if (legacyProvider && (fileConfig as any).baseURL) {
    profiles[legacyProvider].baseURL = String((fileConfig as any).baseURL);
  }
  if (legacyProvider && (fileConfig as any).model) {
    profiles[legacyProvider].model = String((fileConfig as any).model);
  }

  return profiles;
};

export const initConfig = (apiKey: string, model?: string, baseURL?: string, providerId = 'nvidia'): void => {
  const providerConfigs = ensureProviderProfiles({});
  providerConfigs[providerId] = {
    ...providerConfigs[providerId],
    apiKey,
    baseURL: baseURL || providerConfigs[providerId].baseURL,
    model: model || providerConfigs[providerId].model,
  };

  const active = providerConfigs[providerId];
  const newConfig: Config = {
    activeProvider: providerId,
    provider: providerId,
    providerConfigs,
    providerKeys: Object.fromEntries(Object.entries(providerConfigs).map(([id, cfg]) => [id, cfg.apiKey || ''])),
    apiKey: active.apiKey,
    baseURL: active.baseURL,
    model: active.model,
    maxTokens: active.maxTokens,
    temperature: active.temperature,
    mcpServers: {},
  };

  writeConfigFile(newConfig);
  console.log(`Config created at: ${getConfigPath()}`);
};

export class ConfigService {
  private static instance: ConfigService;
  private config: Config;

  private constructor() {
    const fileConfig = readConfigFile();
    const configFileExists = fs.existsSync(getConfigPath());

    const envMaxTokens = process.env.MAX_TOKENS;
    const envTemperature = process.env.TEMPERATURE;

    const activeProvider = (process.env.LLM_PROVIDER || (fileConfig as any).activeProvider || (fileConfig as any).provider || 'nvidia');
    const providerConfigs = ensureProviderProfiles(fileConfig);

    if (!providerConfigs[activeProvider]) {
      providerConfigs[activeProvider] = defaultProfileFor(activeProvider);
    }

    const active = providerConfigs[activeProvider];

    // env overrides for active provider only
    if (process.env.LLM_API_KEY || process.env.NVIDIA_API_KEY) active.apiKey = process.env.LLM_API_KEY || process.env.NVIDIA_API_KEY || active.apiKey;
    if (process.env.LLM_BASE_URL || process.env.NVIDIA_BASE_URL) active.baseURL = process.env.LLM_BASE_URL || process.env.NVIDIA_BASE_URL || active.baseURL;
    if (process.env.LLM_MODEL || process.env.MODEL_NAME) active.model = process.env.LLM_MODEL || process.env.MODEL_NAME || active.model;
    if (envMaxTokens) active.maxTokens = parseInt(envMaxTokens, 10);
    if (envTemperature) active.temperature = parseFloat(envTemperature);

    const rawConfig = {
      activeProvider,
      provider: activeProvider,
      providerConfigs,
      providerKeys: Object.fromEntries(Object.entries(providerConfigs).map(([id, cfg]) => [id, cfg.apiKey || ''])),
      apiKey: active.apiKey || '',
      baseURL: active.baseURL,
      model: active.model,
      maxTokens: active.maxTokens,
      temperature: active.temperature,
      mcpServers: (fileConfig as any).mcpServers || {},
    };

    this.config = ConfigSchema.parse(rawConfig);

    if (!configFileExists) writeConfigFile(this.config);
  }

  static getInstance(): ConfigService {
    if (!ConfigService.instance) ConfigService.instance = new ConfigService();
    return ConfigService.instance;
  }

  private syncLegacyFields(): void {
    const activeProvider = this.config.activeProvider;
    const active = this.config.providerConfigs[activeProvider] || defaultProfileFor(activeProvider);
    this.config.provider = activeProvider;
    this.config.apiKey = active.apiKey;
    this.config.baseURL = active.baseURL;
    this.config.model = active.model;
    this.config.maxTokens = active.maxTokens;
    this.config.temperature = active.temperature;
    this.config.providerKeys = Object.fromEntries(Object.entries(this.config.providerConfigs).map(([id, cfg]) => [id, cfg.apiKey || '']));
  }

  private save(): void {
    this.syncLegacyFields();
    writeConfigFile(this.config);
  }

  getConfig(): Config {
    this.syncLegacyFields();
    return this.config;
  }

  getConfigPath(): string { return getConfigPath(); }

  getApiKey(): string { return this.getConfig().apiKey; }
  getBaseURL(): string { return this.getConfig().baseURL; }
  getModel(): string { return this.getConfig().model; }
  getMaxTokens(): number { return this.getConfig().maxTokens; }
  getTemperature(): number { return this.getConfig().temperature; }
  getProvider(): string | undefined { return this.getConfig().activeProvider; }

  getProviderConfig(providerId: string): ProviderProfile {
    if (!this.config.providerConfigs[providerId]) {
      this.config.providerConfigs[providerId] = defaultProfileFor(providerId);
    }
    return this.config.providerConfigs[providerId];
  }

  setProvider(providerId: string, apiKey?: string): string {
    const provider = getProvider(providerId);
    if (!provider) return `Unknown provider: ${providerId}`;

    const profile = this.getProviderConfig(providerId);
    profile.baseURL = provider.baseURL;
    if (!profile.model) profile.model = provider.defaultModel;
    if (apiKey) profile.apiKey = apiKey;

    this.config.activeProvider = providerId;
    this.save();
    return `Switched to ${provider.name} (${profile.model})`;
  }

  setModel(modelId: string): string {
    const providerId = this.config.activeProvider;
    const profile = this.getProviderConfig(providerId);
    profile.model = modelId;
    this.save();
    return `Model set to ${modelId}`;
  }

  setApiKey(apiKey: string): string {
    const providerId = this.config.activeProvider;
    const profile = this.getProviderConfig(providerId);
    profile.apiKey = apiKey;
    this.save();
    return 'API key updated';
  }

  getProviderKey(providerId: string): string | undefined {
    return this.getProviderConfig(providerId).apiKey;
  }

  getMcpServers(): Record<string, McpServerConfig> {
    return this.config.mcpServers;
  }

  updateConfig(updates: Partial<Config>): void {
    Object.assign(this.config, updates);
    this.save();
  }
}

export const configService = ConfigService.getInstance();
