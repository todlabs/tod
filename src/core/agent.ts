import type {
  AgentConfig,
  AgentMessage,
  ToolCallChunk,
  StreamChunk,
} from "./types.js";
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { LLMClient } from "./llm-client.js";
import { MessageManager } from "./message-manager.js";
import {
  tools,
  executeTool,
  isAsyncTool,
  formatToolCall,
  getMcpTools,
} from "../tools/index.js";
import { logger } from "../services/logger.js";

const MAX_AGENT_ITERATIONS = 25;
const MAX_TOOL_RETRIES = 2;
const MAX_SAME_TOOL_CALLS = 3;
const MAX_PROCESS_MESSAGE_RETRIES = 2;
const ZOMBIE_GUARD_TIMEOUT_MS = 5 * 60 * 1000;

export function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return true;
  }

  if (error.name === "AbortError" || error.message === "Aborted") {
    return false;
  }

  const apiError = error as any;
  const status = apiError.status;

  if (status) {
    if (status === 429 || status === 500 || status === 502 || status === 503) {
      return true;
    }
    if (status >= 400 && status < 500) {
      return false;
    }
  }

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

  return !status;
}

function sleepWithAbort(
  ms: number,
  signal?: AbortSignal | null,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Aborted"));
      return;
    }

    const timer = setTimeout(resolve, ms);

    if (signal) {
      const onAbort = () => {
        clearTimeout(timer);
        reject(new Error("Aborted"));
      };
      signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}

export interface AgentProcessCallbacks {
  onChunk: (chunk: AgentMessage) => void;
  onToolCall: (toolName: string, args: unknown) => void;
}

