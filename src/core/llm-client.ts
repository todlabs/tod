import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { AgentConfig, StreamChunk, ToolCallChunk } from "./types.js";
import { logger } from "../services/logger.js";
import { COMPACT_SUMMARY_PROMPT } from "../prompts/system.js";

export class LLMClient {
  private openai: OpenAI;
  private _config: AgentConfig;

  constructor(config: AgentConfig) {
    this._config = config;
    this.openai = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      // 15 minutes — reasoning models (o1, deepseek-r1, mimimo) can think 3-5+ min
      // We rely on AbortController for user cancellation
      timeout: 15 * 60 * 1000,
      // Disable OpenAI's internal retries — we handle them ourselves
      maxRetries: 0,
      defaultHeaders: config.headers || {},
    });

    logger.info("LLMClient initialized", { model: config.model });
  }

  /**
   * Determine if an error is transient and worth retrying.
   * Retryable: network errors, 429 (rate limit), 500/502/503 (server errors).
   * Not retryable: 400 (bad request), 401 (auth), and other 4xx client errors.
   */
  private isRetryableError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      // Unknown error types are treated as potentially transient
      return true;
    }

    const apiError = error as any;
    const status = apiError.status;

    if (status) {
      // Rate limit and server errors are retryable
      if (
        status === 429 ||
        status === 500 ||
        status === 502 ||
        status === 503
      ) {
        return true;
      }
      // Client errors (400, 401, 403, 404, etc.) are not retryable
      if (status >= 400 && status < 500) {
        return false;
      }
    }

    // Check for common network error codes
    const code = apiError.code;
    if (
      code === "ECONNRESET" ||
      code === "ETIMEDOUT" ||
      code === "ECONNREFUSED" ||
      code === "ENOTFOUND" ||
      code === "ENETUNREACH"
    ) {
      return true;
    }

    // Errors without a status code are likely network issues — retryable
    return !status;
  }

  /**
   * Sleep for the specified duration, aborting early if the signal fires.
   */
  private async sleepWithAbort(
    ms: number,
    signal?: AbortSignal,
  ): Promise<void> {
    if (signal?.aborted) throw new Error("Aborted");

    return new Promise<void>((resolve, reject) => {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      let onAbort: (() => void) | undefined;

      const cleanup = () => {
        if (timeout !== undefined) clearTimeout(timeout);
        if (onAbort && signal) signal.removeEventListener("abort", onAbort);
      };

      timeout = setTimeout(() => {
        cleanup();
        resolve();
      }, ms);

      if (signal) {
        onAbort = () => {
          cleanup();
          reject(new Error("Aborted"));
        };
        signal.addEventListener("abort", onAbort);
      }
    });
  }

  /**
   * Execute an async function with exponential backoff retry logic.
   * Delays: 1s + jitter, 2s + jitter, 4s + jitter (for attempts 0, 1, 2).
   */
  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number,
    signal?: AbortSignal,
  ): Promise<T> {
    let lastError: Error = new Error("Unknown error");

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (signal?.aborted) {
        throw new Error("Aborted");
      }

      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (!this.isRetryableError(error)) {
          throw lastError;
        }

        if (attempt >= maxRetries) {
          logger.error("Max retries exceeded", {
            maxRetries,
            error: lastError.message,
          });
          throw lastError;
        }

        const baseDelay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
        const jitter = Math.random() * 500; // 0–500ms jitter
        const delay = baseDelay + jitter;

        logger.info("Retrying after error", {
          attempt: attempt + 1,
          maxRetries,
          delay: Math.round(delay),
          error: lastError.message,
        });

        await this.sleepWithAbort(delay, signal);
      }
    }

    throw lastError;
  }

  async *streamCompletion(
    messages: ChatCompletionMessageParam[],
    tools: any[],
    signal?: AbortSignal,
  ): AsyncGenerator<StreamChunk> {
    const maxRetries = 3;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (signal?.aborted) return;

      let chunksYielded = false;

      try {
        logger.debug("Starting stream completion", {
          messageCount: messages.length,
          model: this._config.model,
          attempt: attempt + 1,
        });

        const requestParams: any = {
          model: this._config.model,
          messages: messages,
          max_tokens: this._config.maxTokens,
          stream: true,
        };

        // Some providers reject both temperature and top_p — only send temperature
        if (this._config.temperature !== 1) {
          requestParams.temperature = this._config.temperature;
        }

        if (tools && tools.length > 0) {
          requestParams.tools = tools;
          requestParams.tool_choice = "auto";
        }

        logger.debug("Making API request", {
          model: requestParams.model,
          hasTools: !!requestParams.tools,
        });

        const completion = await (this.openai.chat.completions.create as any)(
          requestParams,
          signal ? { signal } : undefined,
        );

        logger.debug("Stream response received");

        for await (const chunk of completion) {
          if (signal?.aborted) return;

          const delta = chunk.choices[0]?.delta as any;

          const streamChunk: StreamChunk = {
            content: "",
            thinking: "",
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
                  name: toolCall.function?.name || "",
                  arguments: toolCall.function?.arguments || "",
                },
              });
            }
          }

          chunksYielded = true;
          yield streamChunk;
        }

        logger.debug("Stream completion finished");
        return; // success — exit the retry loop
      } catch (error) {
        if (signal?.aborted) return;

        // If chunks were already yielded, we cannot safely retry a partial stream
        if (chunksYielded) {
          const partialErrorDetails = {
            message: error instanceof Error ? error.message : String(error),
            name: error instanceof Error ? error.name : "Unknown",
            model: this._config.model,
          };
          logger.error(
            "Stream broke after partial output",
            partialErrorDetails,
          );
          throw new Error(
            `LLM API Error (${partialErrorDetails.name}): ${partialErrorDetails.message}`,
          );
        }

        // Build error details for logging (preserving original log messages)
        const errorDetails: any = {
          message: error instanceof Error ? error.message : String(error),
          name: error instanceof Error ? error.name : "Unknown",
          model: this._config.model,
          messageCount: messages.length,
          hasTools: tools && tools.length > 0,
        };

        if (error instanceof Error && "status" in error) {
          const apiError = error as any;
          errorDetails.status = apiError.status;
          errorDetails.code = apiError.code;
          errorDetails.type = apiError.type;

          logger.error("API Error", errorDetails);

          if (apiError.status === 400) {
            logger.error("Bad Request - possible issues:", {
              invalidModel: "Model name or parameters",
              invalidMessages: "Message format or content",
              invalidTools: "Tools definition or tool_choice",
            });
          }
        } else {
          logger.error("Stream completion failed", errorDetails);
        }

        // Non-retryable errors — throw immediately
        if (!this.isRetryableError(error)) {
          throw new Error(
            `LLM API Error (${errorDetails.name}): ${errorDetails.message}`,
          );
        }

        // Exhausted retries — throw
        if (attempt >= maxRetries) {
          logger.error("Max retries exceeded for stream completion", {
            maxRetries,
            error: errorDetails.message,
          });
          throw new Error(
            `LLM API Error (${errorDetails.name}): ${errorDetails.message}`,
          );
        }

        // Retry with exponential backoff + jitter
        const baseDelay = Math.pow(2, attempt) * 1000;
        const jitter = Math.random() * 500;
        const delay = baseDelay + jitter;

        logger.info("Retrying stream completion", {
          attempt: attempt + 1,
          maxRetries,
          delay: Math.round(delay),
          error: errorDetails.message,
        });

        try {
          await this.sleepWithAbort(delay, signal);
        } catch {
          // Aborted during sleep
          return;
        }
      }
    }
  }

  async createSummary(conversation: string): Promise<string> {
    logger.debug("Creating conversation summary", {
      length: conversation.length,
    });

    try {
      return await this.retryWithBackoff(async () => {
        const completion = await this.openai.chat.completions.create({
          model: this._config.model,
          messages: [
            {
              role: "system",
              content: COMPACT_SUMMARY_PROMPT,
            },
            {
              role: "user",
              content: conversation,
            },
          ],
          temperature: 0.3,
          max_tokens: 1500,
          stream: false,
        });

        const summary =
          completion.choices[0]?.message?.content ||
          "Failed to generate summary";
        logger.debug("Summary created", { summaryLength: summary.length });

        return summary;
      }, 3);
    } catch (error) {
      logger.error("Failed to create summary", { error });
      throw error;
    }
  }

  get config(): AgentConfig {
    return this._config;
  }
}
