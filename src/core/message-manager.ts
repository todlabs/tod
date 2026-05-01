import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type { AgentMessage } from './types.js';
import { getSystemPrompt } from '../prompts/system.js';
import { logger } from '../services/logger.js';
import * as os from 'os';
import * as path from 'path';

export class MessageManager {
  private messages: ChatCompletionMessageParam[] = [];
  private mcpToolDescriptions?: string;
  // Ephemeral context — перезаписывается по ключу, не дублируется
  private ephemeralContext: Map<string, string> = new Map();

  constructor(mcpToolDescriptions?: string) {
    this.mcpToolDescriptions = mcpToolDescriptions;
    this.reset();
    logger.debug('MessageManager initialized');
  }

  reset(): void {
    this.messages = [
      {
        role: 'system',
        content: getSystemPrompt(process.cwd(), this.mcpToolDescriptions),
      },
    ];
    this.ephemeralContext.clear();
    logger.debug('Messages reset');
  }

  setMcpToolDescriptions(descriptions: string): void {
    this.mcpToolDescriptions = descriptions;
    if (this.messages.length > 0 && this.messages[0].role === 'system') {
      this.messages[0] = {
        role: 'system',
        content: getSystemPrompt(process.cwd(), descriptions),
      };
    }
  }

  /**
   * Установить ephemeral context по ключу — заменяет предыдущее значение
   * Не сохраняется в историю, добавляется при каждом вызове getMessagesWithEphemeral()
   */
  setEphemeralContext(key: string, content: string): void {
    this.ephemeralContext.set(key, content);
  }

  removeEphemeralContext(key: string): void {
    this.ephemeralContext.delete(key);
  }

  addMessage(role: 'user' | 'assistant' | 'tool', content: string, metadata?: {
    tool_call_id?: string;
    tool_calls?: any[];
    name?: string;
  }): void {
    let message: ChatCompletionMessageParam;

    if (role === 'tool') {
      message = {
        role: 'tool',
        content: content || '',
        tool_call_id: metadata?.tool_call_id || '',
      };
    } else if (role === 'assistant') {
      message = {
        role: 'assistant',
        content: content || null,
      };
      if (metadata?.tool_calls) {
        (message as any).tool_calls = metadata.tool_calls;
      }
    } else {
      message = {
        role: 'user',
        content: content || '',
      };
    }

    if (metadata?.name) {
      (message as any).name = metadata.name;
    }

    this.messages.push(message);
    logger.debug('Message added', { role, contentLength: content.length });
  }

  addSystemMessage(content: string): void {
    this.messages.push({
      role: 'system',
      content,
    });
    logger.debug('System message added', { contentLength: content.length });
  }

  addToolCall(toolCalls: any[]): void {
    this.messages.push({
      role: 'assistant',
      content: null,
      tool_calls: toolCalls,
    });
    logger.debug('Tool calls added', { count: toolCalls.length });
  }

  getMessages(): ChatCompletionMessageParam[] {
    return [...this.messages];
  }

  /**
   * Messages for saving to disk — tool content truncated to save space.
   * System prompt is excluded (regenerated on resume).
   */
  getMessagesForSave(): ChatCompletionMessageParam[] {
    const MAX_TOOL_CONTENT = 500;
    const MAX_ASSISTANT_CONTENT = 2000;

    return this.messages
      .filter((msg) => msg.role !== 'system')
      .map((msg: any) => {
        if (msg.role === 'tool') {
          const content = typeof msg.content === 'string' ? msg.content : '';
          const truncated = content.length > MAX_TOOL_CONTENT
            ? content.substring(0, MAX_TOOL_CONTENT) + '\n[...truncated]'
            : content;
          return { ...msg, content: truncated };
        }
        if (msg.role === 'assistant' && typeof msg.content === 'string') {
          const content = msg.content;
          const truncated = content.length > MAX_ASSISTANT_CONTENT
            ? content.substring(0, MAX_ASSISTANT_CONTENT) + '\n[...truncated]'
            : content;
          return { ...msg, content: truncated };
        }
        return msg;
      });
  }

  /**
   * Сообщения + ephemeral context (skill, background tasks) — для отправки в LLM
   */
  getMessagesWithEphemeral(): ChatCompletionMessageParam[] {
    if (this.ephemeralContext.size === 0) return [...this.messages];

    const result: ChatCompletionMessageParam[] = [this.messages[0]]; // system prompt

    // Ephemeral context сразу после system prompt
    for (const content of this.ephemeralContext.values()) {
      result.push({ role: 'system', content });
    }

    // Остальные сообщения
    for (let i = 1; i < this.messages.length; i++) {
      result.push(this.messages[i]);
    }

    return result;
  }

  getAgentMessages(): AgentMessage[] {
    const result: AgentMessage[] = [];

    for (const msg of this.messages) {
      const content = typeof msg.content === 'string' ? msg.content : (msg.content ? JSON.stringify(msg.content) : '');
      const anyMsg = msg as any;

      if (msg.role === 'tool') {
        result.push({
          role: 'tool',
          content,
          toolName: anyMsg.name,
        });
      } else if (msg.role === 'assistant' && anyMsg.tool_calls) {
        // Show tool calls as compact entries (no output)
        for (const tc of anyMsg.tool_calls) {
          const toolName = tc.function?.name || 'unknown';
          let toolArgs = '';
          try {
            const parsed = JSON.parse(tc.function?.arguments || '{}');
            // Show key arg: path for file ops, command for shell
            toolArgs = parsed.path || parsed.command || parsed.name || parsed.content?.substring(0, 40) || '';
            if (toolArgs.length > 60) toolArgs = toolArgs.substring(0, 57) + '...';
          } catch { /* ignore */ }
          result.push({
            role: 'tool',
            content: '',
            toolName,
            toolArgs,
          });
        }
        // Also add assistant text content if any
        if (content) {
          result.push({
            role: 'assistant',
            content,
          });
        }
      } else {
        result.push({
          role: msg.role as 'user' | 'assistant' | 'system',
          content,
        });
      }
    }

    return result;
  }

  getConversationMessages(): ChatCompletionMessageParam[] {
    return this.messages.slice(1);
  }

  compact(summary: string): void {
    const systemMessage = this.messages[0];
    this.messages = [
      systemMessage,
      {
        role: 'system',
        content: `Previous conversation summary:\n${summary}`,
      },
    ];
    logger.debug('Messages compacted', { summaryLength: summary.length });
  }

  estimateTokens(): number {
    const text = this.messages
      .map((msg) => {
        const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
        return content;
      })
      .join(' ');

    return Math.round(text.length / 4);
  }

  /**
   * Restore messages from a saved chat. Replaces all current messages.
   * Regenerates the system prompt with current cwd.
   * Saved messages no longer include system prompt (since getMessagesForSave filters it).
   */
  restoreMessages(savedMessages: ChatCompletionMessageParam[]): void {
    // Regenerate system prompt with current cwd
    this.messages = [
      {
        role: 'system',
        content: getSystemPrompt(process.cwd(), this.mcpToolDescriptions),
      },
      // Saved messages don't include system prompt anymore,
      // but handle old format where index 0 was system prompt
      ...(savedMessages[0]?.role === 'system' ? savedMessages.slice(1) : savedMessages),
    ];
    this.ephemeralContext.clear();
    logger.debug('Messages restored', { count: this.messages.length });
  }
}
