import React from "react";
import { Box, Text } from "ink";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import type { AgentMessage, DiffLine, DiffResult } from "../../core/types.js";
import MarkdownText from "./MarkdownText.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";

const FILE_MENTION_RE = /@(\S+)/g;

function isExistingFilePath(filePath: string): boolean {
  return filePath.length > 0 && existsSync(resolve(process.cwd(), filePath));
}

function renderContentWithMentions(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  FILE_MENTION_RE.lastIndex = 0;

  while ((match = FILE_MENTION_RE.exec(text)) !== null) {
    const filePath = match[1];
    if (!isExistingFilePath(filePath)) continue;
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    nodes.push(
      <Text key={`m-${match.index}`} bold>{filePath}</Text>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

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

export default function MessageList({
  messages,
  thinking,
  showThinking,
}: MessageListProps) {
  return (
    <Box flexDirection="column">
      {messages.map((msg, idx) => (
        <Box key={`msg-${idx}`} flexDirection="column" marginBottom={1}>
          {msg.role === "user" && (
            <Box>
              <Text color="gray">▸ </Text>
              <Text color="white" wrap="wrap">{renderContentWithMentions(msg.content)}</Text>
            </Box>
          )}

          {msg.role === "assistant" && msg.isThinking && showThinking && (
            <Box flexDirection="column">
              <Text color="gray" dimColor>
                ◇ thinking{" "}
                {msg.thinkingTime ? formatThinkingTime(msg.thinkingTime) : ""}
              </Text>
              <Text color="gray" dimColor wrap="wrap">
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

          {msg.role === "tool" && msg.diff && (
            <DiffView diff={msg.diff} toolName={msg.toolName} />
          )}

          {msg.role === "tool" && !msg.diff && msg.toolName && (
            <Box flexDirection="column">
              <Text wrap="truncate">
                <Text color="green" bold>+</Text>
                <Text color="gray"> </Text>
                <Text color="green">{msg.toolName}</Text>
                {(() => {
                  const args = msg.toolArgs;
                  if (!args || typeof args !== "string" || args.length === 0) return null;
                  return <Text color="gray"> {args}</Text>;
                })()}
              </Text>
              {msg.content.startsWith("Error:") && (
                <Text color="red" wrap="truncate-end">{msg.content.substring(0, 120)}</Text>
              )}
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
          <Text color="gray" dimColor wrap="wrap">
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

// --- Diff View Component ---

const MAX_DIFF_LINES = 20;

function DiffView({ diff, toolName }: { diff: DiffResult; toolName?: string }) {
  const { columns } = useTerminalSize();
  const maxLineContent = Math.max(20, columns - 14);

  const displayLines = diff.lines.slice(0, MAX_DIFF_LINES);
  const overflow = diff.lines.length - MAX_DIFF_LINES;

  const fileName = diff.filePath.split(/[\\/]/).pop() || diff.filePath;

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Text>
        <Text color="cyan" bold>
          {diff.isNewFile ? "+" : "~"}
        </Text>
        <Text color="white"> </Text>
        <Text color="cyan">{fileName}</Text>
        <Text color="gray"> — </Text>
        <Text color="green">+{diff.addedCount}</Text>
        <Text color="gray"> </Text>
        <Text color="red">-{diff.removedCount}</Text>
      </Text>

      {/* Diff lines */}
      {displayLines.map((line, i) => (
        <DiffLineView key={i} line={line} maxContent={maxLineContent} />
      ))}

      {/* Overflow indicator */}
      {overflow > 0 && (
        <Text color="gray" dimColor>
          {"  "}... {overflow} more line{overflow > 1 ? "s" : ""}
        </Text>
      )}
    </Box>
  );
}

function DiffLineView({
  line,
  maxContent,
}: {
  line: DiffLine;
  maxContent: number;
}) {
  if (line.content === "..." && line.type === "context") {
    return (
      <Text color="gray" dimColor>
        {"  "}...
      </Text>
    );
  }

  const truncated =
    line.content.length > maxContent
      ? line.content.substring(0, maxContent - 1) + "…"
      : line.content;

  if (line.type === "add") {
    const lineNo = line.newLineNo?.toString().padStart(3) ?? "   ";
    return (
      <Text>
        <Text color="green" bold>
          +
        </Text>
        <Text color="gray">{lineNo} </Text>
        <Text color="green" backgroundColor="#1a2e1a">
          {truncated}
        </Text>
      </Text>
    );
  }

  if (line.type === "remove") {
    const lineNo = line.oldLineNo?.toString().padStart(3) ?? "   ";
    return (
      <Text>
        <Text color="red" bold>
          -
        </Text>
        <Text color="gray">{lineNo} </Text>
        <Text color="red" backgroundColor="#2e1a1a">
          {truncated}
        </Text>
      </Text>
    );
  }

  // context line
  const oldNo = line.oldLineNo?.toString().padStart(3) ?? "   ";
  return (
    <Text color="gray" dimColor>
      {" "}{oldNo} {truncated}
    </Text>
  );
}
