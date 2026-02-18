import React from 'react';
import { Box, Text } from 'ink';

interface HeaderProps {
  version: string;
  currentDir: string;
}

export default function Header({ version, currentDir }: HeaderProps) {
  const displayName = currentDir.split('\\').pop() || currentDir.split('/').pop();

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color="white">TOD <Text color="gray">{version}</Text></Text>
      <Text color="gray">~/{displayName}</Text>
    </Box>
  );
}
