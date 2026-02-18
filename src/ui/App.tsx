import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { readdirSync } from 'fs';
import { join } from 'path';
import { Agent, type AgentMessage } from '../agent/index.js';
import { BackgroundTaskManager, type BackgroundTask } from '../agent/backgroundManager.js';
import { configService } from '../services/config.js';
import { providers, getProvider, type Provider, type ModelInfo } from '../services/providers.js';
import type { McpManager } from '../services/mcp-manager.js';
import { logger } from '../services/logger.js';
import Header from './components/Header.js';
import MessageList from './components/MessageList.js';
import InputArea from './components/InputArea.js';
import StatusBar from './components/StatusBar.js';
import { useMessageProcessing } from './hooks/useMessageProcessing.js';
import { executeCommand, commands, getCommandSuggestions } from './commands.js';
import { skillsManager } from '../services/skills.js';
import WorkingIndicator from './WorkingIndicator.js';

function setTitle(title: string) {
  process.stdout.write(`\x1b]0;${title}\x07`);
}

interface AppProps {
  agent: Agent;
  backgroundManager: BackgroundTaskManager;
  mcpManager?: McpManager;
  version: string;
}

type SuggestionItem =
  | { type: 'command'; name: string; description: string }
  | { type: 'file'; path: string; isDir: boolean; label: string };

// --- Interactive menu types ---
type MenuMode =
  | null
  | { type: 'provider-select' }
  | { type: 'provider-apikey'; provider: Provider }
  | { type: 'model-select'; provider: Provider };

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.next', '__pycache__', '.cache', 'coverage', 'build']);

function searchRecursive(query: string, dir: string, depth: number, results: SuggestionItem[]): void {
  if (depth > 4 || results.length >= 8) return;
  try {
    const items = readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      if (results.length >= 8) break;
      if (item.isDirectory() && SKIP_DIRS.has(item.name)) continue;
      const fullPath = dir === '.' ? item.name : `${dir}/${item.name}`;
      if (item.name.toLowerCase().includes(query.toLowerCase())) {
        const isDir = item.isDirectory();
        results.push({
          type: 'file' as const,
          path: isDir ? fullPath + '/' : fullPath,
          isDir,
          label: isDir ? fullPath + '/' : fullPath,
        });
      }
      if (item.isDirectory()) {
        searchRecursive(query, fullPath, depth + 1, results);
      }
    }
  } catch {}
}

function getFileSuggestions(query: string): SuggestionItem[] {
  if (query.includes('/')) {
    try {
      const parts = query.split('/');
      const prefix = parts[parts.length - 1].toLowerCase();
      const dir = parts.slice(0, -1).join('/') || '.';
      const items = readdirSync(dir, { withFileTypes: true });
      return items
        .filter(item => item.name.toLowerCase().startsWith(prefix))
        .slice(0, 8)
        .map(item => {
          const fullPath = dir === '.' ? item.name : `${dir}/${item.name}`;
          const isDir = item.isDirectory();
          return { type: 'file' as const, path: isDir ? fullPath + '/' : fullPath, isDir, label: isDir ? fullPath + '/' : fullPath };
        });
    } catch {
      return [];
    }
  }

  if (query === '') {
    try {
      const items = readdirSync('.', { withFileTypes: true });
      return items
        .filter(item => !SKIP_DIRS.has(item.name))
        .slice(0, 8)
        .map(item => {
          const isDir = item.isDirectory();
          return { type: 'file' as const, path: isDir ? item.name + '/' : item.name, isDir, label: isDir ? item.name + '/' : item.name };
        });
    } catch {
      return [];
    }
  }

  const results: SuggestionItem[] = [];
  searchRecursive(query, '.', 0, results);
  return results;
}

function getAtMention(input: string): { query: string; atIndex: number } | null {
  const match = input.match(/@([^\s]*)$/);
  if (!match) return null;
  return { query: match[1], atIndex: match.index! };
}

