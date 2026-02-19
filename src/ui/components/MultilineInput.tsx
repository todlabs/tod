import React, { useState, useRef, useCallback } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';

interface MultilineInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  placeholder?: string;
  isDisabled?: boolean;
  blockReturn?: boolean;
}

const MAX_VISIBLE_LINES = 8;
const PASTE_LINE_THRESHOLD = 3;
const PASTE_CHAR_THRESHOLD = 150;

export default function MultilineInput({
  value,
  onChange,
  onSubmit,
  placeholder = '',
  isDisabled = false,
  blockReturn = false,
}: MultilineInputProps) {
  const { stdout } = useStdout();
  const maxLineWidth = Math.max(20, (stdout?.columns ?? 80) - 7);

  // Paste detection state
  const [pasteInfo, setPasteInfo] = useState<{ lines: number; chars: number } | null>(null);
  const lastInputTime = useRef(0);

  const handleInput = useCallback(
    (input: string, key: any) => {
      if (isDisabled) return;

      // Submit
      if (key.return) {
        if (!blockReturn) {
          setPasteInfo(null);
          onSubmit(value);
        }
        return;
      }

      // Backspace
      if (key.backspace || key.delete) {
        if (value.length > 0) {
          const newValue = value.slice(0, -1);
          onChange(newValue);
          // If value becomes short enough, clear paste info
          if (pasteInfo && newValue.split('\n').length <= PASTE_LINE_THRESHOLD) {
            setPasteInfo(null);
          }
        }
        return;
      }

      // Regular input
      if (input && !key.ctrl && !key.meta && !key.upArrow && !key.downArrow) {
        const newValue = value + input;
        const inputLineCount = input.split('\n').length;
        const isPaste = inputLineCount >= PASTE_LINE_THRESHOLD || input.length > PASTE_CHAR_THRESHOLD;

        if (isPaste) {
          const totalLines = newValue.split('\n').length;
          setPasteInfo({ lines: totalLines, chars: newValue.length });
        }

        onChange(newValue);
        lastInputTime.current = Date.now();
      }
    },
    [value, onChange, onSubmit, isDisabled, blockReturn, pasteInfo]
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

  // Paste summary mode
  if (pasteInfo && pasteInfo.lines > PASTE_LINE_THRESHOLD) {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Box>
          <Text color="cyan">[Pasted {pasteInfo.lines} lines, {pasteInfo.chars} chars]</Text>
          <Text inverse> </Text>
        </Box>
      </Box>
    );
  }

  // Normal display with line wrapping
  const rawLines = value.split('\n');
  const visualLines: { text: string; isLast: boolean }[] = [];

  const linesToShow = Math.min(rawLines.length, MAX_VISIBLE_LINES);
  for (let li = 0; li < linesToShow; li++) {
    const line = rawLines[li];
    const isLastRaw = li === rawLines.length - 1;

    if (line.length === 0) {
      visualLines.push({ text: '', isLast: isLastRaw });
    } else {
      for (let i = 0; i < line.length; i += maxLineWidth) {
        const chunk = line.slice(i, i + maxLineWidth);
        const isLastChunk = i + maxLineWidth >= line.length;
        visualLines.push({ text: chunk, isLast: isLastRaw && isLastChunk });
      }
    }
  }

  const hiddenLines = rawLines.length > MAX_VISIBLE_LINES ? rawLines.length - MAX_VISIBLE_LINES : 0;

  return (
    <Box flexDirection="column" flexGrow={1}>
      {visualLines.map((vl, idx) => (
        <Box key={idx}>
          <Text>
            {vl.text}
            {vl.isLast && <Text inverse> </Text>}
          </Text>
        </Box>
      ))}
      {hiddenLines > 0 && (
        <Text color="gray" dimColor>
          ... +{hiddenLines} lines
        </Text>
      )}
    </Box>
  );
}
