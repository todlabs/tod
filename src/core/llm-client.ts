import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type { AgentConfig, StreamChunk, ToolCallChunk } from './types.js';
import { logger } from '../services/logger.js';

export interface StreamCallbacks {
  onChunk: (chunk: StreamChunk) => void;
  onToolCall?: (toolName: string, args: unknown) => void;
}

export class LLMClient {
  private openai: OpenAI;
  private _config: AgentConfig;

  constructor(config: AgentConfig) {
    this._config = config;
    this.openai = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    });

    logger.info('LLMClient initialized', { model: config.model });
  }

  async *streamCompletion(
    messages: ChatCompletionMessageParam[],
    tools: any[]
  ): AsyncGenerator<StreamChunk> {
    logger.debug('Starting stream completion', { messageCount: messages.length, model: this._config.model });

    // Фильтруем сообщения для отладки
    const filteredMessages = messages.map(msg => ({
      role: msg.role,
      content: msg.content ? String(msg.content).substring(0, 200) : '',
      tool_calls: (msg as any).tool_calls ? `${(msg as any).tool_calls.length} calls` : undefined
    }));

    try {
      const requestParams: any = {
        model: this._config.model,
        messages: messages,
        temperature: this._config.temperature,
        top_p: 1,
        max_tokens: this._config.maxTokens,
        stream: true,
      };

      // Добавляем tools только если они есть
      if (tools && tools.length > 0) {
        requestParams.tools = tools;
        requestParams.tool_choice = 'auto';
      }

      logger.debug('Making API request', { 
        model: requestParams.model,
        hasTools: !!requestParams.tools,
        hasThinking: !!requestParams.chat_template_kwargs 
      });

      const completion = await (this.openai.chat.completions.create as any)(requestParams);

      logger.debug('Stream response received');

      for await (const chunk of completion) {
        const delta = chunk.choices[0]?.delta as any;
        
        const streamChunk: StreamChunk = {
          content: '',
          thinking: '',
          toolCalls: [],
        };

        if (delta?.reasoning_content) {
          streamChunk.thinking = delta.reasoning_content;
        }

        if (delta?.content) {
          streamChunk.content = delta.content;
        }

        if (delta?.tool_calls) {
          for (const toolCall of delta.tool_calls) {
            streamChunk.toolCalls.push({
              index: toolCall.index,
              id: toolCall.id,
              function: {
                name: toolCall.function?.name || '',
                arguments: toolCall.function?.arguments || '',
              },
            });
          }
        }

        yield streamChunk;
      }

      logger.debug('Stream completion finished');
    } catch (error) {
      const errorDetails = {
        message: error instanceof Error ? error.message : String(error),
        name: error instanceof Error ? error.name : 'Unknown',
        model: this._config.model,
        messageCount: messages.length,
        hasTools: tools && tools.length > 0
      };

      // Дополнительная диагностика для API ошибок
      if (error instanceof Error && 'status' in error) {
        const apiError = error as any;
        (errorDetails as any).status = apiError.status;
        (errorDetails as any).code = apiError.code;
        (errorDetails as any).type = apiError.type;
        
        logger.error('API Error', errorDetails);
        
        // Проверяем специфические ошибки
        if (apiError.status === 400) {
          logger.error('Bad Request - possible issues:', {
            invalidModel: 'Model name or parameters',
            invalidMessages: 'Message format or content',
            invalidTools: 'Tools definition or tool_choice',
            invalidThinkingParams: 'chat_template_kwargs not supported by this model'
          });
        }
      } else {
        logger.error('Stream completion failed', errorDetails);
      }

      throw new Error(`LLM API Error (${errorDetails.name}): ${errorDetails.message}`);
    }
  }

  async createSummary(conversation: string): Promise<string> {
    logger.debug('Creating conversation summary', { length: conversation.length });

    try {
      const completion = await this.openai.chat.completions.create({
        model: this._config.model,
        messages: [
          {
            role: 'system',
            content: 'Summarize the following conversation in a concise way, preserving key information and context.',
          },
          {
            role: 'user',
            content: conversation,
          },
        ],
        temperature: 0.3,
        max_tokens: 1000,
        stream: false,
      });

      const summary = completion.choices[0]?.message?.content || 'Failed to generate summary';
      logger.debug('Summary created', { summaryLength: summary.length });

      return summary;
    } catch (error) {
      logger.error('Failed to create summary', { error });
      throw error;
    }
  }

  get config(): AgentConfig {
    return this._config;
  }
}
