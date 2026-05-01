import { z } from "zod";
import { config } from "dotenv";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { providers, getProvider } from "./providers.js";
import type { AgentConfig } from "../core/types.js";

config();

// --- Schemas ---

const McpServerStdioSchema = z.object({
  type: z.literal("stdio").default("stdio"),
  command: z.string(),
  args: z.array(z.string()).default([]),
  env: z.record(z.string()).optional(),
  enabled: z.boolean().default(true),
});

const McpServerRemoteSchema = z.object({
  type: z.literal("remote"),
  url: z.string().url(),
  headers: z.record(z.string()).optional(),
  enabled: z.boolean().default(true),
});

const McpServerSchema = z.union([McpServerStdioSchema, McpServerRemoteSchema]);
export type McpServerConfig = z.infer<typeof McpServerSchema>;

const ProviderConfigSchema = z.object({
  apiKey: z.string().default(""),
  baseURL: z.string().default(""),
  model: z.string().default(""),
  maxTokens: z.number().positive().max(128000).default(16384),
  temperature: z.number().min(0).max(2).default(1),
  headers: z.record(z.string()).default({}),
});
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

const UiSettingsSchema = z.object({
  cleanMode: z.boolean().default(false),
  enableAnimation: z.boolean().default(true),
  showThinking: z.boolean().default(true),
  autoCompact: z.boolean().default(false),
  autoCompactThreshold: z.number().min(0).max(100).default(80),
}).default({});

const ConfigSchema = z.object({
  activeProvider: z.string().default("fireworks"),
  providers: z.record(ProviderConfigSchema).default({}),
  mcpServers: z.record(McpServerSchema).default({}),
  ui: UiSettingsSchema,
});

export type Config = z.infer<typeof ConfigSchema>;
export type UiSettings = z.infer<typeof UiSettingsSchema>;

// --- File I/O ---

const getHomeDir = (): string => os.homedir();

const getConfigPath = (): string => {
  return path.join(getHomeDir(), ".tod", "config.json");
};

const ensureConfigDir = (): void => {
  const configDir = path.join(getHomeDir(), ".tod");
  if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
};

const readConfigFile = (): Record<string, unknown> => {
  const configPath = getConfigPath();
  if (fs.existsSync(configPath)) {
    try {
      return JSON.parse(fs.readFileSync(configPath, "utf-8"));
    } catch {
      console.warn("Failed to read config file, using defaults");
    }
  }
  return {};
};

const writeConfigFile = (config: Config): void => {
  ensureConfigDir();
  try {
    fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2), "utf-8");
  } catch (error) {
    console.error("Failed to write config file:", error);
  }
};

// --- Migrate legacy config ---

function migrateLegacyConfig(raw: Record<string, any>): Record<string, any> {
  // Already new format
  if (raw.providers && !raw.providerConfigs) return raw;

  const migrated: Record<string, any> = {};

  // activeProvider
  migrated.activeProvider = raw.activeProvider || raw.provider || "fireworks";

  // Build providers from providerConfigs
  const providersMap: Record<string, any> = {};

  // Start with defaults for all known providers
  for (const p of providers) {
    providersMap[p.id] = {
      apiKey: "",
      baseURL: p.baseURL,
      model: p.defaultModel,
      maxTokens: 16384,
      temperature: 1,
      headers: {},
    };
  }

  // Merge in providerConfigs
  const oldProfiles = raw.providerConfigs || {};
  for (const [id, profile] of Object.entries(oldProfiles)) {
    const p = profile as any;
    providersMap[id] = {
      apiKey: p.apiKey || "",
      baseURL: p.baseURL || "",
      model: p.model || "",
      maxTokens: p.maxTokens || 16384,
      temperature: p.temperature ?? 1,
      headers: p.headers || {},
    };
  }

  // Merge in providerKeys (legacy key storage)
  const oldKeys = raw.providerKeys || {};
  for (const [id, key] of Object.entries(oldKeys)) {
    if (typeof key === "string" && key) {
      if (!providersMap[id]) providersMap[id] = {};
      providersMap[id].apiKey = key;
    }
  }

  // Merge top-level legacy fields into active provider
  const activeId = migrated.activeProvider;
  if (providersMap[activeId]) {
    if (raw.apiKey) providersMap[activeId].apiKey = String(raw.apiKey);
    if (raw.baseURL) providersMap[activeId].baseURL = String(raw.baseURL);
    if (raw.model) providersMap[activeId].model = String(raw.model);
    if (raw.maxTokens) providersMap[activeId].maxTokens = raw.maxTokens;
    if (raw.temperature != null) providersMap[activeId].temperature = raw.temperature;
  }

  migrated.providers = providersMap;
  migrated.mcpServers = raw.mcpServers || {};
  migrated.ui = raw.ui || {};

  return migrated;
}

