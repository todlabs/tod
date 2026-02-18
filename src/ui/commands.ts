import { initConfig, configService } from '../services/config.js';
import { providers, getProvider } from '../services/providers.js';

export interface Command {
  name: string;
  description: string;
  action: () => void | string;
  actionWithArgs?: (args: string[]) => string;
}

export const commands: Command[] = [
  {
    name: '/providers',
    description: 'Select provider & model',
    action: () => 'open_provider_menu',
  },
  {
    name: '/models',
    description: 'Select model',
    action: () => 'open_model_menu',
  },
  {
    name: '/thinking',
    description: 'Toggle thinking',
    action: () => 'toggle_thinking',
  },
  {
    name: '/clear',
    description: 'Clear history',
    action: () => 'clear',
  },
  {
    name: '/compact',
    description: 'Compress context',
    action: () => 'compact',
  },
  {
    name: '/tasks',
    description: 'Show background tasks',
    action: () => 'tasks',
  },
  {
    name: '/help',
    description: 'Show commands',
    action: () => 'help',
  },
  {
    name: '/exit',
    description: 'Exit',
    action: () => 'exit',
  },
  {
    name: '/mcp',
    description: 'Show active MCP servers',
    action: () => 'show_mcp',
  },
];

export function getCommandSuggestions(input: string): Command[] {
  if (!input.startsWith('/')) return [];

  const searchTerm = input.toLowerCase();
  return commands.filter(cmd => cmd.name.toLowerCase().startsWith(searchTerm));
}

export function isCommand(input: string): boolean {
  return input.startsWith('/') && commands.some(cmd => {
    const cmdName = input.split(' ')[0];
    return cmd.name === cmdName;
  });
}

export function executeCommand(input: string): string | null {
  const cmdName = input.split(' ')[0];
  const args = input.slice(cmdName.length + 1).trim().split(' ').filter(arg => arg.length > 0);

  const command = commands.find(cmd => cmd.name === cmdName);
  if (!command) return null;

  if (command.actionWithArgs && args.length > 0) {
    return command.actionWithArgs(args);
  }

  const result = command.action();
  return typeof result === 'string' ? result : null;
}
