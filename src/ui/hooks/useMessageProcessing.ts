import { useState, useCallback, useRef } from "react";
import type { Agent, AgentMessage } from "../../agent/index.js";
import { logger } from "../../services/logger.js";

const MAX_MESSAGE_RETRIES = 2;

interface UseMessageProcessingReturn {
  messages: AgentMessage[];
  currentThinking: string;
  isProcessing: boolean;
  status: string;
  shouldStop: boolean;
  pendingCount: number;
  processMessage: (message: string) => Promise<void>;
  queueMessage: (message: string) => void;
  stopProcessing: () => void;
  resetMessages: () => void;
  addMessage: (message: AgentMessage) => void;
}

export function useMessageProcessing(agent: Agent): UseMessageProcessingReturn {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [currentThinking, setCurrentThinking] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState("");
  const [shouldStop, setShouldStop] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const shouldStopRef = useRef(false);
  const queueRef = useRef<string[]>([]);
  const isProcessingRef = useRef(false);

  const processOneMessage = useCallback(
    async (userMessage: string) => {
      setIsProcessing(true);
      isProcessingRef.current = true;
      setCurrentThinking("");
      setStatus("");

      const userMsg: AgentMessage = {
        role: "user",
        content: userMessage,
      };

      setMessages((prev) => [...prev, userMsg]);

      let currentAssistantMessage = "";
      let lastThinkingUpdate = "";
      let thinkingStartTime = 0;
      let hasActiveAssistantMessage = false;
      let lastThinkingRender = 0;

      const saveThinking = () => {
        if (lastThinkingUpdate && thinkingStartTime) {
          const thinkingTime = Date.now() - thinkingStartTime;
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: lastThinkingUpdate,
              isThinking: true,
              thinkingTime,
            },
          ]);
          lastThinkingUpdate = "";
          thinkingStartTime = 0;
          setCurrentThinking("");
        }
      };

      const saveAssistantMessage = () => {
        if (currentAssistantMessage.trim() && hasActiveAssistantMessage) {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: currentAssistantMessage.trim(),
            },
          ]);
          currentAssistantMessage = "";
          hasActiveAssistantMessage = false;
        }
      };

      const savePartialMessages = () => {
        saveThinking();
        saveAssistantMessage();
      };

      try {
        setShouldStop(false);
        shouldStopRef.current = false;

        await agent.processMessage(userMessage, {
          onChunk: (chunk) => {
            if (shouldStopRef.current) {
              return;
            }

            if (chunk.isThinking) {
              if (!thinkingStartTime) {
                thinkingStartTime = Date.now();
              }
              lastThinkingUpdate += chunk.content;
              const now = Date.now();
              if (now - lastThinkingRender > 100) {
                setCurrentThinking(lastThinkingUpdate);
                lastThinkingRender = now;
              }
              setStatus("Thinking");
            } else if (chunk.role === "assistant") {
              saveThinking();
              currentAssistantMessage += chunk.content;
              hasActiveAssistantMessage = true;
            } else if (chunk.role === "tool") {
              saveThinking();
              saveAssistantMessage();
              setMessages((prev) => [...prev, chunk]);
              setStatus(`Tool: ${chunk.toolName || "running"}`);
            }
          },
          onToolCall: (toolName) => {
            saveThinking();
            saveAssistantMessage();
            setStatus(`Calling: ${toolName}`);
          },
        });

        saveThinking();
        saveAssistantMessage();

        logger.info("Message processed successfully");
      } catch (error) {
        savePartialMessages();

        const errorMsg = error instanceof Error ? error.message : String(error);

        // Check if the agent is stuck (isProcessing still true after error)
        if (agent.isBusy()) {
          logger.warn("Agent stuck after error, force-unsticking");
          agent.forceUnstick();
        }

        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `⚠ ${errorMsg}` },
        ]);
        logger.error("Message processing failed", { error: errorMsg });
      } finally {
        setIsProcessing(false);
        isProcessingRef.current = false;
        setCurrentThinking("");
        setStatus("");
        setShouldStop(false);
        shouldStopRef.current = false;

        // Safety check: if agent is still busy, force-unstick
        if (agent.isBusy()) {
          agent.forceUnstick();
        }
      }
    },
    [agent],
  );

  // Drain the queue: process next message if available
  const drainQueue = useCallback(async () => {
    const next = queueRef.current.shift();
    if (next !== undefined) {
      setPendingCount(queueRef.current.length);
      logger.info(
        `Processing queued message (${queueRef.current.length} remaining in queue)`,
      );
      await processOneMessage(next);
      drainQueue();
    }
  }, [processOneMessage]);

  // Non-blocking version: queue the message if currently processing
  const queueMessage = useCallback(
    (message: string) => {
      if (!message.trim()) return;

      if (isProcessingRef.current) {
        queueRef.current.push(message);
        setPendingCount(queueRef.current.length);
        logger.info(`Message queued (${queueRef.current.length} pending)`);
      } else {
        processOneMessage(message).then(() => {
          drainQueue();
        });
      }
    },
    [processOneMessage, drainQueue],
  );

  // Blocking version (for backwards compat / first message)
  const processMessage = useCallback(
    async (userMessage: string) => {
      if (!userMessage.trim()) return;

      if (isProcessingRef.current) {
        queueRef.current.push(userMessage);
        setPendingCount(queueRef.current.length);
        logger.info(`Message queued (${queueRef.current.length} pending)`);
        return;
      }

      await processOneMessage(userMessage);
      drainQueue();
    },
    [processOneMessage, drainQueue],
  );

  const stopProcessing = useCallback(() => {
    if (isProcessing) {
      shouldStopRef.current = true;
      setShouldStop(true);
      setStatus("Stopping...");
      agent.abort();
      logger.info("Stopping message processing");
    }
  }, [isProcessing, agent]);

  const resetMessages = useCallback(() => {
    setMessages([]);
    queueRef.current = [];
    setPendingCount(0);
    agent.reset();
    // Safety: force-unstick if agent is stuck after reset
    if (agent.isBusy()) {
      agent.forceUnstick();
    }
    logger.info("Messages reset");
  }, [agent]);

  const addMessage = useCallback((message: AgentMessage) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  return {
    messages,
    currentThinking,
    isProcessing,
    status,
    shouldStop,
    pendingCount,
    processMessage,
    queueMessage,
    stopProcessing,
    resetMessages,
    addMessage,
  };
}