// --- Defaults ---

const defaultProviderConfig = (providerId: string): ProviderConfig => {
  const p = getProvider(providerId);
  if (p) {
    return {
      apiKey: "",
      baseURL: p.baseURL,
      model: p.defaultModel,
      maxTokens: 16384,
      temperature: 1,
      headers: p.defaultHeaders || {},
    };
  }
  return {
    apiKey: "",
    baseURL: "",
    model: "",
    maxTokens: 16384,
    temperature: 1,
    headers: {},
  };
};

// --- Init (setup flow) ---

export const initConfig = (
  apiKey: string,
  model?: string,
  baseURL?: string,
  providerId = "fireworks",
): void => {
  const providerDefaults = defaultProviderConfig(providerId);
  const providerEntry: ProviderConfig = {
    apiKey,
    baseURL: baseURL || providerDefaults.baseURL,
    model: model || providerDefaults.model,
    maxTokens: providerDefaults.maxTokens,
    temperature: providerDefaults.temperature,
    headers: providerDefaults.headers,
  };

  // Build full providers map with defaults for all known providers
  const allProviders: Record<string, ProviderConfig> = {};
  for (const p of providers) {
    if (p.id === providerId) {
      allProviders[p.id] = providerEntry;
    } else {
      allProviders[p.id] = defaultProviderConfig(p.id);
    }
  }

  const newConfig: Config = {
    activeProvider: providerId,
    providers: allProviders,
    mcpServers: {},
    ui: {
      cleanMode: false,
      enableAnimation: true,
      showThinking: true,
      autoCompact: false,
      autoCompactThreshold: 80,
    },
  };

  writeConfigFile(newConfig);
  console.log(`Config created at: ${getConfigPath()}`);
};

// --- ConfigService ---

export class ConfigService {
  private static instance: ConfigService;
  private config: Config;

  private constructor() {
    const rawFile = readConfigFile();
    const migrated = migrateLegacyConfig(rawFile);
    const configFileExists = fs.existsSync(getConfigPath());

    // Parse with zod (applies defaults)
    this.config = ConfigSchema.parse(migrated);

    // Ensure all known providers exist in config
    let needsSave = false;
    for (const p of providers) {
      if (!this.config.providers[p.id]) {
        this.config.providers[p.id] = defaultProviderConfig(p.id);
        needsSave = true;
      }
    }

    // Ensure active provider exists
    if (!this.config.providers[this.config.activeProvider]) {
      this.config.providers[this.config.activeProvider] = defaultProviderConfig(this.config.activeProvider);
      needsSave = true;
    }

    // Override from env vars
    const active = this.config.providers[this.config.activeProvider];
    if (process.env.LLM_API_KEY || process.env.NVIDIA_API_KEY)
      active.apiKey = process.env.LLM_API_KEY || process.env.NVIDIA_API_KEY || active.apiKey;
    if (process.env.LLM_BASE_URL || process.env.NVIDIA_BASE_URL)
      active.baseURL = process.env.LLM_BASE_URL || process.env.NVIDIA_BASE_URL || active.baseURL;
    if (process.env.LLM_MODEL || process.env.MODEL_NAME)
      active.model = process.env.LLM_MODEL || process.env.MODEL_NAME || active.model;
    if (process.env.MAX_TOKENS) active.maxTokens = parseInt(process.env.MAX_TOKENS, 10);
    if (process.env.TEMPERATURE) active.temperature = parseFloat(process.env.TEMPERATURE);

    // Write back clean config if needed
    if (!configFileExists || (rawFile as any).providerConfigs || needsSave) {
      writeConfigFile(this.config);
    }
  }

