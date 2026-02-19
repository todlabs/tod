import test from 'node:test';
import assert from 'node:assert/strict';
import { BackgroundTaskManager } from '../dist/agent/backgroundManager.js';
import { executeTool } from '../dist/tools/index.js';

test('Bug #3: BackgroundTaskManager enforces concurrency limits', () => {
  const mockConfig = {
    provider: 'openai',
    model: 'gpt-4o',
    apiKey: 'sk-mock-key',
  };
  
  const manager = new BackgroundTaskManager(mockConfig);
  // Set limit to 0 to verify check works immediately without starting tasks
  manager.setMaxConcurrentTasks(0);
  
  assert.throws(() => {
    manager.createTask('test', 'desc', 'task');
  }, /Maximum concurrent tasks/);
});

test('Bug #1: execute_shell runs asynchronously', async () => {
  const resultPromise = executeTool('execute_shell', { command: 'echo verification_success' });
  assert.ok(resultPromise instanceof Promise, 'executeTool should return a Promise');
  const result = await resultPromise;
  assert.match(result, /verification_success/);
});
