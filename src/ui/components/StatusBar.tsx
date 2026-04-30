import React from "react";
import { Box, Text } from "ink";

interface McpStatusInfo {
  connected: number;
  total: number;
}

interface StatusBarProps {
  modelName: string;
  isProcessing: boolean;
  tokensUsed: number;
  maxContext: number;
  mcpStatus?: McpStatusInfo;
}

export default function StatusBar({
  modelName,
  isProcessing,
  tokensUsed,
  maxContext,
  mcpStatus,
}: StatusBarProps) {
  const pct = Math.min(tokensUsed / maxContext, 1);
  const barWidth = 10;
  const filled = Math.round(pct * barWidth);
  const pctDisplay = Math.round(pct * 100);
  const showMcp = mcpStatus && mcpStatus.total > 0;

  return (
    <Box justifyContent="space-between">
      <Box gap={1}>
        <Text color="white" bold>
          {modelName}
        </Text>
        {showMcp && (
          <Text color="gray" dimColor>
            mcp:{mcpStatus!.connected}/{mcpStatus!.total}
          </Text>
        )}
        {isProcessing && (
          <Text color="gray" dimColor>
            ···
          </Text>
        )}
      </Box>
      <Box gap={1}>
        <Text color="gray" dimColor>
          {pctDisplay}%
        </Text>
        <Text color="gray" dimColor>
          {"▓".repeat(filled)}
          {"░".repeat(barWidth - filled)}
        </Text>
      </Box>
    </Box>
  );
}
