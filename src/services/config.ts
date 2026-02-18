import { z } from 'zod';
import { config } from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { providers, getProvider, type Provider } from './providers.js';

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

const ConfigSchema = z.object({
  apiKey: z.string().min(1, 'API key is required'),
  baseURL: z.string().url('Invalid base URL').default('https://integrate.api.nvidia.com/v1'),
  model: z.string().min(1, 'Model is required').default('z-ai/glm4.7'),
  maxTokens: z.number().positive().max(128000).default(16384),
  temperature: z.number().min(0).max(2).default(1),
  provider: z.string().optional(),
  providerKeys: z.record(z.string()).default({}),
  mcpServers: z.record(McpServerSchema).default({}),
});

export type Config = z.infer<typeof ConfigSchema>;

const getHomeDir = (): string => {
  return os.homedir();
};

const getConfigPath = (): string => {
  const homeDir = getHomeDir();
  const configDir = path.join(homeDir, '.tod');
  return path.join(configDir, 'config.json');
};

const ensureConfigDir = (): void => {
  const homeDir = getHomeDir();
  const configDir = path.join(homeDir, '.tod');
  
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
};

const readConfigFile = (): Partial<Config> => {
  const configPath = getConfigPath();
  
  if (fs.existsSync(configPath)) {
    try {
      const content = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.warn('Failed to read config file, using defaults');
    }
  }
  
  return {};
};

const writeConfigFile = (config: Config): void => {
  ensureConfigDir();
  const configPath = getConfigPath();
  
  try {
    fs.writeFileSync(
      configPath,
      JSON.stringify(config, null, 2),
      'utf-8'
    );
  } catch (error) {
    console.error('Failed to write config file:', error);
  }
};

export const initConfig = (apiKey: string, model?: string, baseURL?: string, providerId?: string): void => {
  const providerKeys: Record<string, string> = {};
  if (providerId && apiKey) providerKeys[providerId] = apiKey;

  const newConfig: Config = {
    apiKey,
    baseURL: baseURL || 'https://integrate.api.nvidia.com/v1',
    model: model || 'z-ai/glm4.7',
    maxTokens: 16384,
    temperature: 1,
    provider: providerId,
    providerKeys,
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

    const rawConfig = {
      // LLM_API_KEY — универсальный; NVIDIA_API_KEY — для обратной совместимости
      apiKey: process.env.LLM_API_KEY || process.env.NVIDIA_API_KEY || fileConfig.apiKey || '',
      baseURL: process.env.LLM_BASE_URL || process.env.NVIDIA_BASE_URL || fileConfig.baseURL || 'https://integrate.api.nvidia.com/v1',
      model: process.env.LLM_MODEL || process.env.MODEL_NAME || fileConfig.model || 'z-ai/glm4.7',
      maxTokens: envMaxTokens ? parseInt(envMaxTokens, 10) : (fileConfig.maxTokens || 16384),
      temperature: envTemperature ? parseFloat(envTemperature) : (fileConfig.temperature || 1),
      providerKeys: (fileConfig as any).providerKeys || {},
      mcpServers: (fileConfig as any).mcpServers || {},
    };

    this.config = ConfigSchema.parse(rawConfig);

    // Auto-detect provider if not set
    if (!this.config.provider) {
      if (this.config.baseURL.includes('nvidia')) {
        this.config.provider = 'nvidia';
      } else if (this.config.baseURL.includes('fireworks')) {
        this.config.provider = 'fireworks';
      }
    }

    // Save current apiKey into providerKeys for the detected provider
    if (this.config.provider && this.config.apiKey && !this.config.providerKeys[this.config.provider]) {
      this.config.providerKeys[this.config.provider] = this.config.apiKey;
    }

    if (!configFileExists || !fileConfig.apiKey) {
      writeConfigFile(this.config);
    }
  }

  static getInstance(): ConfigService {
    if (!ConfigService.instance) {
      ConfigService.instance = new ConfigService();
    }
    return ConfigService.instance;
  }

  getConfig(): Config {
    return this.config;
  }

  getConfigPath(): string {
    return getConfigPath();
  }

  getApiKey(): string {
    return this.config.apiKey;
  }

  getBaseURL(): string {
    return this.config.baseURL;
  }

  getModel(): string {
    return this.config.model;
  }

  getMaxTokens(): number {
    return this.config.maxTokens;
  }

  getTemperature(): number {
    return this.config.temperature;
  }

  getProvider(): string | undefined {
    return this.config.provider;
  }

  setProvider(providerId: string, apiKey?: string): string {
    const provider = getProvider(providerId);
    if (!provider) return `Unknown provider: ${providerId}`;

    this.config.provider = providerId;
    this.config.baseURL = provider.baseURL;
    this.config.model = provider.defaultModel;

    if (apiKey) {
      this.config.apiKey = apiKey;
      this.config.providerKeys[providerId] = apiKey;
    } else if (this.config.providerKeys[providerId]) {
      this.config.apiKey = this.config.providerKeys[providerId];
    }

    writeConfigFile(this.config);
    return `Switched to ${provider.name} (${provider.defaultModel})`;
  }

  setModel(modelId: string): string {
    this.config.model = modelId;
    writeConfigFile(this.config);
    return `Model set to ${modelId}`;
  }

  setApiKey(apiKey: string): string {
    this.config.apiKey = apiKey;
    if (this.config.provider) {
      this.config.providerKeys[this.config.provider] = apiKey;
    }
    writeConfigFile(this.config);
    return `API key updated`;
  }

  getProviderKey(providerId: string): string | undefined {
    return this.config.providerKeys[providerId];
  }

  getMcpServers(): Record<string, McpServerConfig> {
    return this.config.mcpServers;
  }

  updateConfig(updates: Partial<Config>): void {
    Object.assign(this.config, updates);
    writeConfigFile(this.config);
  }

}

export const configService = ConfigService.getInstance();
