import { Agent, AgentConfig, AgentMessage } from './index.js';

export interface BackgroundTask {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  agent: Agent;
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

export class BackgroundTaskManager {
  private tasks: Map<string, BackgroundTask> = new Map();
  private callbacks: BackgroundTaskCallback[] = [];
  private resolvers: Map<string, TaskResolver> = new Map();
  private resultCallbacks: TaskResultCallback[] = [];
  private nextTaskId = 1;
  private autoCleanupTimeout = 10000; // 10 секунд по умолчанию
  private maxConcurrentTasks = 2; // Максимум 2 фон задачи одновременно

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

  /**
   * Проверить может ли быть запущена новая задача
   */
  canStartTask(): boolean {
    const activeTasks = this.getActiveTasks();
    return activeTasks.length < this.maxConcurrentTasks;
  }

  /**
   * Подписаться на результаты завершенных задач
   * Используется для автоматического уведомления основного агента
   */
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
    const taskId = `bg-${this.nextTaskId++}`;
    
    const agent = new Agent(this.agentConfig);
    
    const backgroundTask: BackgroundTask = {
      id: taskId,
      name,
      description,
      status: 'pending',
      agent,
    };

    this.tasks.set(taskId, backgroundTask);
    this.notifyCallbacks(backgroundTask);

    // Запускаем задачу асинхронно
    this.runTask(taskId, task);

    return taskId;
  }

  /**
   * Ждет завершения фоновой задачи
   * @param taskId ID задачи
   * @param onProgress Callback для обновлений статуса
   * @returns Promise с результатом задачи
   */
  waitForTask(taskId: string, onProgress?: (task: BackgroundTask) => void): Promise<string> {
    return new Promise((resolve, reject) => {
      // Проверяем текущий статус задачи
      const task = this.tasks.get(taskId);
      if (!task) {
        reject(new Error(`Task ${taskId} not found`));
        return;
      }

      // Сохраняем resolvers для последующего вызова
      this.resolvers.set(taskId, { resolve, reject });

      // Если задача уже завершена
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

      // Подписываемся на обновления задачи
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
        }
      });
    });
  }

  private async runTask(taskId: string, task: string): Promise<void> {
    const backgroundTask = this.tasks.get(taskId);
    if (!backgroundTask) return;

    backgroundTask.status = 'running';
    backgroundTask.startTime = new Date();
    this.notifyCallbacks(backgroundTask);

    try {
      let finalResult = '';

      await backgroundTask.agent.processMessage(
        task,
        {
          onChunk: (chunk) => {
            // Собираем только финальный ответ ассистента
            if (chunk.role === 'assistant' && !chunk.isThinking) {
              finalResult += chunk.content;
            }
          },
          onToolCall: () => {
            // Tool calls - можем игнорировать или логировать
          },
        }
      );

      backgroundTask.status = 'completed';
      backgroundTask.result = finalResult || 'Task completed';
      backgroundTask.endTime = new Date();
      
      this.notifyCallbacks(backgroundTask);
      
      // Уведомляем всех кто ждет результата
      if (finalResult) {
        this.resultCallbacks.forEach(callback => {
          try {
            callback(taskId, finalResult, backgroundTask);
          } catch (error) {
            console.error('Error in result callback:', error);
          }
        });
      }
      
      // Автоматически удаляем задачу через заданное время
      this.scheduleAutoCleanup(taskId);
    } catch (error) {
      backgroundTask.status = 'failed';
      backgroundTask.error = error instanceof Error ? error.message : String(error);
      backgroundTask.endTime = new Date();
      
      this.notifyCallbacks(backgroundTask);
      
      // Автоматически удаляем задачу через заданное время
      this.scheduleAutoCleanup(taskId);
    }
  }

  private scheduleAutoCleanup(taskId: string): void {
    setTimeout(() => {
      const task = this.tasks.get(taskId);
      if (task && (task.status === 'completed' || task.status === 'failed')) {
        this.tasks.delete(taskId);
        this.resolvers.delete(taskId);
        this.notifyCallbacks({ ...task, status: task.status }); // Уведомляем об удалении
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

  /**
   * Получить информацию о задачах в удобном для агента формате
   */
  getTasksSummary(): string {
    const tasks = this.getAllTasks();
    if (tasks.length === 0) {
      return 'No background tasks running.';
    }

    const activeTasks = this.getActiveTasks();
    const completedTasks = tasks.filter(t => t.status === 'completed');
    const failedTasks = tasks.filter(t => t.status === 'failed');

    let summary = `Background Tasks (${tasks.length} total, ${activeTasks.length} active, ${completedTasks.length} completed, ${failedTasks.length} failed):\n`;
    
    tasks.forEach(task => {
      const statusIcon = task.status === 'running' ? '⚡' : task.status === 'completed' ? '✓' : task.status === 'failed' ? '✗' : '○';
      const duration = task.startTime ? `${((task.endTime?.getTime() || Date.now()) - task.startTime.getTime()) / 1000}s` : '-';
      summary += `  ${statusIcon} [${task.status}] ${task.name} (${task.description}) - Duration: ${duration}\n`;
      if (task.result && task.status === 'completed') {
        summary += `     Result: ${task.result.substring(0, 100)}${task.result.length > 100 ? '...' : ''}\n`;
      }
      if (task.error && task.status === 'failed') {
        summary += `     Error: ${task.error}\n`;
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
      .filter(([_, task]) => task.status === 'completed' || task.status === 'failed')
      .map(([id]) => id);

    completedTasks.forEach((id) => {
      this.tasks.delete(id);
      this.resolvers.delete(id);
    });
  }
}
