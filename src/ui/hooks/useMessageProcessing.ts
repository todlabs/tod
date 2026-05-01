import { useState, useCallback, useRef } from "react";
import type { Agent, AgentMessage } from "../../agent/index.js";
import { logger } from "../../services/logger.js";
import {
  saveChat,
  loadChat,
  listChats,
  generateChatId,
  generateChatName,
  setCurrentChatId as setFsCurrentChatId,
  getCurrentChatId as getFsCurrentChatId,
  type ChatFile,
} from "../../services/chat-storage.js";

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
  currentChatId: string | null;
  currentChatName: string | null;
  resumeChat: (id: string) => boolean;
  getChatList: () => Array<{ id: string; name: string; updatedAt: string; messageCount: number }>;
  lastChatId: string | null;
  compactMessages: () => Promise<{ oldTokens: number; newTokens: number; summary: string }>;
}

export function useMessageProcessing(agent: Agent): UseMessageProcessingReturn {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [currentThinking, setCurrentThinking] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState("");
  const [shouldStop, setShouldStop] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [currentChatName, setCurrentChatName] = useState<string | null>(null);
  const shouldStopRef = useRef(false);
  const queueRef = useRef<string[]>([]);
  const isProcessingRef = useRef(false);
  const firstUserMessageRef = useRef<string | null>(null);

  // Read last chat id from disk for resume hint
  const lastChatId = getFsCurrentChatId();

  // Auto-save chat to disk
  const autoSave = useCallback((chatId: string | null, chatName: string | null) => {
    if (!chatId) return;
    const chat: ChatFile = {
      id: chatId,
      name: chatName || "untitled",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: agent.getMessagesForSave(),
    };
    saveChat(chat);
  }, [agent]);

  const processOneMessage = useCallback(
    async (userMessage: string) => {
      setIsProcessing(true);
      isProcessingRef.current = true;
      setCurrentThinking("");
      setStatus("");

      // Ensure we have a chat session
      let chatId = currentChatId;
      let chatName = currentChatName;
      if (!chatId) {
        chatId = generateChatId();
        const name = generateChatName(userMessage);
        chatName = name;
        setCurrentChatId(chatId);
        setCurrentChatName(name);
        setFsCurrentChatId(chatId);
        firstUserMessageRef.current = userMessage;
      }

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
            if (shouldStopRef.current) return;

            if (chunk.isThinking) {
              if (!thinkingStartTime) thinkingStartTime = Date.now();
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
              setStatus(`Tool: ${chunk.toolName || "done"}`);
            }
          },
          onToolCall: (toolName) => {
            saveThinking();
            saveAssistantMessage();
            setStatus(`Running: ${toolName}`);
          },
          onToolApproval: (toolName, args) => {
            // Show approval prompt in the message list
            const cmd = toolName === "execute_shell" ? (args.command as string) : `${toolName} ${args.path || ""}`;
            const msg: AgentMessage = {
              role: "assistant",
              content: `Allow: ${cmd}? (y/n)`,
            };
            setMessages((prev) => [...prev, msg]);

            // Read single char from stdin for approval
            // In Ink TUI, we use a simple approach: auto-approve for now
            // TODO: implement interactive approval via Ink input
            return true;
          },
        });

        saveThinking();
        saveAssistantMessage();
        logger.info("Message processed successfully");

        // Auto-save after each processed message
        autoSave(chatId, chatName);
      } catch (error) {
        savePartialMessages();

        const errorMsg = error instanceof Error ? error.message : String(error);

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

        if (agent.isBusy()) agent.forceUnstick();
      }
    },
    [agent, currentChatId, currentChatName, autoSave],
  );

  const drainQueue = useCallback(async () => {
    const next = queueRef.current.shift();
    if (next !== undefined) {
      setPendingCount(queueRef.current.length);
      await processOneMessage(next);
      drainQueue();
    }
  }, [processOneMessage]);

  const queueMessage = useCallback(
    (message: string) => {
      if (!message.trim()) return;
      if (isProcessingRef.current) {
        queueRef.current.push(message);
        setPendingCount(queueRef.current.length);
      } else {
        processOneMessage(message).then(() => drainQueue());
      }
    },
    [processOneMessage, drainQueue],
  );

  const processMessage = useCallback(
    async (userMessage: string) => {
      if (!userMessage.trim()) return;
      if (isProcessingRef.current) {
        queueRef.current.push(userMessage);
        setPendingCount(queueRef.current.length);
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
    }
  }, [isProcessing, agent]);

  const resetMessages = useCallback(() => {
    if (currentChatId) autoSave(currentChatId, currentChatName);
    setMessages([]);
    queueRef.current = [];
    setPendingCount(0);
    agent.reset();
    setCurrentChatId(null);
    setCurrentChatName(null);
    firstUserMessageRef.current = null;
    setFsCurrentChatId(null);
    if (agent.isBusy()) agent.forceUnstick();
    logger.info("Messages reset");
  }, [agent, currentChatId, currentChatName, autoSave]);

  const addMessage = useCallback((message: AgentMessage) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  const compactMessages = useCallback(async () => {
    const result = await agent.compactContext();
    const agentMsgs = agent.getAgentMessages().filter(
      (m) => m.role !== "system" && !m.isThinking,
    );
    setMessages(agentMsgs);
    return result;
  }, [agent]);

  const resumeChat = useCallback(
    (id: string): boolean => {
      const chat = loadChat(id);
      if (!chat) return false;

      agent.restoreMessages(chat.messages);
      setCurrentChatId(chat.id);
      setCurrentChatName(chat.name);
      setFsCurrentChatId(chat.id);
      firstUserMessageRef.current = chat.name;

      const agentMsgs = agent.getAgentMessages().filter(
        (m) => m.role !== "system" && !m.isThinking,
      );
      setMessages(agentMsgs);

      logger.info("Chat resumed", { id, name: chat.name });
      return true;
    },
    [agent],
  );

  const getChatList = useCallback(() => {
    return listChats();
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
    currentChatId,
    currentChatName,
    resumeChat,
    getChatList,
    lastChatId,
    compactMessages,
  };
}
