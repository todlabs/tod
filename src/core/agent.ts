import type { AgentConfig, AgentMessage, ToolCallChunk, StreamChunk } from './types.js';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import { LLMClient } from './llm-client.js';
import { MessageManager } from './message-manager.js';
import { tools, executeTool, isAsyncTool, formatToolCall, getMcpTools } from '../tools/index.js';
import { logger } from '../services/logger.js';

const MAX_AGENT_ITERATIONS = 25;

export interface AgentProcessCallbacks {
  onChunk: (chunk: AgentMessage) => void;
  onToolCall: (toolName: string, args: unknown) => void;
}

export type BackgroundTaskResultHandler = (taskId: string, result: string) => void;

export class Agent {
  private llm: LLMClient;
  private messages: MessageManager;
  private messageManagers: Map<string, MessageManager> = new Map();
  private mcpToolDescriptions?: string;
  private isProcessing = false;
  private abortController: AbortController | null = null;
  private backgroundTaskResultHandlers: BackgroundTaskResultHandler[] = [];
  private activeSkillContent: string | null = null;

  constructor(config: AgentConfig) {
    this.llm = new LLMClient(config);
    const providerKey = (config as any).provider || 'default';
    this.messages = new MessageManager();
    this.messageManagers.set(providerKey, this.messages);
    logger.info('Agent created');
  }

  setActiveSkill(content: string | null): void {
    this.activeSkillContent = content;
    if (content) {
      this.messages.setEphemeralContext('skill', `Active skill instructions:\n${content}`);
      logger.info('Skill activated', { contentLength: content.length });
    } else {
      this.messages.removeEphemeralContext('skill');
    }
  }

  getMessages(): AgentMessage[] {
    return this.messages.getAgentMessages();
  }

  isBusy(): boolean {
    return this.isProcessing;
  }

  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  onBackgroundTaskResult(handler: BackgroundTaskResultHandler): () => void {
    this.backgroundTaskResultHandlers.push(handler);
    return () => {
      const index = this.backgroundTaskResultHandlers.indexOf(handler);
      if (index > -1) {
        this.backgroundTaskResultHandlers.splice(index, 1);
      }
    };
  }

  async handleBackgroundTaskResult(taskId: string, result: string): Promise<void> {
    logger.info('Agent received background task result', { taskId, resultLength: result.length });

    // Truncate long results to keep context clean
    const maxLen = 5000;
    const truncated = result.length > maxLen
      ? result.substring(0, maxLen) + `\n... (truncated, ${result.length} chars total)`
      : result;

    // Ephemeral — не засоряет историю, доступен при следующем LLM вызове
    this.messages.setEphemeralContext(
      `bg_result_${taskId}`,
      `Background task ${taskId} completed:\n${truncated}`
    );
  }

  updateBackgroundTasksContext(tasksSummary: string): void {
    this.messages.setEphemeralContext('background_tasks', `Background Tasks Status:\n${tasksSummary}`);
    logger.debug('Background tasks context updated');
  }

  async processMessage(
    userMessage: string,
    callbacks: AgentProcessCallbacks
  ): Promise<void> {
    if (this.isProcessing) {
      throw new Error('Agent is already processing a message');
    }

    this.isProcessing = true;
    this.abortController = new AbortController();
    logger.info('Processing user message', { length: userMessage.length });

    try {
      this.messages.addMessage('user', userMessage);
      await this.runAgentLoop(callbacks);
    } finally {
      this.isProcessing = false;
      this.abortController = null;
      logger.debug('Message processing finished');
    }
  }

