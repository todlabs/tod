import React, { useState, useCallback, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { existsSync } from "fs";
import { resolve } from "path";
import { useTerminalSize } from "../hooks/useTerminalSize.js";

interface MultilineInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  placeholder?: string;
  isDisabled?: boolean;
  hasSuggestions?: boolean;
  selectedSuggestionIndex?: number;
  suggestionCount?: number;
  onSuggestionNavigate?: (direction: "up" | "down") => void;
  onSuggestionFill?: (index: number) => void;
  onSuggestionExecute?: (index: number) => void;
  onEscape?: () => void;
}

const MAX_VISIBLE_LINES = 8;
const FILE_MENTION_RE = /@[^\s@]+/g;

type FileMentionRange = { start: number; end: number };

function isExistingFileMention(token: string): boolean {
  const filePath = token.slice(1).replace(/[\\/]$/, "");
  return filePath.length > 0 && existsSync(resolve(process.cwd(), filePath));
}

function getFileMentionRanges(text: string): FileMentionRange[] {
  const ranges: FileMentionRange[] = [];
  let match: RegExpExecArray | null;
  FILE_MENTION_RE.lastIndex = 0;

  while ((match = FILE_MENTION_RE.exec(text)) !== null) {
    if (isExistingFileMention(match[0])) {
      ranges.push({ start: match.index, end: match.index + match[0].length });
    }
  }

  return ranges;
}

function getMentionBeforeCursor(text: string, cursor: number): FileMentionRange | null {
  for (const range of getFileMentionRanges(text)) {
    if (cursor > range.start && cursor <= range.end) return range;
    if (cursor === range.end + 1 && /\s/.test(text[range.end] || "")) {
      return { start: range.start, end: cursor };
    }
  }
  return null;
}

function getMentionAfterCursor(text: string, cursor: number): FileMentionRange | null {
  for (const range of getFileMentionRanges(text)) {
    if (cursor >= range.start && cursor < range.end) return range;
  }
  return null;
}

function snapCursorOutOfMention(text: string, cursor: number): number {
  for (const range of getFileMentionRanges(text)) {
    if (cursor > range.start && cursor < range.end) {
      return range.end + (/\s/.test(text[range.end] || "") ? 1 : 0);
    }
  }
  return cursor;
}

