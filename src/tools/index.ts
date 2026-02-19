import { exec } from 'child_process';
import * as util from 'util';
import { promises as fs } from 'fs';
import { existsSync, type Dirent } from 'fs';
import { join } from 'path';
import * as os from 'os';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import { BackgroundTaskManager } from '../agent/backgroundManager.js';
import { McpManager } from '../services/mcp-manager.js';
import { logger } from '../services/logger.js';
import { skillsManager } from '../services/skills.js';

let backgroundManager: BackgroundTaskManager | null = null;
let mcpManager: McpManager | null = null;

export function setBackgroundManager(manager: BackgroundTaskManager): void {
  backgroundManager = manager;
}

export function setMcpManager(manager: McpManager): void {
  mcpManager = manager;
}

export function getMcpTools(): ChatCompletionTool[] {
  return mcpManager ? mcpManager.getTools() : [];
}

export const tools: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read a file from the filesystem',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the file to read',
          },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write content to a file',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the file to write',
          },
          content: {
            type: 'string',
            description: 'Content to write to the file',
          },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'execute_shell',
      description: 'Execute a shell command and return the output',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'Shell command to execute',
          },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_directory',
      description: 'List files and directories in a given path',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the directory to list',
          },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_directory',
      description: 'Create a new directory',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the directory to create',
          },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_background_tasks',
      description: 'Получить информацию о статусе фоновых задач: какие выполняются, какие завершены, что они делают. Используй перед началом новой задачи чтобы понять что происходит.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'background_task',
      description: 'Запустить фоновую задачу для выполнения в параллельном агенте. Используй для долгих операций: поиск в другой директории, код ревью, билд и анализ ошибок. Максимум 2 задачи одновременно. Если лимит превышен, подожди или используйте wait=true. Если wait=true, агент дождется завершения и сразу продолжит с результатом.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Короткое имя задачи (например: "Code Review", "Build Analysis")',
          },
          description: {
            type: 'string',
            description: 'Описание задачи',
          },
          task: {
            type: 'string',
            description: 'Детальное задание для фонового агента',
          },
          wait: {
            type: 'boolean',
            description: 'Дождаться завершения задачи перед продолжением работы. Используй если нужен результат. По умолчанию false.',
          },
        },
        required: ['name', 'description', 'task'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'wait_for_task',
      description: 'Дождаться завершения фоновой задачи и получить результат. Агент будет ожидать завершения задачи перед продолжением работы. Используйте ID задачи из background_task (например: bg-1).',
      parameters: {
        type: 'object',
        properties: {
          task_id: {
            type: 'string',
            description: 'ID фоновой задачи (например: bg-1)',
          },
        },
        required: ['task_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_skills',
      description: 'Получить список доступных навыков (skills). Используй когда пользователь хочет создать новый навык или узнать какие навыки доступны.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_skill',
      description: 'Прочитать содержимое навыка (skill). Используй когда нужно использовать конкретный навык для выполнения задачи.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Название навыка (например: skill-creator, web-search)',
          },
        },
        required: ['name'],
      },
    },
  },
];

interface ToolArgs {
  path?: string;
  content?: string;
  command?: string;
  name?: string;
  description?: string;
  task?: string;
  task_id?: string;
  wait?: boolean;
}

const execAsync = util.promisify(exec);

