import React from "react";
import { Box, Text } from "ink";
import { useTerminalSize } from "../hooks/useTerminalSize.js";

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
  cleanMode?: boolean;
  updateVersion?: string | null;
}

export default function StatusBar({
  modelName,
  isProcessing,
  tokensUsed,
  maxContext,
  mcpStatus,
  cleanMode = false,
  updateVersion,
}: StatusBarProps) {
  const { columns } = useTerminalSize();
  const pct = Math.min(tokensUsed / maxContext, 1);
  const barWidth = Math.min(20, Math.max(5, Math.floor((columns - 30) / 2)));
  const filled = Math.round(pct * barWidth);
  const pctDisplay = Math.round(pct * 100);
  const showMcp = mcpStatus && mcpStatus.total > 0;

  if (cleanMode) {
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
          {updateVersion && (
            <Text color="yellow">update! v{updateVersion}</Text>
          )}
        </Box>
        <Box gap={1}>
          <Text color="gray" dimColor>
            {pctDisplay}%
          </Text>
        </Box>
      </Box>
    );
  }

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
        {updateVersion && (
          <Text color="yellow">update! v{updateVersion}</Text>
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
