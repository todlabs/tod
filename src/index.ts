#!/usr/bin/env node

import { Agent } from './agent/index.js';
import { BackgroundTaskManager } from './agent/backgroundManager.js';
import { McpManager } from './services/mcp-manager.js';
import { configService } from './services/config.js';
import { logger } from './services/logger.js';
import { setBackgroundManager, setMcpManager } from './tools/index.js';
import { skillsManager } from './services/skills.js';

const useNative = process.argv.includes('--native') || process.env.TOD_UI === 'native';

try {
  configService.getConfig();
  logger.info('TOD starting...');
} catch (error) {
  console.error('Error: Invalid configuration');
  if (error instanceof Error) {
    console.error(error.message);
  }
  process.exit(1);
}

const agentConfig = configService.getConfig();
const agent = new Agent(agentConfig);
const backgroundManager = new BackgroundTaskManager(agentConfig);
backgroundManager.setAutoCleanupTimeout(10000);
setBackgroundManager(backgroundManager);

// Initialize MCP servers
const mcpManager = new McpManager();
setMcpManager(mcpManager);

const mcpServers = configService.getMcpServers();
const hasMcpServers = Object.keys(mcpServers).length > 0;

if (hasMcpServers) {
  logger.info('Connecting MCP servers...', { count: Object.keys(mcpServers).length });
  mcpManager.connectAll(mcpServers).then(() => {
    const status = mcpManager.getStatusSummary();
    logger.info('MCP servers ready', { connected: status.connected, total: status.total });
    const descriptions = mcpManager.getToolDescriptions();
    if (descriptions) {
      agent.setMcpToolDescriptions(descriptions);
    }
  }).catch(error => {
    logger.error('MCP initialization error', { error });
  });
}

// Initialize skills
const skills = skillsManager.listSkills();
if (skills.length === 0) {
  logger.info('Creating example skills...');
  skillsManager.createExampleSkills();
}
logger.info('Skills loaded', { count: skillsManager.listSkills().length });

logger.info('Application initialized', { model: configService.getModel(), ui: useNative ? 'native' : 'ink' });

if (!process.stdin.isTTY) {
  console.error('Error: This application requires an interactive TTY.');
  process.exit(1);
}

if (useNative) {
  // New Native UI (terminal-kit based)
  const { runNativeApp } = await import('./ui-native/adapter.js');
  await runNativeApp(agent, backgroundManager, hasMcpServers ? mcpManager : undefined);
} else {
  // React Ink UI
  const React = await import('react');
  const { render } = await import('ink');
  const { default: App } = await import('./ui/App.js');
  
  console.clear();
  
  const { waitUntilExit } = render(
    React.default.createElement(App, {
      agent,
      backgroundManager,
      mcpManager: hasMcpServers ? mcpManager : undefined,
      version: 'v1.1.0',
    })
  );

  await waitUntilExit();
  await mcpManager.shutdown();
  logger.info('Goodbye!');
  console.log('\nGoodbye!');
  process.exit(0);
}
