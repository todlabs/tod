import { configService } from "../services/config.js";
import { providers, getProvider } from "../services/providers.js";
import { discoverSkills } from "../services/skills.js";

export interface Command {
  name: string;
  description: string;
  aliases?: string[];
}

const builtInCommands: Command[] = [
  { name: "/provider", description: "Select provider & model", aliases: ["/providers"] },
  { name: "/model", description: "Select model", aliases: ["/models"] },
  { name: "/thinking", description: "Toggle thinking display" },
  { name: "/settings", description: "UI and behavior settings" },
  { name: "/clear", description: "Clear conversation history", aliases: ["/new"] },
  { name: "/compact", description: "Compress context" },
  { name: "/resume", description: "Resume or list saved chats" },
  { name: "/init", description: "Create AGENTS.md in project root" },
  { name: "/skill", description: "Create or list skills" },
  { name: "/remember", description: "Save a note to project memory" },
  { name: "/mcp", description: "Show active MCP servers" },
  { name: "/help", description: "Show commands" },
  { name: "/exit", description: "Exit TOD" },
];

export function getCommands(cwd?: string): Command[] {
  const all = [...builtInCommands];
  if (cwd) {
    const skills = discoverSkills(cwd);
    for (const skill of skills) {
      all.push({
        name: `/${skill.name}`,
        description: skill.description,
      });
    }
  }
  return all;
}

// Lazy alias map — rebuilt when needed
function buildAliasMap(cmds: Command[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const cmd of cmds) {
    if (cmd.aliases) {
      for (const alias of cmd.aliases) {
        map.set(alias, cmd.name);
      }
    }
  }
  return map;
}

export function getCommandSuggestions(input: string, cwd?: string): Command[] {
  if (!input.startsWith("/")) return [];
  const cmds = getCommands(cwd);
  const term = input.toLowerCase();
  return cmds.filter((cmd) => {
    if (cmd.name.startsWith(term)) return true;
    if (cmd.aliases) return cmd.aliases.some((a) => a.startsWith(term));
    return false;
  });
}

export function matchCommand(input: string, cwd?: string): string | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return null;
  const cmdName = trimmed.split(" ")[0].toLowerCase();
  const cmds = getCommands(cwd);
  const aliasMap = buildAliasMap(cmds);
  // Resolve alias
  const resolved = aliasMap.get(cmdName);
  if (resolved) return resolved;
  const match = cmds.find((cmd) => cmd.name === cmdName);
  return match ? cmdName : null;
}

export function formatCommandName(cmd: Command): string {
  if (cmd.aliases && cmd.aliases.length > 0) {
    return `${cmd.name} ~ ${cmd.aliases.join(", ")}`;
  }
  return cmd.name;
}
