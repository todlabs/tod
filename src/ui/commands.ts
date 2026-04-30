import { configService } from "../services/config.js";
import { providers, getProvider } from "../services/providers.js";

export interface Command {
  name: string;
  description: string;
  aliases?: string[];
}

export const commands: Command[] = [
  { name: "/provider", description: "Select provider & model", aliases: ["/providers"] },
  { name: "/model", description: "Select model", aliases: ["/models"] },
  { name: "/thinking", description: "Toggle thinking display" },
  { name: "/clear", description: "Clear conversation history", aliases: ["/new"] },
  { name: "/compact", description: "Compress context" },
  { name: "/resume", description: "Resume or list saved chats" },
  { name: "/mcp", description: "Show active MCP servers" },
  { name: "/help", description: "Show commands" },
  { name: "/exit", description: "Exit TOD" },
];

function buildAliasMap(): Map<string, string> {
  const map = new Map<string, string>();
  for (const cmd of commands) {
    if (cmd.aliases) {
      for (const alias of cmd.aliases) {
        map.set(alias, cmd.name);
      }
    }
  }
  return map;
}

const aliasMap = buildAliasMap();

export function getCommandSuggestions(input: string): Command[] {
  if (!input.startsWith("/")) return [];
  const term = input.toLowerCase();
  return commands.filter((cmd) => {
    if (cmd.name.startsWith(term)) return true;
    if (cmd.aliases) return cmd.aliases.some((a) => a.startsWith(term));
    return false;
  });
}

export function matchCommand(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return null;
  const cmdName = trimmed.split(" ")[0].toLowerCase();
  // Resolve alias
  const resolved = aliasMap.get(cmdName);
  if (resolved) return resolved;
  const match = commands.find((cmd) => cmd.name === cmdName);
  return match ? cmdName : null;
}

export function formatCommandName(cmd: Command): string {
  if (cmd.aliases && cmd.aliases.length > 0) {
    return `${cmd.name} ~ ${cmd.aliases.join(", ")}`;
  }
  return cmd.name;
}