function renderTextWithFileMentions(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  FILE_MENTION_RE.lastIndex = 0;

  while ((match = FILE_MENTION_RE.exec(text)) !== null) {
    if (!isExistingFileMention(match[0])) continue;
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const filePath = match[0].slice(1); // without @
    nodes.push(
      <React.Fragment key={`${match.index}-${match[0]}`}>
        <Text bold>{filePath}</Text>
      </React.Fragment>,
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

export default function MultilineInput({
  value,
  onChange,
  onSubmit,
  placeholder = "",
  isDisabled = false,
  hasSuggestions = false,
  selectedSuggestionIndex = -1,
  suggestionCount = 0,
  onSuggestionNavigate,
  onSuggestionFill,
  onSuggestionExecute,
  onEscape,
}: MultilineInputProps) {
  const { columns: cols } = useTerminalSize();
  const [cursor, setCursor] = useState(0);

  // Clamp cursor when value changes externally (e.g., setInput("") or paste)
  useEffect(() => {
    if (cursor > value.length) {
      setCursor(value.length);
      return;
    }
    const nextCursor = snapCursorOutOfMention(value, cursor);
    if (nextCursor !== cursor) {
      setCursor(nextCursor);
    }
  }, [value, cursor]);

  // App has paddingLeft=1 + paddingRight=1 (2 cols).
  // InputArea has "# " prefix (2 cols). Cursor reserves 1 col.
  // Total reserved: 5 cols to be safe.
  const RESERVED_COLS = 5;
  const availableWidth = Math.max(10, cols - RESERVED_COLS);

  // Helper: find cursor position on previous/next line (for Up/Down arrows)
  const moveCursorVertical = useCallback(
    (direction: "up" | "down") => {
      const lines = value.split("\n");
      let acc = 0;
      let curLine = 0;
      let curCol = 0;
      for (let i = 0; i < lines.length; i++) {
        if (acc + lines[i].length >= cursor) {
          curLine = i;
          curCol = cursor - acc;
          break;
        }
        acc += lines[i].length + 1;
      }

      const targetLine = direction === "up" ? curLine - 1 : curLine + 1;
      if (targetLine < 0 || targetLine >= lines.length) return false;

      let newPos = 0;
      for (let i = 0; i < targetLine; i++) newPos += lines[i].length + 1;
      newPos += Math.min(curCol, lines[targetLine].length);
      setCursor(newPos);
      return true;
    },
    [value, cursor],
  );

  const handleInput = useCallback(
    (input: string, key: any) => {
      if (isDisabled) return;

      if (key.escape) {
        if (onEscape) onEscape();
        return;
      }

      // Suggestion navigation — only if suggestions active
      if (hasSuggestions) {
        if (key.upArrow) {
          onSuggestionNavigate?.("up");
          return;
        }
        if (key.downArrow) {
          onSuggestionNavigate?.("down");
          return;
        }
        if (key.tab) {
          onSuggestionFill?.(
            selectedSuggestionIndex >= 0 ? selectedSuggestionIndex : 0,
          );
          return;
        }
        if (key.return && selectedSuggestionIndex >= 0) {
          onSuggestionExecute?.(selectedSuggestionIndex);
          return;
        }
      }

      // Cursor navigation
      if (key.leftArrow) {
        const mention = getMentionBeforeCursor(value, cursor);
        setCursor(mention ? mention.start : Math.max(0, cursor - 1));
        return;
      }
      if (key.rightArrow) {
        const mention = getMentionAfterCursor(value, cursor);
        setCursor(mention ? mention.end : Math.min(value.length, cursor + 1));
        return;
      }
      if (key.upArrow) {
        moveCursorVertical("up");
        return;
      }
      if (key.downArrow) {
        moveCursorVertical("down");
        return;
      }

      // Ctrl+A / Home → start, Ctrl+E / End → end
      if (key.ctrl && input === "a") {
        setCursor(0);
        return;
      }
      if (key.ctrl && input === "e") {
        setCursor(value.length);
        return;
      }

      // Ctrl+U — delete to start of line
      if (key.ctrl && input === "u") {
        const lineStart = value.lastIndexOf("\n", cursor - 1) + 1;
        const newValue = value.slice(0, lineStart) + value.slice(cursor);
        onChange(newValue);
        setCursor(lineStart);
        return;
      }

      // Ctrl+K — delete to end of line
      if (key.ctrl && input === "k") {
        const nextNl = value.indexOf("\n", cursor);
        const lineEnd = nextNl === -1 ? value.length : nextNl;
        const newValue = value.slice(0, cursor) + value.slice(lineEnd);
        onChange(newValue);
        return;
      }

      // Ctrl+W — delete word before cursor
      if (key.ctrl && input === "w") {
        if (cursor === 0) return;
        let wordStart = cursor - 1;
        while (wordStart > 0 && /\s/.test(value[wordStart])) wordStart--;
        while (wordStart > 0 && !/\s/.test(value[wordStart - 1])) wordStart--;
        const newValue = value.slice(0, wordStart) + value.slice(cursor);
        onChange(newValue);
        setCursor(wordStart);
        return;
      }

      if (key.return) {
        if (key.shift) {
          const newValue = value.slice(0, cursor) + "\n" + value.slice(cursor);
          onChange(newValue);
          setCursor((c) => c + 1);
        } else {
          onSubmit(value);
        }
        return;
      }

      // Backspace — on Windows Ink sends it as key.delete (0x7F).
      // We treat both as "delete char before cursor".
      if (
        key.backspace ||
        key.delete ||
        input === "\x08" ||
        input === "\x7f"
      ) {
        if (cursor > 0) {
          const mention = getMentionBeforeCursor(value, cursor);
          const deleteStart = mention?.start ?? cursor - 1;
          const deleteEnd = mention?.end ?? cursor;
          const newValue = value.slice(0, deleteStart) + value.slice(deleteEnd);
          onChange(newValue);
          setCursor(deleteStart);
        }
        return;
      }

      // Regular text input — ignore control keys and navigation
      if (
        input &&
        !key.ctrl &&
        !key.meta &&
        !key.upArrow &&
        !key.downArrow &&
        !key.leftArrow &&
        !key.rightArrow &&
        !key.escape
      ) {
        const insertAt = snapCursorOutOfMention(value, cursor);
        const newValue = value.slice(0, insertAt) + input + value.slice(insertAt);
        onChange(newValue);
        setCursor(insertAt + input.length);
      }
    },
    [
      value,
      cursor,
      onChange,
      onSubmit,
      isDisabled,
      hasSuggestions,
      selectedSuggestionIndex,
      suggestionCount,
      onSuggestionNavigate,
      onSuggestionFill,
      onSuggestionExecute,
      onEscape,
      moveCursorVertical,
    ],
  );

  useInput(handleInput, { isActive: !isDisabled });

  if (!value) {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Box>
          <Text color="gray">{placeholder}</Text>
          <Text inverse> </Text>
        </Box>
      </Box>
    );
  }

  // Build visual lines with cursor position
  const rawLines = value.split("\n");
  const visualLines: { text: string; cursorCol?: number }[] = [];

  // Find cursor's raw line and column
  let cursorRawLine = 0;
  let cursorColInLine = 0;
  let acc = 0;
  for (let i = 0; i < rawLines.length; i++) {
    const lineLen = rawLines[i].length;
    if (acc + lineLen >= cursor) {
      cursorRawLine = i;
      cursorColInLine = cursor - acc;
      break;
    }
    acc += lineLen + 1;
  }

  const linesToShow = Math.min(rawLines.length, MAX_VISIBLE_LINES);

  let startLine = 0;
  if (cursorRawLine >= MAX_VISIBLE_LINES) {
    startLine = cursorRawLine - MAX_VISIBLE_LINES + 1;
  }

  const hiddenBefore = startLine;
  const endLine = Math.min(startLine + linesToShow, rawLines.length);
  const hiddenAfter = rawLines.length - endLine;

  for (let li = startLine; li < endLine; li++) {
    const line = rawLines[li];
    const isCursorLine = li === cursorRawLine;

    if (line.length === 0) {
      visualLines.push({
        text: "",
        cursorCol: isCursorLine ? 0 : undefined,
      });
      continue;
    }

    let pos = 0;
    let chunkIdx = 0;
    while (pos < line.length) {
      const remaining = line.length - pos;
      let chunkLen = Math.min(remaining, availableWidth);

      if (chunkLen < remaining && chunkLen > 1) {
        const probe = line.slice(pos, pos + chunkLen);
        const lastSpace = probe.lastIndexOf(" ");
        if (lastSpace > 0) {
          chunkLen = lastSpace + 1;
        }
      }

      const chunk = line.slice(pos, pos + chunkLen);
      const isLastChunk = pos + chunkLen >= line.length;

      let curCol: number | undefined;
      if (isCursorLine) {
        const cursorInChunk =
          cursorColInLine >= pos && cursorColInLine < pos + chunkLen;
        const cursorAtEnd =
          isLastChunk && cursorColInLine === pos + chunkLen;
        if (cursorInChunk || cursorAtEnd) {
          curCol = cursorColInLine - pos;
        }
      }

      visualLines.push({ text: chunk, cursorCol: curCol });
      pos += chunkLen;
      chunkIdx++;
    }

    if (isCursorLine && cursorColInLine === line.length) {
      const lastVl = visualLines[visualLines.length - 1];
      if (lastVl && lastVl.cursorCol === undefined) {
        lastVl.cursorCol = lastVl.text.length;
      }
    }
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      {hiddenBefore > 0 && (
        <Text color="gray" dimColor>
          ... +{hiddenBefore} lines
        </Text>
      )}
      {visualLines.map((vl, idx) => (
        <Box key={idx}>
          {vl.cursorCol !== undefined ? (
            <>
              <Text>{renderTextWithFileMentions(vl.text.slice(0, vl.cursorCol))}</Text>
              <Text inverse>
                {vl.text.slice(vl.cursorCol, vl.cursorCol + 1) || " "}
              </Text>
              <Text>{renderTextWithFileMentions(vl.text.slice(vl.cursorCol + 1))}</Text>
            </>
          ) : (
            <Text>{renderTextWithFileMentions(vl.text)}</Text>
          )}
        </Box>
      ))}
      {hiddenAfter > 0 && (
        <Text color="gray" dimColor>
          ... +{hiddenAfter} lines
        </Text>
      )}
    </Box>
  );
}
