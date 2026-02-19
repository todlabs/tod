import { Agent } from '../core/agent.js';
import type { AgentConfig } from '../core/types.js';
import { logger } from '../services/logger.js';

export interface BackgroundTask {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  activity: string; // текущая активность: Thinking, Reading, Writing, Executing и т.д.
  agent: Agent;
  workingDir: string; // запоминаем путь при создании задачи
  result?: string;
  error?: string;
  startTime?: Date;
  endTime?: Date;
}

export interface WaitForTaskOptions {
  taskId: string;
  onProgress?: (task: BackgroundTask) => void;
}

export type BackgroundTaskCallback = (task: BackgroundTask) => void;
export type TaskResultCallback = (taskId: string, result: string, task: BackgroundTask) => void;

interface TaskResolver {
  resolve: (result: string) => void;
  reject: (error: Error) => void;
}

// Маппинг tool name → человекочитаемая активность
function getActivityFromTool(toolName: string): string {
  if (toolName.startsWith('mcp__')) return 'MCP call';
  switch (toolName) {
    case 'read_file': return 'Reading';
    case 'write_file': return 'Writing';
    case 'execute_shell': return 'Executing';
    case 'list_directory': return 'Exploring';
    case 'create_directory': return 'Creating dir';
    case 'list_skills': return 'Listing skills';
    case 'read_skill': return 'Reading skill';
    default: return toolName;
  }
}

export class BackgroundTaskManager {
  private tasks: Map<string, BackgroundTask> = new Map();
  private callbacks: BackgroundTaskCallback[] = [];
  private resolvers: Map<string, TaskResolver> = new Map();
  private resultCallbacks: TaskResultCallback[] = [];
  private nextTaskId = 1;
  private autoCleanupTimeout = 10000;
  private maxConcurrentTasks = 2;

  constructor(private agentConfig: AgentConfig) {}

  setAutoCleanupTimeout(timeout: number): void {
    this.autoCleanupTimeout = timeout;
  }

  setMaxConcurrentTasks(max: number): void {
    this.maxConcurrentTasks = max;
  }

  getMaxConcurrentTasks(): number {
    return this.maxConcurrentTasks;
  }

  canStartTask(): boolean {
    const activeTasks = this.getActiveTasks();
    return activeTasks.length < this.maxConcurrentTasks;
  }

  onTaskResult(callback: TaskResultCallback): () => void {
    this.resultCallbacks.push(callback);
    return () => {
      const index = this.resultCallbacks.indexOf(callback);
      if (index > -1) {
        this.resultCallbacks.splice(index, 1);
      }
    };
  }

  createTask(name: string, description: string, task: string): string {
    if (!this.canStartTask()) {
      throw new Error(`Cannot start new task. Maximum concurrent tasks (${this.maxConcurrentTasks}) reached.`);
    }

    const taskId = `bg-${this.nextTaskId++}`;

    const agent = new Agent(this.agentConfig);

    const backgroundTask: BackgroundTask = {
      id: taskId,
      name,
      description,
      status: 'pending',
      activity: '',
      agent,
      workingDir: process.cwd(), // запоминаем текущую директорию при создании задачи
    };

    this.tasks.set(taskId, backgroundTask);
    this.notifyCallbacks(backgroundTask);

    this.runTask(taskId, task);

    return taskId;
  }

  cancelTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
      throw new Error(`Task ${taskId} is already ${task.status}`);
    }

    // Останавливаем агент фонового агента через abort()
    task.agent.abort();

    task.status = 'cancelled';
    task.activity = '';
    task.endTime = new Date();

    // Отменяем ожидающие промисы через reject
    const resolver = this.resolvers.get(taskId);
    if (resolver) {
      resolver.reject(new Error(`Task ${taskId} was cancelled`));
      this.resolvers.delete(taskId);
    }

    this.notifyCallbacks(task);

    logger.info('Background task cancelled', { taskId, name: task.name });
  }

  waitForTask(taskId: string, onProgress?: (task: BackgroundTask) => void): Promise<string> {
    return new Promise((resolve, reject) => {
      const task = this.tasks.get(taskId);
      if (!task) {
        reject(new Error(`Task ${taskId} not found`));
        return;
      }

      this.resolvers.set(taskId, { resolve, reject });

      if (task.status === 'completed') {
        if (task.result) {
          resolve(task.result);
          this.resolvers.delete(taskId);
        } else {
          reject(new Error('Task completed but no result available'));
          this.resolvers.delete(taskId);
        }
        return;
      }

      if (task.status === 'failed') {
        reject(new Error(task.error || 'Task failed'));
        this.resolvers.delete(taskId);
        return;
      }

      if (task.status === 'cancelled') {
        reject(new Error(`Task ${taskId} was cancelled`));
        this.resolvers.delete(taskId);
        return;
      }

      const unsubscribe = this.onTaskUpdate((updatedTask) => {
        if (updatedTask.id !== taskId) return;

        if (onProgress) {
          onProgress(updatedTask);
        }

        if (updatedTask.status === 'completed') {
          if (updatedTask.result) {
            resolve(updatedTask.result);
          } else {
            reject(new Error('Task completed but no result available'));
          }
          this.resolvers.delete(taskId);
          unsubscribe();
        } else if (updatedTask.status === 'failed') {
          reject(new Error(updatedTask.error || 'Task failed'));
          this.resolvers.delete(taskId);
          unsubscribe();
        } else if (updatedTask.status === 'cancelled') {
          reject(new Error(`Task ${taskId} was cancelled`));
          this.resolvers.delete(taskId);
          unsubscribe();
        }
      });
    });
  }

  private updateActivity(taskId: string, activity: string): void {
    const task = this.tasks.get(taskId);
    if (task && task.status === 'running') {
      task.activity = activity;
      this.notifyCallbacks(task);
    }
  }

  private async runTask(taskId: string, task: string): Promise<void> {
    const backgroundTask = this.tasks.get(taskId);
    if (!backgroundTask) return;

    backgroundTask.status = 'running';
    backgroundTask.activity = 'Thinking';
    backgroundTask.startTime = new Date();
    this.notifyCallbacks(backgroundTask);

    // Бек-агент получает сфокусированную инструкцию
    const bgPrompt = [
      `You are a background worker agent. Your ONLY job: complete the task and return a concise result.`,
      `Rules:`,
      `- Do NOT use list_skills, read_skill, background_task, or wait_for_task tools`,
      `- Do NOT ask questions or give status updates`,
      `- Just do the task using read_file, write_file, execute_shell, list_directory`,
      `- Return the result as plain text, max 2-3 paragraphs`,
      `- Working directory: ${backgroundTask.workingDir}`,
      ``,
      `TASK: ${task}`,
    ].join('\n');

    try {
      let finalResult = '';

      await backgroundTask.agent.processMessage(
        bgPrompt,
        {
          onChunk: (chunk) => {
            if (chunk.role === 'assistant' && !chunk.isThinking) {
              finalResult += chunk.content;
              this.updateActivity(taskId, 'Thinking');
            } else if (chunk.isThinking) {
              this.updateActivity(taskId, 'Thinking');
            } else if (chunk.role === 'tool') {
              // Tool result arrived — back to thinking
              this.updateActivity(taskId, 'Thinking');
            }
          },
          onToolCall: (toolName) => {
            this.updateActivity(taskId, getActivityFromTool(toolName));
          },
        }
      );

      // Проверяем, что задача не была отменена во время выполнения (статус изменился)
      if (backgroundTask.status !== 'running') {
        return;
      }

      backgroundTask.status = 'completed';
      backgroundTask.activity = '';
      backgroundTask.result = finalResult || 'Task completed';
      backgroundTask.endTime = new Date();

      this.notifyCallbacks(backgroundTask);

      if (finalResult) {
        this.resultCallbacks.forEach(callback => {
          try {
            callback(taskId, finalResult, backgroundTask);
          } catch (error) {
            // silently ignore callback errors
          }
        });
      }

      this.scheduleAutoCleanup(taskId);
    } catch (error) {
      // Проверяем, что это ошибка отмены (AbortError)
      if (error instanceof Error && error.name === 'AbortError') {
        backgroundTask.status = 'cancelled';
        backgroundTask.activity = '';
        backgroundTask.error = 'Task was cancelled';
      } else {
        backgroundTask.status = 'failed';
        backgroundTask.activity = '';
        backgroundTask.error = error instanceof Error ? error.message : String(error);
      }
      backgroundTask.endTime = new Date();

      this.notifyCallbacks(backgroundTask);

      // Если это не отмена и есть waiter - reject его
      const resolver = this.resolvers.get(taskId);
      if (resolver && backgroundTask.status === 'failed') {
        resolver.reject(new Error(backgroundTask.error || 'Task failed'));
        this.resolvers.delete(taskId);
      }

      this.scheduleAutoCleanup(taskId);
    }
  }

  private scheduleAutoCleanup(taskId: string): void {
    setTimeout(() => {
      const task = this.tasks.get(taskId);
      if (task && (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled')) {
        this.tasks.delete(taskId);
        this.resolvers.delete(taskId);
        this.notifyCallbacks({ ...task, status: task.status });
      }
    }, this.autoCleanupTimeout);
  }

  getTask(taskId: string): BackgroundTask | undefined {
    return this.tasks.get(taskId);
  }

  getAllTasks(): BackgroundTask[] {
    return Array.from(this.tasks.values());
  }

  getActiveTasks(): BackgroundTask[] {
    return Array.from(this.tasks.values()).filter(
      (task) => task.status === 'pending' || task.status === 'running'
    );
  }

  getTasksSummary(): string {
    const tasks = this.getAllTasks();
    if (tasks.length === 0) {
      return 'No background tasks running.';
    }

    const activeTasks = this.getActiveTasks();
    const completedTasks = tasks.filter(t => t.status === 'completed');
    const failedTasks = tasks.filter(t => t.status === 'failed');
    const cancelledTasks = tasks.filter(t => t.status === 'cancelled');

    let summary = `Background Tasks (${tasks.length} total, ${activeTasks.length} active, ${completedTasks.length} completed, ${failedTasks.length} failed, ${cancelledTasks.length} cancelled):\n`;

    tasks.forEach(task => {
      const statusIcon = task.status === 'running' ? '>' : task.status === 'completed' ? '+' : task.status === 'cancelled' ? '-' : task.status === 'failed' ? 'x' : 'o';
      const duration = task.startTime ? `${((task.endTime?.getTime() || Date.now()) - task.startTime.getTime()) / 1000}s` : '-';
      summary += `  ${statusIcon} [${task.status.toUpperCase()}] ${task.name} (${task.description}) - Duration: ${duration}\n`;
      if (task.result && task.status === 'completed') {
        summary += `     Result: ${task.result.substring(0, 100)}${task.result.length > 100 ? '...' : ''}\n`;
      }
      if (task.error && task.status === 'failed') {
        summary += `     Error: ${task.error}\n`;
      }
      if (task.status === 'cancelled') {
        summary += `     Task was cancelled\n`;
      }
    });

    summary += `\nAvailable capacity: ${this.maxConcurrentTasks - activeTasks.length}/${this.maxConcurrentTasks} tasks`;

    return summary;
  }

  onTaskUpdate(callback: BackgroundTaskCallback): () => void {
    this.callbacks.push(callback);
    return () => {
      const index = this.callbacks.indexOf(callback);
      if (index > -1) {
        this.callbacks.splice(index, 1);
      }
    };
  }

  private notifyCallbacks(task: BackgroundTask): void {
    this.callbacks.forEach((callback) => callback(task));
  }

  clearCompletedTasks(): void {
    const completedTasks = Array.from(this.tasks.entries())
      .filter(([_, task]) => task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled')
      .map(([id]) => id);

    completedTasks.forEach((id) => {
      this.tasks.delete(id);
      this.resolvers.delete(id);
    });
  }
}
