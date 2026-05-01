#!/usr/bin/env node

import { Agent } from "./agent/index.js";
import { McpManager } from "./services/mcp-manager.js";
import { configService } from "./services/config.js";
import { version as pkgVersion } from "../package.json";
import { logger } from "./services/logger.js";
import { setMcpManager } from "./tools/index.js";
import { loadChat, getCurrentChatId } from "./services/chat-storage.js";

// Parse CLI args
const args = process.argv.slice(2);
let resumeChatId: string | undefined;
let promptArg: string | undefined;

for (let i = 0; i < args.length; i++) {
  if ((args[i] === "--resume" || args[i] === "-r") && args[i + 1]) {
    resumeChatId = args[i + 1];
    i++; // skip the value
    continue;
  }
  if ((args[i] === "--prompt" || args[i] === "-p") && args[i + 1]) {
    promptArg = args[i + 1];
    i++; // skip the value
    continue;
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

const agentConfig = configService.getAgentConfig();
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
  ui: promptArg ? "non-interactive" : "ink",
  resume: resumeChatId || "none",
});

// Non-interactive mode: run a single prompt and print result to stdout
if (promptArg) {
  if (hasMcpServers) {
    await mcpManager.connectAll(mcpServers);
    const descriptions = mcpManager.getToolDescriptions();
    if (descriptions) agent.setMcpToolDescriptions(descriptions);
  }

  let output = "";
  try {
    await agent.processMessage(promptArg, {
      onChunk: (chunk) => {
        if (chunk.role === "assistant" && !chunk.isThinking) {
          output += chunk.content;
        }
      },
      onToolCall: () => {},
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Error: ${msg}\n`);
    await mcpManager.shutdown();
    process.exit(1);
  }

  process.stdout.write(output.trim() + "\n");
  await mcpManager.shutdown();
  process.exit(0);
}

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
    version: `v${pkgVersion}`,
    resumeChatId,
  }),
);

await waitUntilExit();

// Goodbye + resume hint
const lastChatId = getCurrentChatId();
if (lastChatId) {
  const chat = loadChat(lastChatId);
  const name = chat ? chat.name : lastChatId;
  console.log(`\n  Bye! Resume: tod -r ${lastChatId}`);
  if (chat && chat.name) {
    console.log(`  (${name})`);
  }
  console.log();
} else {
  console.log("\n  Bye!\n");
}

await mcpManager.shutdown();
logger.info("Goodbye!");
process.exit(0);
