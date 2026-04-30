#!/usr/bin/env node

import { Agent } from "./agent/index.js";
import { McpManager } from "./services/mcp-manager.js";
import { configService } from "./services/config.js";
import { logger } from "./services/logger.js";
import { setMcpManager } from "./tools/index.js";
import { loadChat, getCurrentChatId } from "./services/chat-storage.js";

// Parse --resume <id> from CLI args
const args = process.argv.slice(2);
let resumeChatId: string | undefined;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--resume" && args[i + 1]) {
    resumeChatId = args[i + 1];
    break;
  }
}

try {
  configService.getConfig();
  logger.info("TOD starting...");
} catch (error) {
  console.error("Error: Invalid configuration");
  if (error instanceof Error) {
    console.error(error.message);
  }
  process.exit(1);
}

const agentConfig = configService.getConfig();
const agent = new Agent(agentConfig);

// Initialize MCP servers
const mcpManager = new McpManager();
setMcpManager(mcpManager);

const mcpServers = configService.getMcpServers();
const hasMcpServers = Object.keys(mcpServers).length > 0;

if (hasMcpServers) {
  logger.info("Connecting MCP servers...", {
    count: Object.keys(mcpServers).length,
  });
  mcpManager
    .connectAll(mcpServers)
    .then(() => {
      const status = mcpManager.getStatusSummary();
      logger.info("MCP servers ready", {
        connected: status.connected,
        total: status.total,
      });
      const descriptions = mcpManager.getToolDescriptions();
      if (descriptions) {
        agent.setMcpToolDescriptions(descriptions);
      }
    })
    .catch((error) => {
      logger.error("MCP initialization error", { error });
    });
}

logger.info("Application initialized", {
  model: configService.getModel(),
  ui: "ink",
  resume: resumeChatId || "none",
});

if (!process.stdin.isTTY) {
  console.error("Error: This application requires an interactive TTY.");
  process.exit(1);
}

// React Ink UI
const React = await import("react");
const { render } = await import("ink");
const { default: App } = await import("./ui/App.js");

console.clear();

const { waitUntilExit } = render(
  React.default.createElement(App, {
    agent,
    mcpManager: hasMcpServers ? mcpManager : undefined,
    version: "v1.3.1",
    resumeChatId,
  }),
);

await waitUntilExit();

// Goodbye + resume hint
const lastChatId = getCurrentChatId();
if (lastChatId) {
  const chat = loadChat(lastChatId);
  const name = chat ? chat.name : lastChatId;
  console.log(`\nGoodbye! Resume: tod --resume ${lastChatId}`);
  if (chat && chat.name) {
    console.log(`  (${name})`);
  }
  console.log();
} else {
  console.log("\nGoodbye!");
}

await mcpManager.shutdown();
logger.info("Goodbye!");
process.exit(0);
