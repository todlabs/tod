import { configService } from "../services/config.js";
import { providers, getProvider } from "../services/providers.js";

export interface Command {
  name: string;
  description: string;
}

export const commands: Command[] = [
  { name: "/provider", description: "Select provider & model" },
  { name: "/providers", description: "Alias for /provider" },
  { name: "/model", description: "Select model" },
  { name: "/models", description: "Alias for /model" },
  { name: "/thinking", description: "Toggle thinking display" },
  { name: "/clear", description: "Clear conversation history" },
  { name: "/compact", description: "Compress context" },
  { name: "/mcp", description: "Show active MCP servers" },
  { name: "/help", description: "Show commands" },
  { name: "/exit", description: "Exit TOD" },
];

export function getCommandSuggestions(input: string): Command[] {
  if (!input.startsWith("/")) return [];
  const term = input.toLowerCase();
  return commands.filter((cmd) => cmd.name.startsWith(term));
}

export function matchCommand(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return null;
  const cmdName = trimmed.split(" ")[0].toLowerCase();
  const match = commands.find((cmd) => cmd.name === cmdName);
  return match ? cmdName : null;
}
