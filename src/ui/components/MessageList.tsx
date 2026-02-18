import React from 'react';
import { Box, Text } from 'ink';
import type { AgentMessage } from '../../core/types.js';
import MarkdownText from './MarkdownText.js';

interface MessageListProps {
  messages: AgentMessage[];
  thinking?: string;
  showThinking: boolean;
}

function formatThinkingTime(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = (ms / 1000).toFixed(1);
  return `${seconds}s`;
}

export default function MessageList({ messages, thinking, showThinking }: MessageListProps) {
  const displayMessages = messages.slice(-50);

  return (
    <Box flexDirection="column" marginTop={1}>
      {displayMessages.map((msg, idx) => (
        <Box key={`msg-${idx}`} flexDirection="column" marginBottom={1}>
          {msg.role === 'user' && (
            <Box>
              <Text color="gray">▸ </Text>
              <Text color="white">{msg.content}</Text>
            </Box>
          )}

          {msg.role === 'assistant' && msg.isThinking && showThinking && (
            <Box flexDirection="column">
              <Box>
                <Text color="gray" dimColor>◈ Thinking</Text>
                {msg.thinkingTime && (
                  <Text color="gray" dimColor> ({formatThinkingTime(msg.thinkingTime)})</Text>
                )}
              </Box>
              <Text color="gray" dimColor>
                {msg.content.length <= 400
                  ? msg.content
                  : msg.content.substring(0, 400) + '...'}
              </Text>
            </Box>
          )}

          {msg.role === 'assistant' && !msg.isThinking && (
            <Box>
              <MarkdownText>{msg.content}</MarkdownText>
            </Box>
          )}

          {msg.role === 'tool' && (
            <Box flexDirection="column">
              <Text color="gray">→ {msg.toolName}</Text>
              <Box marginLeft={2}>
                <Text color="gray">{msg.content.substring(0, 200)}</Text>
                {msg.content.length > 200 && <Text color="gray">...</Text>}
              </Box>
            </Box>
          )}
        </Box>
      ))}

      {/* Active Thinking - показывается в конце истории */}
      {showThinking && thinking && (
        <Box flexDirection="column" marginBottom={1}>
          <Box>
            <Text color="cyan" bold>◈ Thinking</Text>
            {thinking.length > 0 && (
              <Text color="gray"> ({thinking.length} chars)</Text>
            )}
          </Box>
          <Text color="cyan">
            {thinking.length <= 400
              ? thinking
              : thinking.substring(0, 400) + '...'}
          </Text>
        </Box>
      )}
    </Box>
  );
}
