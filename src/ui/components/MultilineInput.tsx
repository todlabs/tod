import React, { useState, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import { useTerminalSize } from "../hooks/useTerminalSize.js";

interface MultilineInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  placeholder?: string;
  isDisabled?: boolean;
  // Suggestion navigation — passed from App
  hasSuggestions?: boolean;
  selectedSuggestionIndex?: number;
  suggestionCount?: number;
  onSuggestionNavigate?: (direction: "up" | "down") => void;
  onSuggestionFill?: (index: number) => void;
  onSuggestionExecute?: (index: number) => void;
  onEscape?: () => void;
}

const MAX_VISIBLE_LINES = 8;
const PASTE_LINE_THRESHOLD = 3;
const PASTE_CHAR_THRESHOLD = 150;
const WRAP_INDENT = 2; // "  " prefix on wrapped lines

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

  // prefix "❯ " or "↩ " takes 2 terminal columns (rendered by InputArea)
  // right edge needs 1 col for safety (cursor + padding quirks)
  const PREFIX_COLS = 2;
  const availableWidth = Math.max(10, cols - PREFIX_COLS - 1);

  const [pasteLines, setPasteLines] = useState(0);

  const handleInput = useCallback(
    (input: string, key: any) => {
      if (isDisabled) return;

      // ESC — close suggestions or handled by parent
      if (key.escape) {
        if (onEscape) onEscape();
        return;
      }

      // Arrow navigation for suggestions (takes priority over text input)
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

      if (key.return) {
        if (key.shift) {
          const newValue = value + "\n";
          onChange(newValue);
          const totalLines = newValue.split("\n").length;
          setPasteLines(totalLines > PASTE_LINE_THRESHOLD ? totalLines : 0);
        } else {
          setPasteLines(0);
          onSubmit(value);
        }
        return;
      }

      if (key.backspace || key.delete) {
        if (value.length > 0) {
          const newValue = value.slice(0, -1);
          onChange(newValue);
          const totalLines = newValue.split("\n").length;
          setPasteLines(totalLines > PASTE_LINE_THRESHOLD ? totalLines : 0);
        }
        return;
      }

      if (input && !key.ctrl && !key.meta && !key.upArrow && !key.downArrow) {
        const newValue = value + input;
        const inputLineCount = input.split("\n").length;
        const isPaste =
          inputLineCount >= PASTE_LINE_THRESHOLD ||
          input.length > PASTE_CHAR_THRESHOLD;

        if (isPaste) {
          setPasteLines(newValue.split("\n").length);
        } else {
          const totalLines = newValue.split("\n").length;
          setPasteLines(totalLines > PASTE_LINE_THRESHOLD ? totalLines : 0);
        }

        onChange(newValue);
      }
    },
    [
      value,
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

  const showPasteTag = pasteLines > PASTE_LINE_THRESHOLD;

  // Build visual lines with wrapping
  const rawLines = value.split("\n");
  const visualLines: { text: string; isLast: boolean }[] = [];

  const linesToShow = Math.min(
    rawLines.length,
    showPasteTag ? 2 : MAX_VISIBLE_LINES,
  );

  for (let li = 0; li < linesToShow; li++) {
    const line = rawLines[li];
    const isLastRaw = li === rawLines.length - 1;

    if (line.length === 0) {
      visualLines.push({ text: "", isLast: isLastRaw });
      continue;
    }

    let pos = 0;
    let chunkIdx = 0;
    while (pos < line.length) {
      const remaining = line.length - pos;
      const isWrapped = chunkIdx > 0;

      // On wrapped lines, the "  " indent takes WRAP_INDENT chars,
      // so the chunk itself must be shorter to stay within availableWidth
      const maxWidth = isWrapped
        ? availableWidth - WRAP_INDENT
        : availableWidth;
      let chunkLen = Math.min(remaining, maxWidth);

      // Try word-wrap: break at the last space within the chunk
      // so words don't get split mid-character across lines
      if (chunkLen < remaining && chunkLen > 1) {
        const probe = line.slice(pos, pos + chunkLen);
        const lastSpace = probe.lastIndexOf(" ");
        if (lastSpace > 0) {
          // Break after the space (space goes on current line)
          chunkLen = lastSpace + 1;
        }
      }

      const chunk = line.slice(pos, pos + chunkLen);
      const isLastChunk = pos + chunkLen >= line.length;

      const displayText = isWrapped ? "  " + chunk : chunk;
      visualLines.push({
        text: displayText,
        isLast: isLastRaw && isLastChunk,
      });

      pos += chunkLen;
      chunkIdx++;
    }
  }

  const hiddenLines =
    rawLines.length > linesToShow ? rawLines.length - linesToShow : 0;

  return (
    <Box flexDirection="column" flexGrow={1}>
      {visualLines.map((vl, idx) => (
        <Box key={idx}>
          <Text>
            {vl.text}
            {vl.isLast && !showPasteTag && <Text inverse> </Text>}
          </Text>
        </Box>
      ))}
      {showPasteTag && (
        <Box>
          <Text color="cyan" bold>
            ⋯{pasteLines}L
          </Text>
          <Text inverse> </Text>
        </Box>
      )}
      {!showPasteTag && hiddenLines > 0 && (
        <Text color="gray" dimColor>
          ... +{hiddenLines} lines
        </Text>
      )}
    </Box>
  );
}
