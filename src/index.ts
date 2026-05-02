#!/usr/bin/env node

import { Agent } from "./agent/index.js";
import { McpManager } from "./services/mcp-manager.js";
import { configService } from "./services/config.js";
import { version as pkgVersion } from "../package.json";
import { logger } from "./services/logger.js";
import { setMcpManager } from "./tools/index.js";
import { loadChat, getCurrentChatId } from "./services/chat-storage.js";
import { spawn, spawnSync } from "child_process";

// Last-resort guards — keep the process alive on unexpected errors
// instead of crashing the whole TUI session. We log and continue.
process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception", {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
});

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled rejection", {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

// Parse CLI args
const args = process.argv.slice(2);
let resumeChatId: string | undefined;
let promptArg: string | undefined;

// Top-level subcommands
const firstArg = args[0];
if (firstArg === "upgrade" || firstArg === "update") {
  await runUpgrade();
  process.exit(0);
}
if (firstArg === "--version" || firstArg === "-v") {
  console.log(`v${pkgVersion}`);
  process.exit(0);
}

for (let i = 0; i < args.length; i++) {
  if ((args[i] === "--resume" || args[i] === "-r") && args[i + 1]) {
    resumeChatId = args[i + 1];
    i++;
    continue;
  }
  if ((args[i] === "--prompt" || args[i] === "-p") && args[i + 1]) {
    promptArg = args[i + 1];
    i++;
    continue;
  }
}

async function runUpgrade(): Promise<void> {
  console.log(`\n  Current version: v${pkgVersion}`);
  console.log("  Checking for updates...\n");

  // Find the best package manager available
  const managers = [
    { cmd: "bun", args: ["add", "-g", "@todlabs/tod@latest"] },
    { cmd: "npm", args: ["install", "-g", "@todlabs/tod@latest"] },
  ];

  let chosen: (typeof managers)[number] | null = null;
  for (const m of managers) {
    try {
      const probe = spawnSync(m.cmd, ["--version"], {
        stdio: "ignore",
        shell: process.platform === "win32",
      });
      if (probe.status === 0) {
        chosen = m;
        break;
      }
    } catch {
      /* try next */
    }
  }

  if (!chosen) {
    console.error("  No package manager found (npm or bun). Install one first.");
    process.exit(1);
  }

  console.log(`  Running: ${chosen.cmd} ${chosen.args.join(" ")}\n`);

  const result = spawnSync(chosen.cmd, chosen.args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    console.error(`\n  Upgrade failed (exit code ${result.status})`);
    process.exit(result.status || 1);
  }

  console.log("\n  Upgrade complete. Starting tod...\n");

  // Spawn a fresh tod and detach — our process will exit after
  const child = spawn("tod", [], {
    stdio: "inherit",
    shell: process.platform === "win32",
    detached: false,
  });

  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });

  child.on("error", (err) => {
    console.error("  Could not start tod:", err.message);
    process.exit(1);
  });

  // Prevent our process from exiting before child finishes
  await new Promise(() => {});
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
