// Адаптер: соединяет нативный UI с core/agent
import { NativeUI } from './index.js';
import { Agent } from '../core/agent.js';
import { BackgroundTaskManager } from '../agent/backgroundManager.js';
import { McpManager } from '../services/mcp-manager.js';
import { skillsManager } from '../services/skills.js';
import { executeCommand, commands } from '../ui/commands.js';
import terminal from 'terminal-kit';

const term = terminal.terminal;

const VERSION = '1.0.5';

export async function runNativeApp(
  agent: Agent,
  backgroundManager: BackgroundTaskManager,
  mcpManager?: McpManager
) {
  const ui = new NativeUI(VERSION);
  
  let activeSkill: string | null = null;
  
  ui.on('submit', async (text: string) => {
    // Обработка команд
    if (text.startsWith('/')) {
      await handleCommand(text);
      return;
    }
    
    // Обработка с активным скиллом
    if (activeSkill) {
      const skill = skillsManager.loadSkill(activeSkill);
      if (skill) {
        const rendered = skillsManager.renderSkillInstructions(skill, text);
        agent.setActiveSkill(rendered);
      }
    }
    
    // Обновляем контекст фоновых задач
    agent.updateBackgroundTasksContext(backgroundManager.getTasksSummary());
    
    ui.setProcessing(true);
    
    try {
      let response = '';
      
      await agent.processMessage(text, {
        onChunk: (chunk) => {
          if (chunk.role === 'assistant' && !chunk.isThinking) {
            response += chunk.content;
            // Показываем потоково
            ui.addMessage('assistant', response);
          }
        },
        onToolCall: (toolName) => {
          ui.addMessage('system', `[tool: ${toolName}]`);
        }
      });
      
      // Финальное сообщение
      if (response) {
        ui.addMessage('assistant', response);
      }
    } catch (err) {
      ui.addMessage('system', `Error: ${err}`);
    } finally {
      ui.setProcessing(false);
    }
  });
  
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
  ui.addMessage('assistant', 'TOD Native UI ready. Type /help for commands.');
  
  async function handleCommand(text: string) {
    const result = executeCommand(text);
    
    if (result === 'help') {
      const help = commands.map(c => `  ${c.name.padEnd(20)} ${c.description}`).join('\n');
      ui.addMessage('system', `Commands:\n${help}`);
    }
    else if (result === 'clear') {
      // Нативная очистка
      term.clear();
      ui['draw']();
    }
    else if (result === 'exit') {
      ui.emit('exit');
    }
    else if (result === 'tasks') {
      const tasks = backgroundManager.getAllTasks();
      ui.addMessage('system', tasks.length === 0 ? 'No tasks' : backgroundManager.getTasksSummary());
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
