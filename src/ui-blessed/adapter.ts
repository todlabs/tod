import { BlessedUI } from './index.js';
import { Agent } from '../core/agent.js';
import { BackgroundTaskManager } from '../agent/backgroundManager.js';
import { McpManager } from '../services/mcp-manager.js';
import { skillsManager } from '../services/skills.js';
import { executeCommand, commands } from '../ui/commands.js';
import { readdirSync, Dirent } from 'fs';
import { join } from 'path';

const VERSION = '1.1.0';
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.next', '__pycache__', '.cache', 'coverage', 'build']);

export async function runBlessedApp(
  agent: Agent,
  backgroundManager: BackgroundTaskManager,
  mcpManager?: McpManager
) {
  const ui = new BlessedUI(VERSION);
  let activeSkill: string | null = null;

  // Обработка ввода
  ui.on('submit', async (text: string) => {
    if (text.startsWith('/')) {
      await handleCommand(text);
      return;
    }

    if (activeSkill) {
      const skill = skillsManager.loadSkill(activeSkill);
      if (skill) {
        const rendered = skillsManager.renderSkillInstructions(skill, text);
        agent.setActiveSkill(rendered);
      }
    }

    agent.updateBackgroundTasksContext(backgroundManager.getTasksSummary());
    ui.setProcessing(true);

    try {
      let response = '';
      let lastUpdate = Date.now();

      await agent.processMessage(text, {
        onChunk: (chunk) => {
          if (chunk.role === 'assistant' && !chunk.isThinking) {
            response += chunk.content;
            // Обновляем UI не чаще 100мс
            if (Date.now() - lastUpdate > 100) {
              // Для потокового вывода можно добавить временное сообщение
              lastUpdate = Date.now();
            }
          }
        },
        onToolCall: (toolName) => {
          ui.addMessage('system', `[tool: ${toolName}]`);
        }
      });

      if (response) {
        ui.addMessage('assistant', response);
      }
    } catch (err) {
      ui.addMessage('system', `Error: ${err}`);
    } finally {
      ui.setProcessing(false);
    }
  });

  // Поиск файлов для @
  ui.on('file-suggest', (query: string) => {
    const files = searchFiles(query, '.', 0);
    ui.showFileSuggestions(files.slice(0, 8));
  });

  // Выход
  ui.on('exit', () => {
    ui.destroy();
    process.exit(0);
  });

  // Фоновые задачи
  backgroundManager.onTaskResult((taskId, result, task) => {
    agent.handleBackgroundTaskResult(taskId, result);
    ui.addMessage('system', `[${taskId}] "${task.name}" done`);
  });

  // Приветствие
  ui.addMessage('assistant', 'TOD Blessed UI ready. Type /help for commands, @ for files.');

  async function handleCommand(text: string) {
    const result = executeCommand(text);

    if (result === 'help') {
      const help = commands.map(c => `  ${c.name.padEnd(20)} ${c.description}`).join('\n');
      ui.addMessage('system', `Commands:\n${help}\n\nUse @filename to reference files`);
    }
    else if (result === 'clear') {
      ui.clear();
    }
    else if (result === 'exit') {
      ui.emit('exit');
    }
    else if (result === 'tasks') {
      const tasks = backgroundManager.getAllTasks();
      ui.addMessage('system', tasks.length === 0 ? 'No tasks' : backgroundManager.getTasksSummary());
    }
    else if (result === 'show_mcp') {
      if (!mcpManager) {
        ui.addMessage('system', 'MCP not initialized');
        return;
      }
      const statuses = mcpManager.getStatus();
      if (statuses.length === 0) {
        ui.addMessage('system', 'No MCP servers');
        return;
      }
      const lines = ['MCP Servers:'];
      for (const s of statuses) {
        const icon = s.status === 'connected' ? '●' : s.status === 'error' ? '✗' : '○';
        lines.push(`  ${icon} ${s.name} (${s.toolCount} tools)`);
      }
      ui.addMessage('system', lines.join('\n'));
    }
    else if (result === 'list_skills') {
      const help = skillsManager.getSkillHelp();
      ui.addMessage('system', help);
    }
    else if (result?.startsWith('skill:')) {
      const skillName = result.replace('skill:', '').split(':')[0];
      const skill = skillsManager.loadSkill(skillName);
      if (skill) {
        activeSkill = skillName;
        const rendered = skillsManager.renderSkillInstructions(skill, '');
        agent.setActiveSkill(rendered);
        ui.addMessage('system', `[skill] /${skill.name} activated`);
      }
    }
    else if (result === 'skill_off') {
      activeSkill = null;
      agent.setActiveSkill(null);
      ui.addMessage('system', 'Skill deactivated');
    }
    else if (typeof result === 'string') {
      ui.addMessage('system', result);
    }
  }
}

function searchFiles(query: string, dir: string, depth: number): string[] {
  if (depth > 3) return [];
  
  const results: string[] = [];
  const lowerQuery = query.toLowerCase();
  
  try {
    const items = readdirSync(dir, { withFileTypes: true });
    
    for (const item of items) {
      if (SKIP_DIRS.has(item.name)) continue;
      
      const name = item.name;
      const isMatch = name.toLowerCase().includes(lowerQuery);
      
      if (item.isDirectory()) {
        if (isMatch) {
          results.push(name + '/');
        }
        // Рекурсивно ищем в подпапках
        if (depth < 2) {
          const subResults = searchFiles(query, join(dir, name), depth + 1);
          results.push(...subResults.map(r => name + '/' + r));
        }
      } else if (isMatch) {
        results.push(name);
      }
      
      if (results.length >= 20) break;
    }
  } catch {
    // ignore
  }
  
  return results;
}
