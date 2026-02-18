import { useState, useCallback, useRef } from 'react';
import type { Agent, AgentMessage } from '../../agent/index.js';
import { logger } from '../../services/logger.js';

interface UseMessageProcessingReturn {
  messages: AgentMessage[];
  currentThinking: string;
  isProcessing: boolean;
  status: string;
  shouldStop: boolean;
  processMessage: (message: string) => Promise<void>;
  stopProcessing: () => void;
  resetMessages: () => void;
  addMessage: (message: AgentMessage) => void;
}

export function useMessageProcessing(agent: Agent): UseMessageProcessingReturn {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [currentThinking, setCurrentThinking] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState('');
  const [shouldStop, setShouldStop] = useState(false);
  const shouldStopRef = useRef(false);

  const processMessage = useCallback(async (userMessage: string) => {
    if (!userMessage.trim() || isProcessing) return;

    setIsProcessing(true);
    setCurrentThinking('');
    setStatus('');

    const userMsg: AgentMessage = {
      role: 'user',
      content: userMessage,
    };

    setMessages((prev) => [...prev, userMsg]);

    let currentAssistantMessage = '';
    let lastThinkingUpdate = '';
    let thinkingStartTime = 0;
    let hasActiveAssistantMessage = false;
    let lastThinkingRender = 0;

    const saveThinking = () => {
      if (lastThinkingUpdate && thinkingStartTime) {
        const thinkingTime = Date.now() - thinkingStartTime;
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: lastThinkingUpdate,
            isThinking: true,
            thinkingTime,
          },
        ]);
        lastThinkingUpdate = '';
        thinkingStartTime = 0;
        setCurrentThinking('');
      }
    };

    const saveAssistantMessage = () => {
      if (currentAssistantMessage.trim() && hasActiveAssistantMessage) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: currentAssistantMessage.trim(),
          },
        ]);
        currentAssistantMessage = '';
        hasActiveAssistantMessage = false;
      }
    };

    try {
      setShouldStop(false);
      shouldStopRef.current = false;

      await agent.processMessage(
        userMessage,
        {
          onChunk: (chunk) => {
            if (shouldStopRef.current) {
              throw new Error('Stopped by user');
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
              setStatus('Thinking');
            } else if (chunk.role === 'assistant') {
              // Сохранить thinking в историю перед ответом
              saveThinking();
              currentAssistantMessage += chunk.content;
              hasActiveAssistantMessage = true;
            } else if (chunk.role === 'tool') {
              // Сохранить thinking и assistant message перед tool call
              saveThinking();
              saveAssistantMessage();
              setMessages((prev) => [...prev, chunk]);
              setStatus(`Tool: ${chunk.toolName || 'running'}`);
            }
          },
          onToolCall: (toolName) => {
            // Сохранить thinking и assistant message перед началом tool call
            saveThinking();
            saveAssistantMessage();
            setStatus(`Calling: ${toolName}`);
          }
        }
      );

      // Сохранить оставшиеся thinking и assistant message
      saveThinking();
      saveAssistantMessage();

      logger.info('Message processed successfully');
    } catch (error) {
      const errorMsg = `Error: ${error instanceof Error ? error.message : String(error)}`;
      setMessages((prev) => [...prev, { role: 'assistant', content: errorMsg }]);
      logger.error('Message processing failed', { error });
    } finally {
      setIsProcessing(false);
      setCurrentThinking('');
      setStatus('');
      setShouldStop(false);
      shouldStopRef.current = false;
    }
  }, [agent, isProcessing]);

  const stopProcessing = useCallback(() => {
    if (isProcessing) {
      shouldStopRef.current = true;
      setShouldStop(true);
      setStatus('Stopping...');
      logger.info('Stopping message processing');
    }
  }, [isProcessing]);

  const resetMessages = useCallback(() => {
    setMessages([]);
    agent.reset();
    logger.info('Messages reset');
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
    processMessage,
    stopProcessing,
    resetMessages,
    addMessage,
  };
}