export class Agent {
  private llm: LLMClient;
  private messages: MessageManager;
  private messageManagers: Map<string, MessageManager> = new Map();
  private mcpToolDescriptions?: string;
  private isProcessing = false;
  private abortController: AbortController | null = null;
  private zombieGuardTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: AgentConfig) {
    this.llm = new LLMClient(config);
    const providerKey = (config as any).provider || "default";
    this.messages = new MessageManager();
    this.messageManagers.set(providerKey, this.messages);
    logger.info("Agent created");
  }

  isBusy(): boolean {
    return this.isProcessing;
  }

  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.clearZombieGuard();
    this.isProcessing = false;
  }

  forceUnstick(): void {
    logger.warn("Force-unsticking agent", {
      isProcessing: this.isProcessing,
      hadAbortController: this.abortController !== null,
      hadZombieGuard: this.zombieGuardTimer !== null,
    });

    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    this.clearZombieGuard();
    this.isProcessing = false;
  }

  private startZombieGuard(): void {
    this.clearZombieGuard();

    this.zombieGuardTimer = setTimeout(() => {
      if (this.isProcessing) {
        logger.error(
          "Zombie guard fired — agent stuck for too long, force-releasing",
          {
            isProcessing: this.isProcessing,
            hadAbortController: this.abortController !== null,
          },
        );

        if (this.abortController) {
          this.abortController.abort();
          this.abortController = null;
        }
        this.isProcessing = false;
      }
    }, ZOMBIE_GUARD_TIMEOUT_MS);

    if (this.zombieGuardTimer.unref) {
      this.zombieGuardTimer.unref();
    }
  }

  private clearZombieGuard(): void {
    if (this.zombieGuardTimer) {
      clearTimeout(this.zombieGuardTimer);
      this.zombieGuardTimer = null;
    }
  }

  async processMessage(
    userMessage: string,
    callbacks: AgentProcessCallbacks,
  ): Promise<void> {
    if (this.isProcessing) {
      throw new Error("Agent is already processing a message");
    }

    this.isProcessing = true;
    this.abortController = new AbortController();
    this.startZombieGuard();
    logger.info("Processing user message", { length: userMessage.length });

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_PROCESS_MESSAGE_RETRIES; attempt++) {
      try {
        if (attempt === 0) {
          this.messages.addMessage("user", userMessage);
        }

        await this.runAgentLoop(callbacks);

        this.isProcessing = false;
        this.abortController = null;
        this.clearZombieGuard();
        logger.debug("Message processing finished");
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (!isRetryableError(lastError)) {
          logger.error("Non-retryable error in processMessage", {
            error: lastError.message,
            attempt,
          });
          break;
        }

        if (attempt >= MAX_PROCESS_MESSAGE_RETRIES) {
          logger.error("Max processMessage retries exceeded", {
            maxRetries: MAX_PROCESS_MESSAGE_RETRIES,
            error: lastError.message,
          });
          break;
        }

        const baseDelay = Math.pow(2, attempt) * 1000;
        const jitter = Math.random() * 500;
        const delay = baseDelay + jitter;

        logger.info("Retrying processMessage after retryable error", {
          attempt: attempt + 1,
          maxRetries: MAX_PROCESS_MESSAGE_RETRIES,
          delay: Math.round(delay),
          error: lastError.message,
        });

        this.isProcessing = true;
        if (!this.abortController || this.abortController.signal.aborted) {
          logger.info("Aborted between processMessage retries, stopping");
          break;
        }

        try {
          await sleepWithAbort(delay, this.abortController.signal);
        } catch {
          break;
        }

        this.startZombieGuard();
      }
    }

    this.isProcessing = false;
    this.abortController = null;
    this.clearZombieGuard();

    const errorMsg = lastError?.message ?? "Unknown error";
    logger.error("Agent loop error", { error: errorMsg });

    this.messages.addMessage("assistant", `[Error: ${errorMsg}]`);

    callbacks.onChunk({
      role: "assistant",
      content: `An error occurred: ${errorMsg}`,
    });

    logger.debug("Message processing finished (with error)");
  }

  private async runAgentLoop(callbacks: AgentProcessCallbacks): Promise<void> {
    const allTools = [...tools, ...getMcpTools()];

    const recentToolCalls: Array<{ name: string; args: string }> = [];

    for (let iteration = 0; iteration < MAX_AGENT_ITERATIONS; iteration++) {
      const signal = this.abortController?.signal;
      if (signal?.aborted) break;

      let assistantMessage = "";
      const accumulatedToolCalls: Map<number, ToolCallChunk> = new Map();

      let streamRetriesRemaining = 1;

      while (true) {
        assistantMessage = "";
        accumulatedToolCalls.clear();

        try {
          for await (const chunk of this.llm.streamCompletion(
            this.messages.getMessagesWithEphemeral(),
            allTools,
            signal,
          )) {
            if (signal?.aborted) break;

            if (chunk.thinking) {
              callbacks.onChunk({
                role: "assistant",
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
                  function: { name: "", arguments: "" },
                });
              }
              const accumulated = accumulatedToolCalls.get(toolCall.index)!;
              accumulated.function.name += toolCall.function.name;
              accumulated.function.arguments += toolCall.function.arguments;
            }
          }

          break;
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : String(error);
          logger.error("Stream failed mid-way", { error: errorMsg });

          if (
            streamRetriesRemaining > 0 &&
            isRetryableError(error) &&
            !signal?.aborted
          ) {
            streamRetriesRemaining--;
            logger.info("Retrying stream iteration after mid-stream failure", {
              iteration,
              streamRetriesRemaining,
              error: errorMsg,
            });

            const retryDelay = 1000 + Math.random() * 500;
            try {
              await sleepWithAbort(retryDelay, signal);
            } catch {
              break;
            }

            continue;
          }

          if (assistantMessage) {
            this.messages.addMessage("assistant", assistantMessage);
            callbacks.onChunk({
              role: "assistant",
              content: assistantMessage,
            });
          }

          callbacks.onChunk({
            role: "assistant",
            content: `[Stream error: ${errorMsg}]`,
          });
          break;
        }
      }

      if (assistantMessage) {
        this.messages.addMessage("assistant", assistantMessage);
        callbacks.onChunk({
          role: "assistant",
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
          parsedArgs = JSON.parse(tc.function.arguments || "{}");
        } catch (error) {
          logger.error("Failed to parse tool arguments", {
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
          type: "function" as const,
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments,
          },
        })),
      );

      for (const toolCall of toolCallsWithIds) {
        if (signal?.aborted) break;

        const toolName = toolCall.function.name;
        const toolArgs = toolCall.parsedArgs;
        const argsKey = JSON.stringify(toolArgs);

        const sameCallCount = recentToolCalls.filter(
          (tc) => tc.name === toolName && tc.args === argsKey,
        ).length;

        if (sameCallCount >= MAX_SAME_TOOL_CALLS) {
          logger.warn("Infinite tool loop detected", {
            toolName,
            args: argsKey,
            count: sameCallCount,
          });

          const loopWarning = `Warning: The tool "${toolName}" was called ${MAX_SAME_TOOL_CALLS} times with the same arguments in a row. Breaking to prevent an infinite loop.`;

          this.messages.addMessage("tool", loopWarning, {
            tool_call_id: toolCall.id,
          });

          callbacks.onChunk({
            role: "tool",
            content: loopWarning,
            toolName: formatToolCall(toolName, toolArgs),
          });

          return;
        }

        recentToolCalls.push({ name: toolName, args: argsKey });
        if (recentToolCalls.length > MAX_SAME_TOOL_CALLS * 2) {
          recentToolCalls.splice(
            0,
            recentToolCalls.length - MAX_SAME_TOOL_CALLS * 2,
          );
        }

        callbacks.onToolCall(toolName, toolArgs);

        let result: string = "";
        const toolResult = executeTool(toolName, toolArgs);

        if (toolResult instanceof Promise) {
          let lastError: Error | null = null;
          let succeeded = false;

          for (let attempt = 0; attempt <= MAX_TOOL_RETRIES; attempt++) {
            try {
              if (attempt > 0) {
                logger.info("Retrying async tool", {
                  toolName,
                  attempt,
                });
              }
              result = await (attempt === 0
                ? toolResult
                : executeTool(toolName, toolArgs));
              succeeded = true;
              logger.info("Async tool completed", {
                toolName,
                resultLength: result.length,
              });
              break;
            } catch (error) {
              lastError =
                error instanceof Error ? error : new Error(String(error));
              logger.error("Async tool execution failed", {
                toolName,
                attempt,
                error: lastError.message,
              });
            }
          }

          if (!succeeded) {
            result = `[Tool error: ${toolName} failed after ${MAX_TOOL_RETRIES + 1} attempts. Last error: ${lastError?.message}]`;
            logger.error("Async tool exhausted retries", {
              toolName,
              error: lastError?.message,
            });
          }
        } else {
          try {
            result = toolResult;
          } catch (error) {
            const errorMsg =
              error instanceof Error ? error.message : String(error);
            result = `[Tool error: ${toolName} failed. Error: ${errorMsg}]`;
            logger.error("Sync tool execution failed", {
              toolName,
              error: errorMsg,
            });
          }
        }

        if (result.startsWith("Error:")) {
          logger.error("Tool returned an error result", {
            toolName,
            errorResult: result,
          });
          result = `[Tool error: ${toolName} returned: ${result}]`;
        }

        this.messages.addMessage("tool", result, {
          tool_call_id: toolCall.id,
        });

        callbacks.onChunk({
          role: "tool",
          content: result,
          toolName: formatToolCall(toolName, toolArgs),
        });
      }
    }
  }

  async compactContext(): Promise<{
    oldTokens: number;
    newTokens: number;
    summary: string;
  }> {
    logger.info("Compacting context");

    const conversationMessages = this.messages.getConversationMessages();

    if (conversationMessages.length === 0) {
      return { oldTokens: 0, newTokens: 0, summary: "No messages to compact" };
    }

    const oldTokens = this.messages.estimateTokens();

    const conversationText = conversationMessages
      .map((msg: any) => {
        const content =
          typeof msg.content === "string"
            ? msg.content
            : JSON.stringify(msg.content);
        if (msg.role === "user") return `User: ${content}`;
        if (msg.role === "assistant") return `Assistant: ${content}`;
        if (msg.role === "tool")
          return `Tool (${msg.tool_call_id}): ${content}`;
        if (msg.role === "system") return `System: ${content}`;
        return content;
      })
      .join("\n\n");

    const summary = await this.llm.createSummary(conversationText);
    const newTokens = Math.round(summary.length / 4);

    this.messages.compact(summary);

    logger.info("Context compacted", {
      oldTokens,
      newTokens,
      saved: oldTokens - newTokens,
    });

    return { oldTokens, newTokens, summary };
  }

  reset(): void {
    this.abort();
    for (const manager of this.messageManagers.values()) manager.reset();
    logger.info("Agent reset");
  }

  getConfig(): AgentConfig {
    return this.llm.config;
  }

  updateConfig(config: AgentConfig): void {
    this.llm = new LLMClient(config);

    const providerKey = (config as any).provider || "default";
    if (!this.messageManagers.has(providerKey)) {
      const manager = new MessageManager(this.mcpToolDescriptions);
      this.messageManagers.set(providerKey, manager);
    }
    this.messages = this.messageManagers.get(providerKey)!;

    logger.info("Agent config updated", {
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

  // --- Chat persistence ---

  getMessagesForSave(): ChatCompletionMessageParam[] {
    return this.messages.getMessages();
  }

  restoreMessages(savedMessages: ChatCompletionMessageParam[]): void {
    this.messages.restoreMessages(savedMessages);
    logger.info("Chat restored", { messageCount: savedMessages.length });
  }

  getAgentMessages(): AgentMessage[] {
    return this.messages.getAgentMessages();
  }
}
