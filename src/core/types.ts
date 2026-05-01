import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions';

export interface AgentConfig {
  apiKey: string;
  baseURL: string;
  model: string;
  maxTokens: number;
  temperature: number;
  headers?: Record<string, string>;
  provider?: string;
}

export interface DiffLine {
  type: "add" | "remove" | "context";
  oldLineNo?: number;
  newLineNo?: number;
  content: string;
}

export interface DiffResult {
  filePath: string;
  lines: DiffLine[];
  addedCount: number;
  removedCount: number;
  isNewFile: boolean;
}

export interface AgentMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolName?: string;
  toolArgs?: unknown;
  isThinking?: boolean;
  thinkingTime?: number; // время в миллисекундах
  diff?: DiffResult;
  isPending?: boolean;
}

export interface ToolCallChunk {
  index: number;
  id: string;
  function: {
    name: string;
    arguments: string;
  };
}

export interface StreamChunk {
  content: string;
  thinking: string;
  toolCalls: ToolCallChunk[];
}
