import React, { useState, useRef, useCallback } from "react";
import { Box, Text, useInput, useStdout } from "ink";

interface MultilineInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  placeholder?: string;
  isDisabled?: boolean;
}

const MAX_VISIBLE_LINES = 8;
const PASTE_LINE_THRESHOLD = 3;
const PASTE_CHAR_THRESHOLD = 150;

export default function MultilineInput({
  value,
  onChange,
  onSubmit,
  placeholder = "",
  isDisabled = false,
}: MultilineInputProps) {
  const { stdout } = useStdout();
  const maxLineWidth = Math.max(20, (stdout?.columns ?? 80) - 7);

  // Paste detection state
  const [pasteLines, setPasteLines] = useState(0);
  const lastInputTime = useRef(0);

  const handleInput = useCallback(
    (input: string, key: any) => {
      if (isDisabled) return;

      // Enter key
      if (key.return) {
        if (key.shift) {
          // Shift+Enter → new line
          const newValue = value + "\n";
          onChange(newValue);
          if (pasteLines > 0) {
            const totalLines = newValue.split("\n").length;
            setPasteLines(totalLines > PASTE_LINE_THRESHOLD ? totalLines : 0);
          }
        } else {
          // Enter → submit
          setPasteLines(0);
          onSubmit(value);
        }
        return;
      }

      // Backspace
      if (key.backspace || key.delete) {
        if (value.length > 0) {
          const newValue = value.slice(0, -1);
          onChange(newValue);
          const totalLines = newValue.split("\n").length;
          setPasteLines(totalLines > PASTE_LINE_THRESHOLD ? totalLines : 0);
        }
        return;
      }

      // Regular input
      if (input && !key.ctrl && !key.meta && !key.upArrow && !key.downArrow) {
        const newValue = value + input;
        const inputLineCount = input.split("\n").length;
        const isPaste =
          inputLineCount >= PASTE_LINE_THRESHOLD ||
          input.length > PASTE_CHAR_THRESHOLD;

        if (isPaste) {
          const totalLines = newValue.split("\n").length;
          setPasteLines(totalLines);
        } else {
          const totalLines = newValue.split("\n").length;
          setPasteLines(totalLines > PASTE_LINE_THRESHOLD ? totalLines : 0);
        }

        onChange(newValue);
        lastInputTime.current = Date.now();
      }
    },
    [value, onChange, onSubmit, isDisabled, pasteLines],
  );

  useInput(handleInput, { isActive: !isDisabled });

  // Empty state
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

  // Paste tag badge — compact inline tag
  const showPasteTag = pasteLines > PASTE_LINE_THRESHOLD;

  // Normal display with line wrapping
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
    } else {
      for (let i = 0; i < line.length; i += maxLineWidth) {
        const chunk = line.slice(i, i + maxLineWidth);
        const isLastChunk = i + maxLineWidth >= line.length;
        visualLines.push({ text: chunk, isLast: isLastRaw && isLastChunk });
      }
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
