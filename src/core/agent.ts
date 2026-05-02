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
import type { ToolResult } from "../tools/index.js";
import { logger } from "../services/logger.js";
import { findTriggeredSkills } from "../services/skills.js";

const MAX_TOOL_RETRIES = 2;
const MAX_SAME_TOOL_CALLS = 3;
const MAX_PROCESS_MESSAGE_RETRIES = 2;
// 10 minutes of silence (no chunks at all) = something is truly stuck.
// Reset on every chunk, so reasoning models that stream thinking won't trigger it.
const ZOMBIE_GUARD_TIMEOUT_MS = 10 * 60 * 1000;

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
  onToolCallStart?: (toolName: string, args: Partial<Record<string, unknown>>) => void;
  onToolApproval?: (toolName: string, args: Record<string, unknown>) => boolean;
}

// Dangerous shell command patterns that require approval
const DANGEROUS_SHELL_PATTERNS = [
  /\brm\s+(-rf?|-fr?|--force)/,
  /\bgit\s+push\s+.*--force/,
  /\bgit\s+push\s+.*-f\b/,
  /\bnpm\s+publish/,
  /\bdocker\s+rm/,
  /\bmkfs\b/,
  /\bdd\s+/,
  /\bchmod\s+-R\s+777/,
  /\b:()\s*>\s*\//,  // redirect overwrite to root
  /\bcurl\s+.*\|\s*sh/,
  /\bwget\s+.*\|\s*sh/,
];

function isDangerousTool(toolName: string, args: Record<string, unknown>): boolean {
  if (toolName === "execute_shell" && typeof args.command === "string") {
    const cmd = args.command as string;
    return DANGEROUS_SHELL_PATTERNS.some(p => p.test(cmd));
  }
  return false;
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
          "Zombie guard fired — agent silent for too long, force-releasing",
          {
            isProcessing: this.isProcessing,
            hadAbortController: this.abortController !== null,
            timeoutMs: ZOMBIE_GUARD_TIMEOUT_MS,
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

  /**
   * Reset zombie guard timer — called on every stream chunk so long-thinking
   * reasoning models don't trigger the guard. Only fires if truly silent.
   */
  private resetZombieGuard(): void {
    if (this.isProcessing) {
      this.startZombieGuard();
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
          this.loadTriggeredSkills(userMessage);
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

    for (let iteration = 0; ; iteration++) {
      const signal = this.abortController?.signal;
      if (signal?.aborted) break;

      let assistantMessage = "";
      const accumulatedToolCalls: Map<number, ToolCallChunk> = new Map();
      const emittedToolCallStart: Set<number> = new Set();

      let streamRetriesRemaining = 1;

      while (true) {
        assistantMessage = "";
        accumulatedToolCalls.clear();
        emittedToolCallStart.clear();

        try {
          for await (const chunk of this.llm.streamCompletion(
            this.messages.getMessagesWithEphemeral(),
            allTools,
            signal,
          )) {
            if (signal?.aborted) break;

            // Reset zombie guard on every chunk — reasoning models may
            // stream thinking for minutes, that's not stuck
            this.resetZombieGuard();

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

              // Emit onToolCallStart as soon as we have a tool name
              if (
                accumulated.function.name &&
                !emittedToolCallStart.has(toolCall.index) &&
                callbacks.onToolCallStart
              ) {
                emittedToolCallStart.add(toolCall.index);
                let partialArgs: Partial<Record<string, unknown>> = {};
                try {
                  partialArgs = JSON.parse(accumulated.function.arguments || "{}");
                } catch {}
                callbacks.onToolCallStart(accumulated.function.name, partialArgs);
              }
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

        let toolRes: ToolResult = { text: "" };

        // Check approval for dangerous tools
        if (callbacks.onToolApproval && isDangerousTool(toolName, toolArgs as Record<string, unknown>)) {
          const approved = callbacks.onToolApproval(toolName, toolArgs as Record<string, unknown>);
          if (!approved) {
            toolRes = { text: "Tool execution denied by user" };
            this.messages.addMessage("tool", toolRes.text, {
              tool_call_id: toolCall.id,
              name: toolName,
            });
            callbacks.onChunk({
              role: "tool",
              content: toolRes.text,
              toolName,
            });
            continue;
          }
        }

        const toolResultPromise = executeTool(toolName, toolArgs);

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
            toolRes = await (attempt === 0
              ? toolResultPromise
              : executeTool(toolName, toolArgs));
            succeeded = true;
            logger.info("Tool completed", {
              toolName,
              resultLength: toolRes.text.length,
            });
            break;
          } catch (error) {
            lastError =
              error instanceof Error ? error : new Error(String(error));
            logger.error("Tool execution failed", {
              toolName,
              attempt,
              error: lastError.message,
            });
          }
        }

        if (!succeeded) {
          toolRes = {
            text: `[Tool error: ${toolName} failed after ${MAX_TOOL_RETRIES + 1} attempts. Last error: ${lastError?.message}]`,
          };
          logger.error("Tool exhausted retries", {
            toolName,
            error: lastError?.message,
          });
        }

        const result = toolRes.text;

        if (result.startsWith("Error:")) {
          logger.error("Tool returned an error result", {
            toolName,
            errorResult: result,
          });
          toolRes.text = `[Tool error: ${toolName} returned: ${result}]`;
        }

        this.messages.addMessage("tool", toolRes.text, {
          tool_call_id: toolCall.id,
        });

        callbacks.onChunk({
          role: "tool",
          content: toolRes.text,
          toolName: formatToolCall(toolName, toolArgs),
          diff: toolRes.diff,
        });

        // Reset zombie guard after tool completes — tools can take a while
        this.resetZombieGuard();
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

    // Structured compact: preserve last few user/assistant turns so the next
    // request still has fresh context, plus the structured summary.
    this.messages.compactStructured(summary, 4);

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

  /**
   * Inspect the latest user message for skill triggers; inject matching
   * on-demand skills as ephemeral context so the model has them for this turn.
   */
  private loadTriggeredSkills(userMessage: string): void {
    try {
      const matched = findTriggeredSkills(process.cwd(), userMessage);
      for (const skill of matched) {
        const key = `skill:${skill.name}`;
        const content = `ACTIVE SKILL [${skill.name}] ${skill.description}\n${skill.content}`;
        this.messages.setEphemeralContext(key, content);
        logger.info("Auto-loaded skill via trigger", {
          skill: skill.name,
          triggers: skill.triggers,
        });
      }
    } catch (error) {
      logger.error("Skill trigger matching failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  setMcpToolDescriptions(descriptions: string): void {
    this.mcpToolDescriptions = descriptions;
    for (const manager of this.messageManagers.values()) {
      manager.setMcpToolDescriptions(descriptions);
    }
  }

  // --- Chat persistence ---

  getMessagesForSave(): ChatCompletionMessageParam[] {
    return this.messages.getMessagesForSave();
  }

  restoreMessages(savedMessages: ChatCompletionMessageParam[]): void {
    this.messages.restoreMessages(savedMessages);
    logger.info("Chat restored", { messageCount: savedMessages.length });
  }

  getAgentMessages(): AgentMessage[] {
    return this.messages.getAgentMessages();
  }
}
