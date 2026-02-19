import { Agent } from '../core/agent.js';
import { LLMClient } from '../core/llm-client.js';
import { MessageManager } from '../core/message-manager.js';
import type { AgentConfig, AgentMessage, StreamChunk } from '../core/types.js';
import type { AgentProcessCallbacks } from '../core/agent.js';

export { Agent, LLMClient, MessageManager };
export type { AgentConfig, AgentMessage, StreamChunk } from '../core/types.js';
export type { AgentProcessCallbacks } from '../core/agent.js';

// Extend Agent type to include abort method
export interface AgentWithAbort extends Agent {
  abort(): void;
}
