// Native UI Adapter - соединяет нативный UI с core/agent
import { NativeUI } from './index.js';
import { Agent } from '../core/agent.js';
import { BackgroundTaskManager } from '../agent/backgroundManager.js';
import { McpManager } from '../services/mcp-manager.js';
import { skillsManager } from '../services/skills.js';
import { executeCommand, commands, getCommandSuggestions } from '../ui/commands.js';
import { providers, getProvider } from '../services/providers.js';
import { configService } from '../services/config.js';
import { logger } from '../services/logger.js';
import { readdirSync, Dirent } from 'fs';
import { join } from 'path';
import type { SuggestionItem, MenuState } from './types.js';

const VERSION = '1.1.2';
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.next', '__pycache__', '.cache', 'coverage', 'build']);

export async function runNativeApp(
  agent: Agent,
  backgroundManager: BackgroundTaskManager,
  mcpManager?: McpManager
) {
  const ui = new NativeUI({ version: VERSION, showThinking: true });
  ui.setProviders(providers);
  let activeSkill: string | null = null;
  let showThinking = true;

  // Handle user input
  ui.on('submit', async (text: string) => {
    if (text.startsWith('/')) {
      await handleCommand(text);
      return;
    }

    // Apply active skill
    if (activeSkill) {
      const skill = skillsManager.loadSkill(activeSkill);
      if (skill) {
        const rendered = skillsManager.renderSkillInstructions(skill, text);
        agent.setActiveSkill(rendered);
      }
    }

    // Update background tasks context
    agent.updateBackgroundTasksContext(backgroundManager.getTasksSummary());

    ui.setProcessing(true);
    let response = '';
    let lastUpdate = Date.now();

    try {
      await agent.processMessage(text, {
        onChunk: (chunk) => {
          if (chunk.role === 'assistant' && !chunk.isThinking) {
            response += chunk.content;
            // Throttle UI updates for performance
            if (Date.now() - lastUpdate > 50) {
              ui.setStreamingContent(response);
              lastUpdate = Date.now();
            }
          }
        },
        onToolCall: (toolName) => {
          ui.addMessage({ role: 'system', content: `[tool: ${toolName}]` });
        }
      });

      ui.endStreaming();
      if (response) {
        ui.addMessage({ role: 'assistant', content: response });
      }
    } catch (err) {
      ui.addMessage({ role: 'system', content: `Error: ${err}` });
      logger.error('Agent processing error', { error: err });
    } finally {
      ui.setProcessing(false);
    }
  });

  // Handle abort
  ui.on('abort', () => {
    agent.abort();
    ui.setProcessing(false);
    ui.addMessage({ role: 'system', content: 'Aborted' });
  });

  // Handle file suggestions (@)
  ui.on('file-suggest', (query: string) => {
    const files = searchFiles(query, '.', 0);
    const suggestions: SuggestionItem[] = files.slice(0, 8).map(f => ({
      type: 'file',
      path: f.path,
      isDir: f.isDir,
      label: f.path,
    }));
    ui.setSuggestions(suggestions);
  });

  // Handle command suggestions (/)
  ui.on('command-suggest', (input: string) => {
    const cmdSuggestions = getCommandSuggestions(input);
    const suggestions: SuggestionItem[] = cmdSuggestions.map(c => ({
      type: 'command',
      name: c.name,
      description: c.description,
    }));
    ui.setSuggestions(suggestions);
  });

  // Handle menu provider selection
  ui.on('menu-select-provider-index', (index: number) => {
    const provider = providers[index];
    if (provider) {
      const currentKey = configService.getProviderKey(provider.id);
      if (currentKey) {
        // Skip API key if already set
        ui.setMenu({ type: 'model-select', provider }, 0);
      } else {
        ui.setMenu({ type: 'provider-apikey', provider }, 0);
      }
    }
  });

  // Handle provider selection with API key
  ui.on('menu-select-provider', (providerId: string, apiKey: string | null) => {
    configService.setProvider(providerId, apiKey || undefined);
    const provider = getProvider(providerId);
    if (provider) {
      ui.setMenu({ type: 'model-select', provider }, 0);
    }
  });

  // Handle model selection
  ui.on('menu-select-model', (providerId: string, modelId: string) => {
    configService.setModel(modelId);
    const newConfig = configService.getConfig();
    agent.updateConfig(newConfig);
    ui.closeMenu();
    ui.addMessage({ role: 'system', content: `Provider: ${getProvider(providerId)?.name}, Model: ${modelId}` });
  });

  // Handle exit
  ui.on('exit', async () => {
    ui.destroy();
    await mcpManager?.shutdown();
    logger.info('Goodbye!');
    process.exit(0);
  });

  // Background task results
  backgroundManager.onTaskResult((taskId, result, task) => {
    agent.handleBackgroundTaskResult(taskId, result);
    ui.addMessage({ role: 'system', content: `[${taskId}] "${task.name}" done` });
    updateBackgroundTasks();
  });

  // Background task updates
  backgroundManager.onTaskUpdate(() => {
    updateBackgroundTasks();
  });

  function updateBackgroundTasks() {
    const tasks = backgroundManager.getAllTasks().map(t => ({
      id: t.id,
      name: t.name,
      status: t.status as any,
      activity: t.activity,
    }));
    ui.setBackgroundTasks(tasks);
  }

  // Command handler
  async function handleCommand(text: string) {
    const result = executeCommand(text);
    const cmdName = text.split(' ')[0];

    switch (result) {
      case 'help':
        showHelp();
        break;
        
      case 'clear':
        ui.clear();
        break;
        
      case 'exit':
        ui.emit('exit');
        break;
        
      case 'tasks':
        showTasks();
        break;
        
      case 'show_mcp':
        showMcp();
        break;
        
      case 'list_skills':
        showSkills();
        break;
        
      case 'open_provider_menu':
        ui.setMenu({ type: 'provider-select' }, 0);
        break;
        
      case 'open_model_menu': {
        const providerId = configService.getProvider() || 'openai';
        const provider = getProvider(providerId);
        if (provider) {
          const currentModel = configService.getModel();
          const modelIndex = provider.models.findIndex(m => m.id === currentModel);
          ui.setMenu({ type: 'model-select', provider }, Math.max(0, modelIndex));
        }
        break;
      }
      
      case 'toggle_thinking':
        showThinking = !showThinking;
        ui.toggleThinking();
        ui.addMessage({ role: 'system', content: `Thinking display ${showThinking ? 'enabled' : 'disabled'}` });
        break;
        
      case 'compact':
        await handleCompact();
        break;
        
      case 'skill_off':
        activeSkill = null;
        agent.setActiveSkill(null);
        ui.addMessage({ role: 'system', content: 'Skill deactivated' });
        break;
        
      default:
        if (result?.startsWith('skill:')) {
          await handleSkill(result);
        } else if (typeof result === 'string') {
          ui.addMessage({ role: 'system', content: result });
        } else {
          ui.addMessage({ role: 'system', content: `Unknown command: ${cmdName}` });
        }
    }
  }

  function showHelp() {
    const lines = [
      'Commands:',
      ...commands.map(c => `  ${c.name.padEnd(20)} ${c.description}`),
      '',
      'Use @filename to reference files',
      'Use / for quick commands',
    ];
    ui.addMessage({ role: 'system', content: lines.join('\n') });
  }

  function showTasks() {
    const tasks = backgroundManager.getAllTasks();
    if (tasks.length === 0) {
      ui.addMessage({ role: 'system', content: 'No background tasks' });
    } else {
      const lines = ['Background Tasks:'];
      for (const t of tasks) {
        const status = t.status === 'completed' ? '✓' : t.status === 'failed' ? '✗' : '○';
        lines.push(`  ${status} ${t.name} (${t.status})`);
      }
      ui.addMessage({ role: 'system', content: lines.join('\n') });
    }
  }

  function showMcp() {
    if (!mcpManager) {
      ui.addMessage({ role: 'system', content: 'MCP not initialized' });
      return;
    }
    const statuses = mcpManager.getStatus();
    if (statuses.length === 0) {
      ui.addMessage({ role: 'system', content: 'No MCP servers' });
      return;
    }
    const lines = ['MCP Servers:'];
    for (const s of statuses) {
      const icon = s.status === 'connected' ? '●' : s.status === 'error' ? '✗' : '○';
      lines.push(`  ${icon} ${s.name.padEnd(20)} (${s.toolCount} tools)`);
      if (s.error) {
        lines.push(`      Error: ${s.error}`);
      }
    }
    ui.addMessage({ role: 'system', content: lines.join('\n') });
  }

  function showSkills() {
    const help = skillsManager.getSkillHelp();
    ui.addMessage({ role: 'system', content: help });
  }

  async function handleCompact() {
    ui.addMessage({ role: 'system', content: 'Compacting context...' });
    try {
      const result = await agent.compactContext();
      ui.clear();
      ui.addMessage({
        role: 'assistant',
        content: `Context compacted!\nOld: ${result.oldTokens}t → New: ${result.newTokens}t (saved ${Math.round(((result.oldTokens - result.newTokens) / result.oldTokens) * 100)}%)`
      });
    } catch (error) {
      ui.addMessage({ role: 'system', content: `Failed to compact: ${error instanceof Error ? error.message : String(error)}` });
    }
  }

  async function handleSkill(result: string) {
    const skillData = result.replace('skill:', '');
    const colonIndex = skillData.indexOf(':');
    let skillName: string;
    let skillMessage: string | null = null;

    if (colonIndex > 0) {
      skillName = skillData.substring(0, colonIndex);
      skillMessage = skillData.substring(colonIndex + 1);
    } else {
      skillName = skillData;
    }

    const skill = skillsManager.loadSkill(skillName);
    if (!skill) {
      ui.addMessage({ role: 'system', content: `Skill not found: ${skillName}` });
      return;
    }

    activeSkill = skillName;
    const location = skill.isGlobal ? 'global' : 'project';
    const rendered = skillsManager.renderSkillInstructions(skill, skillMessage || '');
    agent.setActiveSkill(rendered);

    ui.addMessage({
      role: 'system',
      content: `[skill] /${skill.name} activated (${location})\n  ${skill.description}`
    });

    if (skillMessage && skillMessage.trim()) {
      agent.updateBackgroundTasksContext(backgroundManager.getTasksSummary());
      ui.setProcessing(true);
      
      let response = '';
      let lastUpdate = Date.now();
      
      try {
        await agent.processMessage(skillMessage.trim(), {
          onChunk: (chunk) => {
            if (chunk.role === 'assistant' && !chunk.isThinking) {
              response += chunk.content;
              if (Date.now() - lastUpdate > 50) {
                ui.setStreamingContent(response);
                lastUpdate = Date.now();
              }
            }
          },
          onToolCall: (toolName) => {
            ui.addMessage({ role: 'system', content: `[tool: ${toolName}]` });
          }
        });
        
        ui.endStreaming();
        if (response) {
          ui.addMessage({ role: 'assistant', content: response });
        }
      } catch (err) {
        ui.addMessage({ role: 'system', content: `Error: ${err}` });
      } finally {
        ui.setProcessing(false);
      }
    }
  }

  // Initial background tasks update
  updateBackgroundTasks();

  // Welcome message
  ui.addMessage({ role: 'assistant', content: 'TOD Native UI ready. Type /help for commands, @ for files.' });
  
  logger.info('Native UI started');
}

// File search for @ mentions
interface FileResult {
  path: string;
  isDir: boolean;
}

function searchFiles(query: string, dir: string, depth: number): FileResult[] {
  if (depth > 3) return [];

  const results: FileResult[] = [];
  const lowerQuery = query.toLowerCase();

  try {
    const items = readdirSync(dir, { withFileTypes: true });

    for (const item of items) {
      if (SKIP_DIRS.has(item.name)) continue;

      const name = item.name;
      const isMatch = name.toLowerCase().includes(lowerQuery);
      const fullPath = dir === '.' ? name : `${dir}/${name}`;

      if (item.isDirectory()) {
        if (isMatch) {
          results.push({ path: fullPath + '/', isDir: true });
        }
        if (depth < 2) {
          const subResults = searchFiles(query, join(dir, name), depth + 1);
          results.push(...subResults);
        }
      } else if (isMatch) {
        results.push({ path: fullPath, isDir: false });
      }

      if (results.length >= 20) break;
    }
  } catch {
    // ignore
  }

  return results;
}