  private async runAgentLoop(callbacks: AgentProcessCallbacks): Promise<void> {
    const allTools = [...tools, ...getMcpTools()];

    for (let iteration = 0; iteration < MAX_AGENT_ITERATIONS; iteration++) {
      const signal = this.abortController?.signal;
      if (signal?.aborted) break;

      let assistantMessage = '';
      const accumulatedToolCalls: Map<number, ToolCallChunk> = new Map();

      for await (const chunk of this.llm.streamCompletion(
        this.messages.getMessagesWithEphemeral(),
        allTools,
        signal
      )) {
        if (signal?.aborted) break;

        if (chunk.thinking) {
          callbacks.onChunk({
            role: 'assistant',
            content: chunk.thinking,
            isThinking: true,
          });
        }

        if (chunk.content) {
          assistantMessage += chunk.content;
        }

        for (const toolCall of chunk.toolCalls) {
          if (!accumulatedToolCalls.has(toolCall.index)) {
            accumulatedToolCalls.set(toolCall.index, {
              index: toolCall.index,
              id: toolCall.id,
              function: { name: '', arguments: '' },
            });
          }
          const accumulated = accumulatedToolCalls.get(toolCall.index)!;
          accumulated.function.name += toolCall.function.name;
          accumulated.function.arguments += toolCall.function.arguments;
        }
      }

      if (assistantMessage) {
        this.messages.addMessage('assistant', assistantMessage);
        callbacks.onChunk({
          role: 'assistant',
          content: assistantMessage,
        });
      }

      const toolCallsArray = Array.from(accumulatedToolCalls.values());
      const validToolCalls = toolCallsArray.filter((tc) => tc.function?.name);

      if (validToolCalls.length === 0) break;

      const toolCallsWithIds = validToolCalls.map((tc, idx) => {
        const id = tc.id || `call_${Date.now()}_${idx}`;
        let parsedArgs: Record<string, unknown>;
        try {
          parsedArgs = JSON.parse(tc.function.arguments || '{}');
        } catch (error) {
          logger.error('Failed to parse tool arguments', {
            toolName: tc.function.name,
            arguments: tc.function.arguments,
            error: error instanceof Error ? error.message : String(error),
          });
          parsedArgs = {};
        }
        return {
          ...tc,
          id,
          parsedArgs,
          function: {
            name: tc.function.name,
            arguments: JSON.stringify(parsedArgs),
          },
        };
      });

      this.messages.addToolCall(
        toolCallsWithIds.map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments,
          },
        }))
      );

      for (const toolCall of toolCallsWithIds) {
        if (signal?.aborted) break;

        const toolName = toolCall.function.name;
        const toolArgs = toolCall.parsedArgs;

        callbacks.onToolCall(toolName, toolArgs);

        let result: string;
        const toolResult = executeTool(toolName, toolArgs);

        if (toolResult instanceof Promise) {
          logger.info('Waiting for async tool result', { toolName });
          result = await toolResult;
          logger.info('Async tool completed', { toolName, resultLength: result.length });
        } else {
          result = toolResult;
        }

        this.messages.addMessage('tool', result, {
          tool_call_id: toolCall.id,
        });

        callbacks.onChunk({
          role: 'tool',
          content: result,
          toolName: formatToolCall(toolName, toolArgs),
        });
      }

      // Loop continues — next iteration will call LLM with tool results
    }
  }

  async compactContext(): Promise<{ oldTokens: number; newTokens: number; summary: string }> {
    logger.info('Compacting context');

    const conversationMessages = this.messages.getConversationMessages();

    if (conversationMessages.length === 0) {
      return { oldTokens: 0, newTokens: 0, summary: 'No messages to compact' };
    }

    const oldTokens = this.messages.estimateTokens();

    const conversationText = conversationMessages
      .map((msg: any) => {
        const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
        if (msg.role === 'user') return `User: ${content}`;
        if (msg.role === 'assistant') return `Assistant: ${content}`;
        if (msg.role === 'tool') return `Tool (${msg.tool_call_id}): ${content}`;
        if (msg.role === 'system') return `System: ${content}`;
        return content;
      })
      .join('\n\n');

    const summary = await this.llm.createSummary(conversationText);
    const newTokens = Math.round(summary.length / 4);

    this.messages.compact(summary);

    logger.info('Context compacted', { oldTokens, newTokens, saved: oldTokens - newTokens });

    return { oldTokens, newTokens, summary };
  }

  reset(): void {
    this.abort();
    for (const manager of this.messageManagers.values()) manager.reset();
    logger.info('Agent reset');
  }

  getConfig(): AgentConfig {
    return this.llm.config;
  }

  updateConfig(config: AgentConfig): void {
    this.llm = new LLMClient(config);

    const providerKey = (config as any).provider || 'default';
    if (!this.messageManagers.has(providerKey)) {
      const manager = new MessageManager(this.mcpToolDescriptions);
      this.messageManagers.set(providerKey, manager);
    }
    this.messages = this.messageManagers.get(providerKey)!;

    logger.info('Agent config updated', {
      provider: providerKey,
      model: config.model,
      baseURL: config.baseURL,
      isolatedContext: true,
    });
  }

  setMcpToolDescriptions(descriptions: string): void {
    this.mcpToolDescriptions = descriptions;
    for (const manager of this.messageManagers.values()) {
      manager.setMcpToolDescriptions(descriptions);
    }
  }
}
