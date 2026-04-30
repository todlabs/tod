import React, { useMemo } from "react";
import { Box, Text, useStdout } from "ink";
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

// ANSI italic
const ITALIC = "\x1b[3m";
const RESET = "\x1b[0m";

// Estimate how many terminal rows a message will occupy
function estimateMessageHeight(msg: AgentMessage, terminalWidth: number): number {
  const wrapWidth = terminalWidth > 20 ? terminalWidth - 4 : 76;

  if (msg.role === "tool") {
    const headerLine = 1; // → toolName
    const contentPreview = msg.content.split("\n").slice(0, 2).join(" ").substring(0, 120);
    const contentLines = Math.ceil(contentPreview.length / wrapWidth) || 1;
    return headerLine + contentLines + 1; // +1 for marginBottom
  }

  if (msg.role === "assistant" && msg.isThinking) {
    const text = msg.content.length <= 400 ? msg.content : msg.content.substring(0, 400) + "...";
    const lines = text.split("\n").length;
    const wrappedLines = Math.ceil(text.length / wrapWidth);
    return Math.max(lines, wrappedLines) + 2 + 1; // header + content + margin
  }

  if (msg.role === "assistant") {
    const contentLines = msg.content.split("\n").length;
    const wrappedLines = Math.ceil(msg.content.length / wrapWidth);
    return Math.max(contentLines, wrappedLines) + 1; // + margin
  }

  // user message
  const contentLines = msg.content.split("\n").length;
  const wrappedLines = Math.ceil(msg.content.length / wrapWidth);
  return Math.max(contentLines, wrappedLines) + 1; // + margin
}

function estimateThinkingHeight(thinking: string, terminalWidth: number): number {
  if (!thinking) return 0;
  const wrapWidth = terminalWidth > 20 ? terminalWidth - 4 : 76;
  const text = thinking.length <= 400 ? thinking : thinking.substring(0, 400) + "...";
  const lines = text.split("\n").length;
  const wrappedLines = Math.ceil(text.length / wrapWidth);
  return Math.max(lines, wrappedLines) + 2 + 1; // header + content + margin
}

// Rows reserved for non-message UI elements
const RESERVED_ROWS = 8; // header(2) + input(2) + statusbar(1) + padding/suggestions(3)

export default function MessageList({
  messages,
  thinking,
  showThinking,
}: MessageListProps) {
  const { stdout } = useStdout();
  const terminalRows = stdout?.rows || 24;
  const terminalColumns = stdout?.columns || 80;
  const availableRows = Math.max(4, terminalRows - RESERVED_ROWS);

  // Calculate which messages fit in the viewport, starting from the bottom
  const { visibleMessages, truncatedCount } = useMemo(() => {
    let remainingRows = availableRows;

    // Account for active thinking block
    if (showThinking && thinking) {
      remainingRows -= estimateThinkingHeight(thinking, terminalColumns);
    }

    if (remainingRows <= 0) {
      return { visibleMessages: [], truncatedCount: messages.length };
    }

    // Walk messages from end to start, accumulating heights
    const result: AgentMessage[] = [];
    let truncated = 0;

    for (let i = messages.length - 1; i >= 0; i--) {
      const height = estimateMessageHeight(messages[i], terminalColumns);
      if (remainingRows - height >= 0) {
        result.unshift(messages[i]);
        remainingRows -= height;
      } else {
        truncated = i + 1;
        break;
      }
    }

    return { visibleMessages: result, truncatedCount: truncated };
  }, [messages, thinking, showThinking, availableRows, terminalColumns]);

  return (
    <Box flexDirection="column">
      {truncatedCount > 0 && (
        <Box marginBottom={1}>
          <Text color="gray" dimColor>
            ↑ {truncatedCount} earlier message{truncatedCount > 1 ? "s" : ""} not shown
          </Text>
        </Box>
      )}

      {visibleMessages.map((msg, idx) => (
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
