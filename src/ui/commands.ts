import { initConfig, configService } from '../services/config.js';
import { providers, getProvider } from '../services/providers.js';
import { skillsManager } from '../services/skills.js';

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
  {
    name: '/skills',
    description: 'List available skills',
    action: () => 'list_skills',
  },
  {
    name: '/skill-off',
    description: 'Deactivate current skill',
    action: () => 'skill_off',
  },
];

// Dynamic skill commands
export function getSkillCommands(): Command[] {
  const skills = skillsManager.listSkills();
  return skills.map(skill => ({
    name: `/${skill.name}`,
    description: skill.description,
    action: () => `skill:${skill.name}`,
  }));
}

export function getCommandSuggestions(input: string): Command[] {
  if (!input.startsWith('/')) return [];

  const searchTerm = input.toLowerCase();
  const builtinCommands = commands.filter(cmd => cmd.name.toLowerCase().startsWith(searchTerm));
  const skillCommands = getSkillCommands().filter(cmd => cmd.name.toLowerCase().startsWith(searchTerm));
  return [...builtinCommands, ...skillCommands];
}

export function isCommand(input: string): boolean {
  if (!input.startsWith('/')) return false;
  const cmdName = input.split(' ')[0];
  const builtinMatch = commands.some(cmd => cmd.name === cmdName);
  const skillMatch = getSkillCommands().some(cmd => cmd.name === cmdName);
  return builtinMatch || skillMatch;
}

export function executeCommand(input: string): string | null {
  const cmdName = input.split(' ')[0];
  const args = input.slice(cmdName.length + 1).trim().split(' ').filter(arg => arg.length > 0);

  // Check builtin commands first
  const builtinCommand = commands.find(cmd => cmd.name === cmdName);
  if (builtinCommand) {
    if (builtinCommand.actionWithArgs && args.length > 0) {
      return builtinCommand.actionWithArgs(args);
    }
    const result = builtinCommand.action();
    return typeof result === 'string' ? result : null;
  }

  // Check skill commands
  const skillCommands = getSkillCommands();
  const skillCommand = skillCommands.find(cmd => cmd.name === cmdName);
  if (skillCommand) {
    const result = skillCommand.action();
    return typeof result === 'string' ? result : null;
  }

  return null;
}