  static getInstance(): ConfigService {
    if (!ConfigService.instance) ConfigService.instance = new ConfigService();
    return ConfigService.instance;
  }

  private save(): void {
    writeConfigFile(this.config);
  }

  getConfig(): Config {
    return this.config;
  }

  getConfigPath(): string {
    return getConfigPath();
  }

  // --- Convenience getters for active provider ---

  getApiKey(): string { return this.config.providers[this.config.activeProvider]?.apiKey || ""; }
  getBaseURL(): string { return this.config.providers[this.config.activeProvider]?.baseURL || ""; }
  getModel(): string { return this.config.providers[this.config.activeProvider]?.model || ""; }
  getMaxTokens(): number { return this.config.providers[this.config.activeProvider]?.maxTokens || 16384; }
  getTemperature(): number { return this.config.providers[this.config.activeProvider]?.temperature ?? 1; }
  getProvider(): string { return this.config.activeProvider; }
  getHeaders(): Record<string, string> { return this.config.providers[this.config.activeProvider]?.headers || {}; }

  getAgentConfig(): AgentConfig {
    const p = this.config.providers[this.config.activeProvider];
    return {
      apiKey: p?.apiKey || "",
      baseURL: p?.baseURL || "",
      model: p?.model || "",
      maxTokens: p?.maxTokens || 16384,
      temperature: p?.temperature ?? 1,
      headers: p?.headers || {},
      provider: this.config.activeProvider,
    };
  }

  // --- Provider config ---

  getProviderConfig(providerId: string): ProviderConfig {
    if (!this.config.providers[providerId]) {
      this.config.providers[providerId] = defaultProviderConfig(providerId);
    }
    return this.config.providers[providerId];
  }

  setProvider(providerId: string, apiKey?: string): string {
    const provider = getProvider(providerId);
    if (!provider) return `Unknown provider: ${providerId}`;

    const cfg = this.getProviderConfig(providerId);
    cfg.baseURL = provider.baseURL;
    if (!cfg.model) cfg.model = provider.defaultModel;
    if (provider.defaultHeaders) cfg.headers = { ...provider.defaultHeaders };
    if (apiKey) cfg.apiKey = apiKey;

    this.config.activeProvider = providerId;
    this.save();
    return `Switched to ${provider.name} (${cfg.model})`;
  }

  setModel(modelId: string): string {
    const cfg = this.getProviderConfig(this.config.activeProvider);
    cfg.model = modelId;
    this.save();
    return `Model set to ${modelId}`;
  }

  setApiKey(apiKey: string): string {
    const cfg = this.getProviderConfig(this.config.activeProvider);
    cfg.apiKey = apiKey;
    this.save();
    return "API key updated";
  }

  getProviderKey(providerId: string): string | undefined {
    return this.getProviderConfig(providerId).apiKey || undefined;
  }

  // --- MCP ---

  getMcpServers(): Record<string, McpServerConfig> {
    return this.config.mcpServers;
  }

  // --- UI ---

  getUiSettings(): UiSettings {
    return this.config.ui;
  }

  setUiSetting<K extends keyof UiSettings>(key: K, value: UiSettings[K]): void {
    this.config.ui[key] = value;
    this.save();
  }

  // --- Generic update ---

  updateConfig(updates: Partial<Config>): void {
    Object.assign(this.config, updates);
    this.save();
  }
}

export const configService = ConfigService.getInstance();
