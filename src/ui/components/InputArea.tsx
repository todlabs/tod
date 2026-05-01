import React from "react";
import { Box, Text } from "ink";
import MultilineInput from "./MultilineInput.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";

interface InputAreaProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  isProcessing: boolean;
  hasPending?: boolean;
  needsSetup?: boolean;
  isDisabled?: boolean;
  // Suggestion navigation
  hasSuggestions?: boolean;
  selectedSuggestionIndex?: number;
  suggestionCount?: number;
  onSuggestionNavigate?: (direction: "up" | "down") => void;
  onSuggestionFill?: (index: number) => void;
  onSuggestionExecute?: (index: number) => void;
  onEscape?: () => void;
}

export default function InputArea({
  value,
  onChange,
  onSubmit,
  isProcessing,
  hasPending = false,
  needsSetup = false,
  isDisabled = false,
  hasSuggestions = false,
  selectedSuggestionIndex = -1,
  suggestionCount = 0,
  onSuggestionNavigate,
  onSuggestionFill,
  onSuggestionExecute,
  onEscape,
}: InputAreaProps) {
  const { columns: cols } = useTerminalSize();
  // App has paddingLeft=1, paddingRight=1 → inner width = cols - 2
  const line = "─".repeat(Math.max(0, cols - 2));

  const placeholder = needsSetup
    ? "Use /providers to configure API key first..."
    : isProcessing
      ? hasPending
        ? "Queued! Waiting for agent..."
        : "Type next message, Enter to queue..."
      : "Message...  ( / commands · @ files · Shift+Enter newline )";

  return (
    <Box flexDirection="column">
      <Text color="gray">{line}</Text>
      <Box flexDirection="row">
        <Text color={isDisabled ? "gray" : isProcessing ? "gray" : "white"}>
          {isDisabled ? "  " : isProcessing ? "# " : "# "}
        </Text>
        <MultilineInput
          value={value}
          onChange={isDisabled ? () => {} : onChange}
          onSubmit={onSubmit}
          placeholder={placeholder}
          isDisabled={isDisabled}
          hasSuggestions={hasSuggestions}
          selectedSuggestionIndex={selectedSuggestionIndex}
          suggestionCount={suggestionCount}
          onSuggestionNavigate={onSuggestionNavigate}
          onSuggestionFill={onSuggestionFill}
          onSuggestionExecute={onSuggestionExecute}
          onEscape={onEscape}
        />
      </Box>
      <Text color="gray">{line}</Text>
    </Box>
  );
}