export async function executeTool(toolName: string, args: ToolArgs): Promise<string> {
  try {
    switch (toolName) {
      case 'read_file':
        if (!args.path) throw new Error('Path is required');
        return await fs.readFile(args.path, 'utf-8');

      case 'write_file':
        if (!args.path || args.content === undefined) {
          throw new Error('Path and content are required');
        }
        await fs.writeFile(args.path, args.content, 'utf-8');
        return `File written successfully: ${args.path}`;

      case 'execute_shell':
        if (!args.command) throw new Error('Command is required');
        const { stdout, stderr } = await execAsync(args.command, {
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024,
          timeout: 120_000, // 2 min timeout
        });
        return stdout || stderr || 'Command executed successfully';

      case 'list_directory':
        if (!args.path) throw new Error('Path is required');
        const items = await fs.readdir(args.path, { withFileTypes: true });
        return items
          .map((item: Dirent) => `${item.isDirectory() ? '[DIR]' : '[FILE]'} ${item.name}`)
          .join('\n');

      case 'create_directory':
        if (!args.path) throw new Error('Path is required');
        if (!existsSync(args.path)) {
          await fs.mkdir(args.path, { recursive: true });
          return `Directory created: ${args.path}`;
        }
        return `Directory already exists: ${args.path}`;

      case 'get_background_tasks':
        if (!backgroundManager) {
          throw new Error('Background task manager is not initialized');
        }
        return backgroundManager.getTasksSummary();

      case 'background_task':
        if (!backgroundManager) {
          throw new Error('Background task manager is not initialized');
        }
        if (!args.name || !args.description || !args.task) {
          throw new Error('Name, description and task are required');
        }
        
        // Проверяем лимит задач
        if (!backgroundManager.canStartTask()) {
          const activeTasks = backgroundManager.getActiveTasks();
          throw new Error(
            `Cannot start new task. Maximum concurrent tasks (${backgroundManager.getMaxConcurrentTasks()}) reached. ` +
            `Active tasks: ${activeTasks.map(t => `${t.name} (${t.id})`).join(', ')}. ` +
            `Either wait for tasks to complete or use wait=true.`
          );
        }
        
        const taskId = backgroundManager.createTask(args.name, args.description, args.task);
        
        // Если нужно ждать результат
        if (args.wait === true) {
          logger.info('Waiting for background task completion', { taskId });
          return backgroundManager.waitForTask(taskId);
        }
        
        return `Started: ${taskId}. Result will appear when done. Continue with your response to the user.`;

      case 'wait_for_task':
        if (!backgroundManager) {
          throw new Error('Background task manager is not initialized');
        }
        if (!args.task_id) {
          throw new Error('Task ID is required');
        }
        // Это блокирующая операция - ждем завершения задачи
        return backgroundManager.waitForTask(args.task_id);

      case 'list_skills':
        const skills = skillsManager.listSkills();
        if (skills.length === 0) {
          return 'Нет доступных навыков. Навыки хранятся в ~/.tod/skills/ (глобальные) или .tod/skills/ (проектные).';
        }
        return skills.map(s => `- ${s.name}: ${s.description} ${s.isGlobal ? '(global)' : '(project)'}`).join('\n');

      case 'read_skill':
        if (!args.name) throw new Error('Skill name is required');
        const skill = skillsManager.loadSkill(args.name);
        if (!skill) {
          throw new Error(`Навык "${args.name}" не найден. Используй list_skills чтобы увидеть доступные.`);
        }
        return skill.content;

      default:
        // Check if it's an MCP tool
        if (mcpManager && mcpManager.isMcpTool(toolName)) {
          return mcpManager.callTool(toolName, args as Record<string, unknown>);
        }
        throw new Error(`Unknown tool: ${toolName}`);
    }
  } catch (error) {
    return `Error: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export function isAsyncTool(toolName: string): boolean {
  return toolName === 'wait_for_task' || toolName === 'background_task' || (mcpManager?.isMcpTool(toolName) ?? false);
}

export function formatToolCall(toolName: string, args: ToolArgs): string {
  switch (toolName) {
    case 'read_file':
      return `Read a file "${args.path}"`;
    case 'write_file':
      return `Write a file "${args.path}"`;
    case 'execute_shell':
      return `Execute shell command "${args.command}"`;
    case 'list_directory':
      return `List directory "${args.path}"`;
    case 'create_directory':
      return `Create directory "${args.path}"`;
    case 'get_background_tasks':
      return 'Check background tasks status';
    case 'background_task':
      return `Background task: "${args.name}"` + (args.wait ? ' (waiting for completion)' : '');
    case 'wait_for_task':
      return `Waiting for task: "${args.task_id}"`;
    default:
      if (mcpManager?.isMcpTool(toolName)) {
        const parsed = mcpManager.parseMcpToolName(toolName);
        if (parsed) return `MCP: ${parsed.serverName} → ${parsed.toolName}`;
      }
      return `${toolName}`;
  }
}
