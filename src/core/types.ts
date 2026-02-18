import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions';

export interface AgentConfig {
  apiKey: string;
  baseURL: string;
  model: string;
  maxTokens: number;
  temperature: number;
}

export interface AgentMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolName?: string;
  toolArgs?: unknown;
  isThinking?: boolean;
  thinkingTime?: number; // время в миллисекундах
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