function applyFileSuggestion(input: string, selectedPath: string): string {
  const atIndex = input.lastIndexOf('@');
  if (atIndex === -1) return input;
  const before = input.slice(0, atIndex);
  const rest = input.slice(atIndex);
  const replaced = rest.replace(/@[^\s]*/, `@${selectedPath}`);
  return before + replaced;
}

// ========== Interactive Provider/Model Menu ==========

function ProviderMenu({ menu, selectedIndex, apikeyInput }: {
  menu: MenuMode;
  selectedIndex: number;
  apikeyInput: string;
}) {
  if (!menu) return null;

  if (menu.type === 'provider-select') {
    const currentProvider = configService.getProvider();
    return (
      <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor="cyan" paddingX={2} paddingY={1}>
        <Text bold color="cyan">  Select Provider</Text>
        <Text color="gray" dimColor>  ─────────────────────</Text>
        {providers.map((p, idx) => {
          const isSelected = idx === selectedIndex;
          const isCurrent = p.id === currentProvider;
          return (
            <Box key={p.id}>
              <Text color={isSelected ? 'black' : 'cyan'} backgroundColor={isSelected ? 'cyan' : undefined}>
                {isSelected ? ' > ' : '   '}
              </Text>
              <Text bold={isSelected} color={isSelected ? 'black' : 'white'} backgroundColor={isSelected ? 'cyan' : undefined}>
                {p.name.padEnd(16)}
              </Text>
              <Text color={isSelected ? 'black' : 'gray'} backgroundColor={isSelected ? 'cyan' : undefined} dimColor={!isSelected}>
                {' '}{p.baseURL}
              </Text>
              {isCurrent && (
                <Text color={isSelected ? 'black' : 'green'} backgroundColor={isSelected ? 'cyan' : undefined}>
                  {' '} current
                </Text>
              )}
            </Box>
          );
        })}
        <Text color="gray" dimColor>{'\n'}  ↑↓ navigate  Enter select  Esc cancel</Text>
      </Box>
    );
  }

  if (menu.type === 'provider-apikey') {
    const keyPreview = configService.getProviderKey(menu.provider.id) || '';
    const hasKey = keyPreview && keyPreview.length > 3;
    return (
      <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor="cyan" paddingX={2} paddingY={1}>
        <Text bold color="cyan">  API Key for {menu.provider.name}</Text>
        <Text color="gray" dimColor>  ─────────────────────</Text>
        {hasKey && (
          <Text color="gray">  Current: {keyPreview.slice(0, 10)}...{keyPreview.slice(-4)}</Text>
        )}
        <Box marginTop={1}>
          <Text color="cyan">  Key: </Text>
          <Text>{apikeyInput || ''}</Text>
          <Text color="gray">█</Text>
        </Box>
        <Text color="gray" dimColor>{'\n'}  Enter confirm  Esc skip (keep current)</Text>
      </Box>
    );
  }

  if (menu.type === 'model-select') {
    const currentModel = configService.getModel();
    const models = menu.provider.models;
    return (
      <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor="cyan" paddingX={2} paddingY={1}>
        <Text bold color="cyan">  Select Model — {menu.provider.name}</Text>
        <Text color="gray" dimColor>  ─────────────────────</Text>
        {models.map((m, idx) => {
          const isSelected = idx === selectedIndex;
          const isCurrent = m.id === currentModel;
          return (
            <Box key={m.id}>
              <Text color={isSelected ? 'black' : 'cyan'} backgroundColor={isSelected ? 'cyan' : undefined}>
                {isSelected ? ' > ' : '   '}
              </Text>
              <Text bold={isSelected} color={isSelected ? 'black' : 'white'} backgroundColor={isSelected ? 'cyan' : undefined}>
                {m.name.padEnd(24)}
              </Text>
              <Text color={isSelected ? 'black' : 'gray'} backgroundColor={isSelected ? 'cyan' : undefined} dimColor={!isSelected}>
                {' '}{m.description}
              </Text>
              {isCurrent && (
                <Text color={isSelected ? 'black' : 'green'} backgroundColor={isSelected ? 'cyan' : undefined}>
                  {' '} current
                </Text>
              )}
            </Box>
          );
        })}
        <Text color="gray" dimColor>{'\n'}  ↑↓ navigate  Enter select  Esc cancel</Text>
      </Box>
    );
  }

  return null;
}

