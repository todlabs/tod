import React from "react";
import { Box, Text, useStdout } from "ink";
import MultilineInput from "./MultilineInput.js";

interface InputAreaProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  isProcessing: boolean;
  hasPending?: boolean;
  needsSetup?: boolean;
}

export default function InputArea({
  value,
  onChange,
  onSubmit,
  isProcessing,
  hasPending = false,
  needsSetup = false,
}: InputAreaProps) {
  const { stdout } = useStdout();
  const cols = stdout?.columns ?? 80;
  const line = "─".repeat(cols - 2);

  const placeholder = needsSetup
    ? "Use /providers to configure API key first..."
    : isProcessing
      ? hasPending
        ? "Queued! Waiting for agent..."
        : "Type next message, Enter to queue..."
      : "Message...  ( / commands · @ files · ↩ + Enter newline )";

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color="gray">{line}</Text>
      <Box flexDirection="row">
        <Text color={isProcessing ? "gray" : "white"}>
          {isProcessing ? "↩ " : "❯ "}
        </Text>
        <MultilineInput
          value={value}
          onChange={onChange}
          onSubmit={onSubmit}
          placeholder={placeholder}
          isDisabled={false}
        />
      </Box>
      <Text color="gray">{line}</Text>
    </Box>
  );
}
