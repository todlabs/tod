import React from 'react';
import { Box, Text } from 'ink';

interface McpStatusInfo {
  connected: number;
  total: number;
}

interface StatusBarProps {
  modelName: string;
  isProcessing: boolean;
  tokensUsed: number;
  mcpStatus?: McpStatusInfo;
}

const MAX_TOKENS = 128000;
const BAR_WIDTH = 14;

function ContextBar({ used }: { used: number }) {
  const pct = Math.min(used / MAX_TOKENS, 1);
  const filled = Math.round(pct * BAR_WIDTH);
  const empty = BAR_WIDTH - filled;
  const color = pct > 0.8 ? 'red' : pct > 0.5 ? 'yellow' : 'cyan';

  return (
    <Box>
      <Text color={color}>{'█'.repeat(filled)}</Text>
      <Text color="gray" dimColor>{'░'.repeat(empty)}</Text>
    </Box>
  );
}

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${n}`;
}

export default function StatusBar({ modelName, isProcessing, tokensUsed, mcpStatus }: StatusBarProps) {
  const shortModel = modelName.split('/').pop() ?? modelName;
  const pct = Math.round((tokensUsed / MAX_TOKENS) * 100);

  const showMcp = mcpStatus && mcpStatus.total > 0;
  const mcpColor = showMcp
    ? (mcpStatus.connected === mcpStatus.total ? 'green' : mcpStatus.connected > 0 ? 'yellow' : 'red')
    : 'gray';

  return (
    <Box justifyContent="space-between" marginTop={1}>
      <Box gap={2}>
        <Text color="gray">{shortModel}</Text>
        {showMcp && (
          <Text color={mcpColor}>MCP {mcpStatus.connected}/{mcpStatus.total}</Text>
        )}
      </Box>
      <Box gap={2}>
        <ContextBar used={tokensUsed} />
        <Text color="gray" dimColor>
          {formatTokens(tokensUsed)} / 128k  {pct}%
        </Text>
      </Box>
    </Box>
  );
}
