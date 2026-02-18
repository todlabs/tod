import React from 'react';
import { Box, Text, useInput, useStdout } from 'ink';

interface MultilineInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  placeholder?: string;
  isDisabled?: boolean;
  blockReturn?: boolean;
}

export default function MultilineInput({
  value,
  onChange,
  onSubmit,
  placeholder = '',
  isDisabled = false,
  blockReturn = false,
}: MultilineInputProps) {
  const { stdout } = useStdout();
  // border(2) + paddingX(2) + "→ "(2) + safety(1)
  const maxLineWidth = Math.max(20, (stdout?.columns ?? 80) - 7);

  useInput(
    (input, key) => {
      if (isDisabled) return;

      if (key.return) {
        if (!blockReturn) onSubmit(value);
        return;
      }

      if (key.backspace || key.delete) {
        if (value.length > 0) onChange(value.slice(0, -1));
        return;
      }

      if (input && !key.ctrl && !key.meta && !key.upArrow && !key.downArrow) {
        onChange(value + input);
      }
    },
    { isActive: !isDisabled }
  );

  // Нарезаем каждую строку на куски под ширину терминала
  // чтобы рамка InputArea правильно их обнимала
  function wrapLine(line: string): string[] {
    if (line.length === 0) return [''];
    const chunks: string[] = [];
    for (let i = 0; i < line.length; i += maxLineWidth) {
      chunks.push(line.slice(i, i + maxLineWidth));
    }
    return chunks;
  }

  const rawLines = value.split('\n');
  const maxVisible = 8;

  // Строим массив визуальных строк с метаданными
  type VisualLine = { text: string; isLast: boolean };
  const visualLines: VisualLine[] = [];

  for (let li = 0; li < Math.min(rawLines.length, maxVisible); li++) {
    const chunks = wrapLine(rawLines[li]);
    const isLastRaw = li === rawLines.length - 1;
    for (let ci = 0; ci < chunks.length; ci++) {
      visualLines.push({
        text: chunks[ci],
        isLast: isLastRaw && ci === chunks.length - 1,
      });
    }
  }

  const hiddenLines = rawLines.length > maxVisible ? rawLines.length - maxVisible : 0;

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
        <Text color="gray" dimColor>... +{hiddenLines} lines</Text>
      )}
    </Box>
  );
}
