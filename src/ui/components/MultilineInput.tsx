import React, { useState, useCallback, useRef } from "react";
import { Box, Text, useInput } from "ink";
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
const WRAP_INDENT = 2;

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
  const [cursor, setCursor] = useState(0); // cursor position in the string

  // Keep cursor in sync when value changes externally (e.g. setInput(""))
  const prevValueRef = useRef(value);
  if (prevValueRef.current !== value) {
    // If value was reset or changed externally, snap cursor to end
    const diff = value.length - prevValueRef.current.length;
    if (diff < 0 && cursor > value.length) {
      setCursor(value.length);
    }
    prevValueRef.current = value;
  }

  const PREFIX_COLS = 2;
  const availableWidth = Math.max(10, cols - PREFIX_COLS - 1);

  const handleInput = useCallback(
    (input: string, key: any) => {
      if (isDisabled) return;

      if (key.escape) {
        if (onEscape) onEscape();
        return;
      }

      // Arrow navigation for suggestions
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

      // Left/Right arrow — move cursor through text
      if (key.leftArrow) {
        setCursor((c) => Math.max(0, c - 1));
        return;
      }
      if (key.rightArrow) {
        setCursor((c) => Math.min(value.length, c + 1));
        return;
      }

      // Home/End — jump to start/end
      if (key.ctrl && input === "a") {
        setCursor(0);
        return;
      }
      if (key.ctrl && input === "e") {
        setCursor(value.length);
        return;
      }

      if (key.return) {
        if (key.shift) {
          const newValue = value.slice(0, cursor) + "\n" + value.slice(cursor);
          onChange(newValue);
          setCursor((c) => c + 1);
        } else {
          setCursor(0);
          onSubmit(value);
        }
        return;
      }

      if (key.backspace || key.delete || input === "\x08" || input === "\x7f") {
        if (cursor > 0) {
          const newValue = value.slice(0, cursor - 1) + value.slice(cursor);
          onChange(newValue);
          setCursor((c) => c - 1);
        }
        return;
      }

      if (input && !key.ctrl && !key.meta && !key.upArrow && !key.downArrow) {
        const newValue = value.slice(0, cursor) + input + value.slice(cursor);
        onChange(newValue);
        setCursor((c) => c + input.length);
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

  // Build visual lines with cursor position tracking
  const rawLines = value.split("\n");
  const visualLines: { text: string; cursorCol?: number }[] = [];

  // Figure out which raw line the cursor is on and the column within it
  let charsBeforeCursor = 0;
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
    acc += lineLen + 1; // +1 for \n
  }

  const linesToShow = Math.min(rawLines.length, MAX_VISIBLE_LINES);

  // Determine which lines to show (scroll if cursor is beyond visible area)
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
      const isWrapped = chunkIdx > 0;
      const maxWidth = isWrapped
        ? availableWidth - WRAP_INDENT
        : availableWidth;
      let chunkLen = Math.min(remaining, maxWidth);

      if (chunkLen < remaining && chunkLen > 1) {
        const probe = line.slice(pos, pos + chunkLen);
        const lastSpace = probe.lastIndexOf(" ");
        if (lastSpace > 0) {
          chunkLen = lastSpace + 1;
        }
      }

      const chunk = line.slice(pos, pos + chunkLen);
      const isLastChunk = pos + chunkLen >= line.length;
      const displayText = isWrapped ? "  " + chunk : chunk;

      // Calculate cursor column on this visual line
      let curCol: number | undefined;
      if (isCursorLine) {
        const cursorInChunk =
          cursorColInLine >= pos && cursorColInLine < pos + chunkLen;
        const cursorAtEnd =
          isLastChunk && cursorColInLine === pos + chunkLen;
        if (cursorInChunk || cursorAtEnd) {
          curCol =
            (isWrapped ? WRAP_INDENT : 0) + (cursorColInLine - pos);
        }
      }

      visualLines.push({ text: displayText, cursorCol: curCol });
      pos += chunkLen;
      chunkIdx++;
    }

    // Cursor at end of line (after last char) on empty last chunk
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
              <Text>{vl.text.slice(0, vl.cursorCol)}</Text>
              <Text inverse>
                {vl.text.slice(vl.cursorCol, vl.cursorCol + 1) || " "}
              </Text>
              <Text>{vl.text.slice(vl.cursorCol + 1)}</Text>
            </>
          ) : (
            <Text>{vl.text}</Text>
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
