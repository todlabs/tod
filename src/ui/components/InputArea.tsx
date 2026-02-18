import React from 'react';
import { Box, Text } from 'ink';
import MultilineInput from './MultilineInput.js';

interface InputAreaProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  isProcessing: boolean;
  blockReturn?: boolean;
}

export default function InputArea({ value, onChange, onSubmit, isProcessing, blockReturn = false }: InputAreaProps) {
  return (
    <Box borderStyle="single" borderColor="white" paddingX={1} marginTop={1} flexDirection="row">
      <Text color="white">{'→ '}</Text>
      <MultilineInput
        value={value}
        onChange={onChange}
        onSubmit={onSubmit}
        placeholder={isProcessing ? 'Processing...' : 'Plan, search, build anything  ( / commands · @ files )'}
        isDisabled={isProcessing}
        blockReturn={blockReturn}
      />
    </Box>
  );
}
