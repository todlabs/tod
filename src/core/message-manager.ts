import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type { AgentMessage } from './types.js';
import { getSystemPrompt } from '../prompts/system.js';
import { logger } from '../services/logger.js';
import * as os from 'os';
import * as path from 'path';

export class MessageManager {
  private messages: ChatCompletionMessageParam[] = [];
  private mcpToolDescriptions?: string;

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
    logger.debug('Messages reset');
  }

  setMcpToolDescriptions(descriptions: string): void {
    this.mcpToolDescriptions = descriptions;
    // Update the system message
    if (this.messages.length > 0 && this.messages[0].role === 'system') {
      this.messages[0] = {
        role: 'system',
        content: getSystemPrompt(process.cwd(), descriptions),
      };
    }
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

  getAgentMessages(): AgentMessage[] {
    return this.messages.map((msg: any): AgentMessage => {
      const content = typeof msg.content === 'string' ? msg.content : (msg.content ? JSON.stringify(msg.content) : '');

      if (msg.role === 'tool') {
        return {
          role: 'tool',
          content,
          toolName: msg.name,
        };
      }

      return {
        role: msg.role as 'user' | 'assistant' | 'system',
        content,
      };
    });
  }

  getConversationMessages(): ChatCompletionMessageParam[] {
    return this.messages.slice(1); // Exclude system message
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
}
