import React from "react";
import { Box, Text } from "ink";
import type { AgentMessage } from "../../core/types.js";
import MarkdownText from "./MarkdownText.js";

interface MessageListProps {
  messages: AgentMessage[];
  thinking?: string;
  showThinking: boolean;
}

function formatThinkingTime(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ANSI italic — работает в большинстве современных терминалов
const ITALIC = "\x1b[3m";
const RESET = "\x1b[0m";

export default function MessageList({
  messages,
  thinking,
  showThinking,
}: MessageListProps) {
  const displayMessages = messages.slice(-50);

  return (
    <Box flexDirection="column">
      {displayMessages.map((msg, idx) => (
        <Box key={`msg-${idx}`} flexDirection="column" marginBottom={1}>
          {msg.role === "user" && (
            <Box>
              <Text color="gray">▸ </Text>
              <Text color="white">{msg.content}</Text>
            </Box>
          )}

          {msg.role === "assistant" && msg.isThinking && showThinking && (
            <Box flexDirection="column">
              <Text color="gray" dimColor>
                ◇ thinking{" "}
                {msg.thinkingTime ? formatThinkingTime(msg.thinkingTime) : ""}
              </Text>
              <Text color="gray" dimColor>
                {ITALIC}
                {msg.content.length <= 400
                  ? msg.content
                  : msg.content.substring(0, 400) + "..."}
                {RESET}
              </Text>
            </Box>
          )}

          {msg.role === "assistant" && !msg.isThinking && (
            <Box>
              <MarkdownText>{msg.content}</MarkdownText>
            </Box>
          )}

          {msg.role === "tool" && (
            <Box flexDirection="column">
              <Text color="gray" dimColor>
                → {msg.toolName}
              </Text>
              <Text color="gray" dimColor>
                {msg.content
                  .split("\n")
                  .slice(0, 2)
                  .join(" ")
                  .substring(0, 120)}
                {msg.content.length > 120 ? " ..." : ""}
              </Text>
            </Box>
          )}
        </Box>
      ))}

      {/* Active Thinking */}
      {showThinking && thinking && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="gray" dimColor>
            ◇ thinking{thinking.length > 0 ? ` ${thinking.length}` : ""}
          </Text>
          <Text color="gray" dimColor>
            {ITALIC}
            {thinking.length <= 400
              ? thinking
              : thinking.substring(0, 400) + "..."}
            {RESET}
          </Text>
        </Box>
      )}
    </Box>
  );
}
