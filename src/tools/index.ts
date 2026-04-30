import { exec } from "child_process";
import * as util from "util";
import { promises as fs } from "fs";
import { existsSync, type Dirent } from "fs";
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { McpManager } from "../services/mcp-manager.js";
import { logger } from "../services/logger.js";

let mcpManager: McpManager | null = null;

export function setMcpManager(manager: McpManager): void {
  mcpManager = manager;
}

export function getMcpTools(): ChatCompletionTool[] {
  return mcpManager ? mcpManager.getTools() : [];
}

export const tools: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read a file from the filesystem",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path to the file to read" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Write content to a file",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path to the file to write" },
          content: {
            type: "string",
            description: "Content to write to the file",
          },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "execute_shell",
      description: "Execute a shell command and return the output",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "Shell command to execute" },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_directory",
      description: "List files and directories in a given path",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Path to the directory to list",
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_directory",
      description: "Create a new directory",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Path to the directory to create",
          },
        },
        required: ["path"],
      },
    },
  },
];

interface ToolArgs {
  path?: string;
  content?: string;
  command?: string;
}

const execAsync = util.promisify(exec);

export async function executeTool(
  toolName: string,
  args: ToolArgs,
): Promise<string> {
  try {
    switch (toolName) {
      case "read_file":
        if (!args.path) throw new Error("Path is required");
        return await fs.readFile(args.path, "utf-8");

      case "write_file":
        if (!args.path || args.content === undefined) {
          throw new Error("Path and content are required");
        }
        await fs.writeFile(args.path, args.content, "utf-8");
        return `File written successfully: ${args.path}`;

      case "execute_shell":
        if (!args.command) throw new Error("Command is required");
        const { stdout, stderr } = await execAsync(args.command, {
          encoding: "utf-8",
          maxBuffer: 10 * 1024 * 1024,
          timeout: 120_000,
        });
        return stdout || stderr || "Command executed successfully";

      case "list_directory":
        if (!args.path) throw new Error("Path is required");
        const items = await fs.readdir(args.path, { withFileTypes: true });
        return items
          .map(
            (item: Dirent) =>
              `${item.isDirectory() ? "[DIR]" : "[FILE]"} ${item.name}`,
          )
          .join("\n");

      case "create_directory":
        if (!args.path) throw new Error("Path is required");
        if (!existsSync(args.path)) {
          await fs.mkdir(args.path, { recursive: true });
          return `Directory created: ${args.path}`;
        }
        return `Directory already exists: ${args.path}`;

      default:
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
  return mcpManager?.isMcpTool(toolName) ?? false;
}

export function formatToolCall(toolName: string, args: ToolArgs): string {
  switch (toolName) {
    case "read_file":
      return `Read a file "${args.path}"`;
    case "write_file":
      return `Write a file "${args.path}"`;
    case "execute_shell":
      return `Execute shell command "${args.command}"`;
    case "list_directory":
      return `List directory "${args.path}"`;
    case "create_directory":
      return `Create directory "${args.path}"`;
    default:
      if (mcpManager?.isMcpTool(toolName)) {
        const parsed = mcpManager.parseMcpToolName(toolName);
        if (parsed) return `MCP: ${parsed.serverName} → ${parsed.toolName}`;
      }
      return `${toolName}`;
  }
}
