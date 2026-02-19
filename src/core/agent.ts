import type { AgentConfig, AgentMessage, ToolCallChunk, StreamChunk } from './types.js';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import { LLMClient } from './llm-client.js';
import { MessageManager } from './message-manager.js';
import { tools, executeTool, isAsyncTool, formatToolCall, getMcpTools } from '../tools/index.js';
import { logger } from '../services/logger.js';

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
      logger.info('Skill activated', { contentLength: content.length });
    }
  }

  getMessages(): AgentMessage[] {
    return this.messages.getAgentMessages();
  }

  isBusy(): boolean {
    return this.isProcessing;
  }

  /**
   * Подписаться на результаты фоновых задач
   * Когда задача завершается, агент получает результат автоматически
   */
  onBackgroundTaskResult(handler: BackgroundTaskResultHandler): () => void {
    this.backgroundTaskResultHandlers.push(handler);
    return () => {
      const index = this.backgroundTaskResultHandlers.indexOf(handler);
      if (index > -1) {
        this.backgroundTaskResultHandlers.splice(index, 1);
      }
    };
  }

  /**
   * Добавить результат фоновой задачи в контекст и обработать его
   */
  async handleBackgroundTaskResult(taskId: string, result: string): Promise<void> {
    logger.info('Agent received background task result', { taskId, resultLength: result.length });

    // Добавляем результат в контекст
    const message = `Background Agent (Task ${taskId}) Result:\n${result}`;
    this.messages.addMessage('assistant', message);

    // Если агент сейчас не занят, можно автоматически продолжить работу
    if (!this.isProcessing && this.backgroundTaskResultHandlers.length > 0) {
      logger.info('Agent is idle, processing task result');
      for (const handler of this.backgroundTaskResultHandlers) {
        try {
          await handler(taskId, result);
        } catch (error) {
          logger.error('Error in background task result handler', { error });
        }
      }
    }
  }

  /**
   * Обновить контекст агента информацией о текущих фоновых задачах
   */
  async updateBackgroundTasksContext(tasksSummary: string): Promise<void> {
    const message = `Background Tasks Status:\n${tasksSummary}`;
    this.messages.addSystemMessage(message);
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
    logger.info('Processing user message', { length: userMessage.length });

    try {
      // Skill is already in system context via setActiveSkill
      this.messages.addMessage('user', userMessage);
      await this.runAgentLoop(callbacks);
    } finally {
      this.isProcessing = false;
      logger.debug('Message processing finished');
    }
  }

  private async runAgentLoop(callbacks: AgentProcessCallbacks): Promise<void> {
    let assistantMessage = '';
    let accumulatedToolCalls: Map<number, ToolCallChunk> = new Map();

    const allTools = [...tools, ...getMcpTools()];

    for await (const chunk of this.llm.streamCompletion(this.messages.getMessages(), allTools)) {
      // Handle thinking
      if (chunk.thinking) {
        callbacks.onChunk({
          role: 'assistant',
          content: chunk.thinking,
          isThinking: true,
        });
      }

      // Handle content
      if (chunk.content) {
        assistantMessage += chunk.content;
      }

      // Handle tool calls
      for (const toolCall of chunk.toolCalls) {
        if (!accumulatedToolCalls.has(toolCall.index)) {
          accumulatedToolCalls.set(toolCall.index, {
            index: toolCall.index,
            id: toolCall.id,
            function: {
              name: '',
              arguments: '',
            },
          });
        }

        const accumulated = accumulatedToolCalls.get(toolCall.index)!;
        accumulated.function.name += toolCall.function.name;
        accumulated.function.arguments += toolCall.function.arguments;
      }
    }

    // Save assistant message
    if (assistantMessage) {
      this.messages.addMessage('assistant', assistantMessage);
      callbacks.onChunk({
        role: 'assistant',
        content: assistantMessage,
      });
    }

    // Process tool calls
    const toolCallsArray = Array.from(accumulatedToolCalls.values());
    if (toolCallsArray.length > 0) {
      const validToolCalls = toolCallsArray.filter((tc) => tc.function?.name);

      if (validToolCalls.length > 0) {
        // Генерируем стабильные ID один раз, используем и в assistant и в tool сообщениях
        const toolCallsWithIds = validToolCalls.map((tc, idx) => ({
          ...tc,
          id: tc.id || `call_${Date.now()}_${idx}`,
        }));

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

        // Execute each tool
        for (const toolCall of toolCallsWithIds) {
          const toolName = toolCall.function.name;
          let toolArgs;

          try {
            toolArgs = JSON.parse(toolCall.function.arguments || '{}');
          } catch (error) {
            logger.error('Failed to parse tool arguments', {
              toolName,
              arguments: toolCall.function.arguments,
              error: error instanceof Error ? error.message : String(error)
            });
            toolArgs = {};
          }

          callbacks.onToolCall(toolName, toolArgs);

          let result: string;
          const toolResult = executeTool(toolName, toolArgs);

          // Handle async tools (like wait_for_task)
          if (toolResult instanceof Promise) {
            logger.info('Waiting for async tool result', { toolName });
            result = await toolResult;
            logger.info('Async tool completed', { toolName, resultLength: result.length });
          } else {
            result = toolResult;
          }

          // Без name — не стандарт OpenAI, некоторые API возвращают 400
          this.messages.addMessage('tool', result, {
            tool_call_id: toolCall.id,
          });

          callbacks.onChunk({
            role: 'tool',
            content: result,
            toolName: formatToolCall(toolName, toolArgs),
          });
        }

        // Continue loop with tool results
        await this.runAgentLoop(callbacks);
      }
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