// ========== Main App ==========

export default function App({ agent, backgroundManager, mcpManager, version }: AppProps) {
  const [input, setInput] = useState('');
  const [showThinking, setShowThinking] = useState(true);
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const [tokensUsed, setTokensUsed] = useState(0);
  const [backgroundTasks, setBackgroundTasks] = useState<BackgroundTask[]>([]);
  const [currentDir, setCurrentDir] = useState('');

  // Interactive menu state
  const [menu, setMenu] = useState<MenuMode>(null);
  const [menuIndex, setMenuIndex] = useState(0);
  const [apikeyInput, setApikeyInput] = useState('');

  const {
    messages,
    currentThinking,
    isProcessing,
    processMessage,
    stopProcessing,
    resetMessages,
    addMessage,
  } = useMessageProcessing(agent);

  useEffect(() => {
    setCurrentDir(process.cwd());
    setTitle('TOD');
    return () => setTitle('TOD');
  }, []);

  useEffect(() => {
    const totalTokens = messages.reduce((acc, msg) => acc + msg.content.length, 0);
    setTokensUsed(Math.round(totalTokens / 4));
  }, [messages]);

  useEffect(() => {
    if (isProcessing) {
      const lastUser = [...messages].reverse().find(m => m.role === 'user');
      const preview = lastUser
        ? lastUser.content.slice(0, 40).replace(/\n/g, ' ')
        : 'thinking';
      setTitle(`TOD ◆ ${preview}`);
    } else {
      const lastUser = [...messages].reverse().find(m => m.role === 'user');
      if (lastUser) {
        const preview = lastUser.content.slice(0, 50).replace(/\n/g, ' ');
        setTitle(`TOD — ${preview}`);
      } else {
        setTitle('TOD');
      }
    }
  }, [isProcessing, messages]);

  useEffect(() => {
    setSelectedSuggestionIndex(-1);

    if (menu) {
      setSuggestions([]);
      return;
    }

    if (!input.startsWith('/') && !getAtMention(input)) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(() => {
      if (input.startsWith('/')) {
        const cmds = getCommandSuggestions(input);
        setSuggestions(cmds.map(c => ({ type: 'command', name: c.name, description: c.description })));
        return;
      }
      const mention = getAtMention(input);
      if (mention) {
        setSuggestions(getFileSuggestions(mention.query));
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [input, menu]);

  useEffect(() => {
    const unsubscribe = backgroundManager.onTaskResult((taskId, result, task) => {
      const preview = result ? `: ${result.substring(0, 200)}` : '';
      addMessage({
        role: 'assistant',
        content: `✓ Background task "${task.name}" completed${preview}`,
      });
      agent.handleBackgroundTaskResult(taskId, result);
      if (!agent.isBusy()) {
        const tasksSummary = backgroundManager.getTasksSummary();
        agent.updateBackgroundTasksContext(tasksSummary);
      }
    });
    return () => { unsubscribe && unsubscribe(); };
  }, [backgroundManager, agent, addMessage]);

  useEffect(() => {
    const unsubscribe = backgroundManager.onTaskUpdate(() => {
      setBackgroundTasks(backgroundManager.getAllTasks());
    });
    return () => { unsubscribe && unsubscribe(); };
  }, [backgroundManager]);

  const hasSuggestionSelected = selectedSuggestionIndex >= 0;
  const hasSuggestions = suggestions.length > 0;

  function completeSuggestion(idx: number) {
    const item = suggestions[idx];
    if (!item) return;
    if (item.type === 'command') {
      setInput(item.name + ' ');
    } else {
      setInput(applyFileSuggestion(input, item.path));
    }
    setSuggestions([]);
    setSelectedSuggestionIndex(-1);
  }

  // --- Menu: select provider -> apikey -> model -> apply ---
  function openProviderMenu() {
    setMenu({ type: 'provider-select' });
    setMenuIndex(0);
    setApikeyInput('');
  }

  function selectProvider(provider: Provider) {
    setMenu({ type: 'provider-apikey', provider });
    setApikeyInput('');
  }

  function confirmApiKey(provider: Provider) {
    const key = apikeyInput.trim() || undefined;
    configService.setProvider(provider.id, key);
    setMenu({ type: 'model-select', provider });
    setMenuIndex(0);
  }

  function selectModel(provider: Provider, model: ModelInfo) {
    configService.setModel(model.id);
    const newConfig = configService.getConfig();
    agent.updateConfig(newConfig);
    setMenu(null);
    addSystemMessage(`${provider.name} → ${model.name}`);
  }

  function closeMenu() {
    setMenu(null);
    setMenuIndex(0);
    setApikeyInput('');
  }

  // --- Menu keyboard handling ---
  useInput((inputChar, key) => {
    // Menu mode takes priority
    if (menu) {
      if (key.escape) {
        // Esc in apikey -> skip to model select
        if (menu.type === 'provider-apikey') {
          configService.setProvider(menu.provider.id);
          setMenu({ type: 'model-select', provider: menu.provider });
          setMenuIndex(0);
          return;
        }
        closeMenu();
        return;
      }

      if (menu.type === 'provider-select') {
        if (key.downArrow) {
          setMenuIndex(prev => Math.min(prev + 1, providers.length - 1));
          return;
        }
        if (key.upArrow) {
          setMenuIndex(prev => Math.max(prev - 1, 0));
          return;
        }
        if (key.return) {
          selectProvider(providers[menuIndex]);
          return;
        }
        return;
      }

      if (menu.type === 'provider-apikey') {
        if (key.return) {
          confirmApiKey(menu.provider);
          return;
        }
        if (key.backspace || key.delete) {
          setApikeyInput(prev => prev.slice(0, -1));
          return;
        }
        if (inputChar && !key.ctrl && !key.meta) {
          setApikeyInput(prev => prev + inputChar);
          return;
        }
        return;
      }

      if (menu.type === 'model-select') {
        const models = menu.provider.models;
        if (key.downArrow) {
          setMenuIndex(prev => Math.min(prev + 1, models.length - 1));
          return;
        }
        if (key.upArrow) {
          setMenuIndex(prev => Math.max(prev - 1, 0));
          return;
        }
        if (key.return) {
          selectModel(menu.provider, models[menuIndex]);
          return;
        }
        return;
      }

      return;
    }

    // Normal mode
    if (key.escape && isProcessing) {
      stopProcessing();
      return;
    }

    if (hasSuggestions && !isProcessing) {
      if (key.downArrow) {
        setSelectedSuggestionIndex(prev => Math.min(prev + 1, suggestions.length - 1));
        return;
      }
      if (key.upArrow) {
        setSelectedSuggestionIndex(prev => Math.max(prev - 1, -1));
        return;
      }
      if (key.tab) {
        completeSuggestion(selectedSuggestionIndex >= 0 ? selectedSuggestionIndex : 0);
        return;
      }
      if (key.return && hasSuggestionSelected) {
        completeSuggestion(selectedSuggestionIndex);
        return;
      }
    }
  });

  const handlePreprocess = async () => {
    const tasksSummary = backgroundManager.getTasksSummary();
    await agent.updateBackgroundTasksContext(tasksSummary);
  };

  const handleSubmit = async (value: string) => {
    if (menu) return; // block input while menu is open
    setInput('');
    if (value.startsWith('/')) {
      await handleCommand(value);
      return;
    }
    await handlePreprocess();
    await processMessage(value);
  };

  const handleCommand = async (command: string) => {
    const cmdName = command.split(' ')[0];

    const cmdResult = executeCommand(command);

    if (cmdResult === 'open_provider_menu') {
      openProviderMenu();
      return;
    }
    if (cmdResult === 'open_model_menu') {
      const providerId = configService.getProvider() || 'nvidia';
      const provider = getProvider(providerId);
      if (provider) {
        setMenu({ type: 'model-select', provider });
        setMenuIndex(0);
      }
      return;
    }
    if (cmdResult === 'toggle_thinking') {
      setShowThinking(!showThinking);
      addSystemMessage(`Thinking display ${!showThinking ? 'enabled' : 'disabled'}`);
      return;
    }
    if (cmdResult === 'clear') { 
      process.stdout.write('\x1b[2J\x1b[3J\x1b[H');
      resetMessages(); 
      return; 
    }
    if (cmdResult === 'compact') { await handleCompactContext(); return; }
    if (cmdResult === 'help') {
      const helpText = commands.map(cmd => `  ${cmd.name.padEnd(20)} ${cmd.description}`).join('\n');
      addSystemMessage(`Commands:\n\n${helpText}\n\nType / for commands, @ for files`);
      return;
    }
    if (cmdResult === 'exit') { process.exit(0); }
    if (cmdResult === 'tasks') { handleListTasks(); return; }
    if (cmdResult === 'show_mcp') { handleShowMcp(); return; }
    if (cmdResult === 'list_skills') { handleListSkills(); return; }
    if (cmdResult === 'skill_off') { handleSkillOff(); return; }
    if (cmdResult?.startsWith('skill:')) {
      const skillData = cmdResult.replace('skill:', '');
      const colonIndex = skillData.indexOf(':');
      let skillName: string;
      let skillMessage: string | null = null;
      
      if (colonIndex > 0) {
        skillName = skillData.substring(0, colonIndex);
        skillMessage = skillData.substring(colonIndex + 1);
      } else {
        skillName = skillData;
      }
      
      await handleSkill(skillName, skillMessage);
      return;
    }
    if (cmdResult && typeof cmdResult === 'string') {
      addSystemMessage(cmdResult);
      return;
    }
  };

  const handleListSkills = () => {
    const help = skillsManager.getSkillHelp();
    addSystemMessage(help);
  };

  const handleSkill = async (skillName: string, message?: string | null) => {
    const skill = skillsManager.loadSkill(skillName);
    const skillDesc = skill ? skill.description : 'Custom skill';
    const location = skill?.isGlobal ? 'global' : 'project';
    const locationPath = skill?.isGlobal ? '~/.tod/skills/' : '.tod/skills/';
    
    // Минималистичное сообщение в стиле терминала
    addSystemMessage(`[skill] /${skillName} activated (${location})\n  ${skillDesc}\n  ${locationPath}${skillName}/`);
    
    // Если есть сообщение после имени скилла - сразу обрабатываем
    if (message && message.trim()) {
      await handlePreprocess();
      await processMessage(message.trim());
    }
  };

  const handleSkillOff = () => {
    addSystemMessage('Skill mode deactivated.');
  };

  const handleCompactContext = async () => {
    addSystemMessage('Compacting context...');
    try {
      const result = await agent.compactContext();
      resetMessages();
      addMessage({
        role: 'assistant',
        content: `Context compacted!\nOld: ${result.oldTokens} tokens → New: ${result.newTokens} tokens (saved ${Math.round(((result.oldTokens - result.newTokens) / result.oldTokens) * 100)}%)`,
      });
    } catch (error) {
      addSystemMessage(`Failed to compact: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleListTasks = () => {
    const tasks = backgroundManager.getAllTasks();
    addSystemMessage(tasks.length === 0 ? 'No background tasks' : backgroundManager.getTasksSummary());
  };

  const handleShowMcp = () => {
    if (!mcpManager) {
      addSystemMessage('MCP manager is not initialized');
      return;
    }
    const statuses = mcpManager.getStatus();
    if (statuses.length === 0) {
      addSystemMessage('No MCP servers configured');
      return;
    }
    const lines: string[] = ['MCP Servers:'];
    for (const s of statuses) {
      const statusIcon = s.status === 'connected' ? '●' : s.status === 'error' ? '✗' : '○';
      const statusColor = s.status === 'connected' ? 'green' : s.status === 'error' ? 'red' : 'yellow';
      lines.push(`  ${statusIcon} ${s.name.padEnd(20)} ${s.status} (${s.toolCount} tools)`);
      if (s.error) {
        lines.push(`      Error: ${s.error}`);
      }
    }
    addSystemMessage(lines.join('\n'));
  };

  const addSystemMessage = (content: string) => {
    addMessage({ role: 'assistant', content });
  };

  const modelName = configService.getModel();

  return (
    <Box flexDirection="column" padding={1}>
      <Header version={version} currentDir={currentDir} />

      <MessageList messages={messages} thinking={currentThinking} showThinking={showThinking} />

      {backgroundTasks.length > 0 && <BackgroundTasksList tasks={backgroundTasks} />}

      {/* Interactive provider/model menu */}
      <ProviderMenu menu={menu} selectedIndex={menuIndex} apikeyInput={apikeyInput} />

      {hasSuggestions && !menu && (
        <Box flexDirection="column" marginTop={1} marginBottom={0}>
          {suggestions.map((item, idx) => {
            const isSelected = idx === selectedSuggestionIndex;
            const bg = isSelected ? 'cyan' : undefined;
            const fg = isSelected ? 'black' : undefined;

            if (item.type === 'command') {
              return (
                <Box key={idx}>
                  <Text color={isSelected ? 'black' : 'cyan'} backgroundColor={bg}>
                    {isSelected ? ' ▶ ' : '   '}
                    {item.name.padEnd(16)}
                  </Text>
                  <Text color={isSelected ? 'black' : 'gray'} backgroundColor={bg} dimColor={!isSelected}>
                    {' '}{item.description}
                  </Text>
                </Box>
              );
            } else {
              return (
                <Box key={idx}>
                  <Text color={isSelected ? 'black' : 'gray'} backgroundColor={bg}>
                    {isSelected ? ' ▶ ' : '   '}
                  </Text>
                  <Text color={isSelected ? 'black' : (item.isDir ? 'yellow' : 'white')} backgroundColor={bg}>
                    {item.isDir ? 'dir  ' : 'file '}
                  </Text>
                  <Text color={isSelected ? 'black' : 'white'} backgroundColor={bg}>
                    {item.label}
                  </Text>
                </Box>
              );
            }
          })}
          <Text color="gray" dimColor>   ↑↓ navigate  Tab/Enter complete  Esc cancel</Text>
        </Box>
      )}

      {isProcessing && (
        <Box marginTop={1}>
          <WorkingIndicator />
        </Box>
      )}

      <InputArea
        value={input}
        onChange={menu ? () => {} : setInput}
        onSubmit={handleSubmit}
        isProcessing={isProcessing || !!menu}
        blockReturn={hasSuggestionSelected || !!menu}
      />

      <StatusBar modelName={modelName} isProcessing={isProcessing} tokensUsed={tokensUsed} mcpStatus={mcpManager?.getStatusSummary()} />

    </Box>
  );
}

function BackgroundTasksList({ tasks }: { tasks: BackgroundTask[] }) {
  const [spinnerIndex, setSpinnerIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setSpinnerIndex(prev => (prev + 1) % 4), 100);
    return () => clearInterval(interval);
  }, []);

  const spinnerChars = ['⠋', '⠙', '⠹', '⠸'];
  const spinner = spinnerChars[spinnerIndex];

  return (
    <Box marginTop={1} flexDirection="column">
      <Text color="gray">Background tasks:</Text>
      {tasks.slice(-3).map(task => (
        <Box key={task.id}>
          <Text color={
            task.status === 'running' ? 'cyan' :
            task.status === 'completed' ? 'green' :
            task.status === 'failed' ? 'red' : 'gray'
          }>
            {task.status === 'running' && <Text>{spinner} </Text>}
            [{task.status}] <Text bold>{task.name}</Text>
            {task.status === 'running' && <Text dimColor> - {task.description}</Text>}
          </Text>
        </Box>
      ))}
    </Box>
  );
}
