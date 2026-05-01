import { exec } from "child_process";
import * as util from "util";
import { promises as fs, mkdirSync, appendFileSync, readFileSync } from "fs";
import { existsSync, type Dirent } from "fs";
import * as path from "path";
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { McpManager } from "../services/mcp-manager.js";
import { logger } from "../services/logger.js";
import { getMemoryPath, findProjectRoot } from "../prompts/system.js";
import { getSkillByName } from "../services/skills.js";
import type { DiffLine, DiffResult } from "../core/types.js";

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
  {
    type: "function",
    function: {
      name: "remember",
      description: "Save a note to project memory. Persists across sessions. Use when the user asks to remember something or when you discover important project facts.",
      parameters: {
        type: "object",
        properties: {
          content: {
            type: "string",
            description: "The note to save to project memory",
          },
        },
        required: ["content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "load_skill",
      description: "Load a skill by name, or list all available skills. Skills contain project-specific instructions (code style, conventions, workflows, checklists). Call without arguments to see what skills are available, then load the relevant one before starting a task that matches its description.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Skill name (without / prefix). Leave empty to list all available skills.",
          },
        },
        required: [],
      },
    },
  },
];

interface ToolArgs {
  path?: string;
  content?: string;
  command?: string;
  name?: string;
}

const execAsync = util.promisify(exec);

const CONTEXT_LINES = 3;

export function computeDiff(
  oldLines: string[],
  newLines: string[],
  filePath: string,
  isNewFile: boolean,
): DiffResult {
  const m = oldLines.length;
  const n = newLines.length;

  // LCS via DP — O(m*n) space, fine for typical source files
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to find diff
  const raw: DiffLine[] = [];
  let i = m,
    j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      raw.push({
        type: "context",
        oldLineNo: i,
        newLineNo: j,
        content: oldLines[i - 1],
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      raw.push({ type: "add", newLineNo: j, content: newLines[j - 1] });
      j--;
    } else {
      raw.push({ type: "remove", oldLineNo: i, content: oldLines[i - 1] });
      i--;
    }
  }
  raw.reverse();

  // Collapse: only keep CONTEXT_LINES around changes
  const isChange = raw.map((l) => l.type !== "context");
  const keep = raw.map(() => false);
  for (let k = 0; k < raw.length; k++) {
    if (!isChange[k]) continue;
    const lo = Math.max(0, k - CONTEXT_LINES);
    const hi = Math.min(raw.length - 1, k + CONTEXT_LINES);
    for (let c = lo; c <= hi; c++) keep[c] = true;
  }

  const lines: DiffLine[] = [];
  let lastKept = -1;
  for (let k = 0; k < raw.length; k++) {
    if (keep[k]) {
      if (lastKept !== -1 && k - lastKept > 1) {
        lines.push({ type: "context", content: "..." });
      }
      lines.push(raw[k]);
      lastKept = k;
    }
  }

  const addedCount = raw.filter((l) => l.type === "add").length;
  const removedCount = raw.filter((l) => l.type === "remove").length;

  return { filePath, lines, addedCount, removedCount, isNewFile };
}

export interface ToolResult {
  text: string;
  diff?: DiffResult;
}

export async function executeTool(
  toolName: string,
  args: ToolArgs,
): Promise<ToolResult> {
  try {
    switch (toolName) {
      case "read_file":
        if (!args.path) throw new Error("Path is required");
        const content = await fs.readFile(args.path, "utf-8");
        return { text: content };

      case "write_file":
        if (!args.path || args.content === undefined) {
          throw new Error("Path and content are required");
        }
        const isNewFile = !existsSync(args.path);
        let oldContent = "";
        if (!isNewFile) {
          try {
            oldContent = await fs.readFile(args.path, "utf-8");
          } catch {
            oldContent = "";
          }
        }
        await fs.writeFile(args.path, args.content, "utf-8");
        const oldLines = oldContent.split("\n");
        const newLines = args.content.split("\n");
        const diff = computeDiff(oldLines, newLines, args.path, isNewFile);
        return {
          text: isNewFile
            ? `Created: ${args.path} (${newLines.length} lines)`
            : `Updated: ${args.path} (+${diff.addedCount} -${diff.removedCount})`,
          diff,
        };

      case "execute_shell":
        if (!args.command) throw new Error("Command is required");
        const { stdout, stderr } = await execAsync(args.command, {
          encoding: "utf-8",
          maxBuffer: 10 * 1024 * 1024,
          timeout: 120_000,
        });
        return { text: stdout || stderr || "Command executed successfully" };

      case "list_directory":
        if (!args.path) throw new Error("Path is required");
        const items = await fs.readdir(args.path, { withFileTypes: true });
        return {
          text: items
            .map(
              (item: Dirent) =>
                `${item.isDirectory() ? "[DIR]" : "[FILE]"} ${item.name}`,
            )
            .join("\n"),
        };

      case "create_directory":
        if (!args.path) throw new Error("Path is required");
        if (!existsSync(args.path)) {
          await fs.mkdir(args.path, { recursive: true });
          return { text: `Directory created: ${args.path}` };
        }
        return { text: `Directory already exists: ${args.path}` };

      case "remember":
        if (!args.content) throw new Error("Content is required");
        const memoryPath = getMemoryPath(process.cwd());
        const memoryDir = path.dirname(memoryPath);
        if (!existsSync(memoryDir)) {
          mkdirSync(memoryDir, { recursive: true });
        }
        const timestamp = new Date().toISOString().split("T")[0];
        const line = `- [${timestamp}] ${args.content.trim()}\n`;
        appendFileSync(memoryPath, line, "utf-8");
        return { text: `Remembered: ${args.content.trim()}` };

      case "load_skill": {
        const { discoverSkills } = await import("../services/skills.js");
        if (!args.name) {
          // List all available skills
          const skills = discoverSkills(process.cwd());
          if (skills.length === 0) return { text: "No skills found. Create one with /skill <name> <description>" };
          const lines = skills.map((s) => {
            const inv = s.invocation === "always" ? "always-on" : "on-demand";
            return `- ${s.name}: ${s.description} (${s.source}, ${inv})`;
          });
          return { text: `Available skills:\n${lines.join("\n")}\n\nLoad a skill with: load_skill("name")` };
        }
        const skill = getSkillByName(process.cwd(), args.name);
        if (!skill) return { text: `Skill "${args.name}" not found. Call load_skill() without args to list available skills.` };
        return { text: `Skill: ${skill.name}\nDescription: ${skill.description}\nInvocation: ${skill.invocation}\n\n${skill.content}` };
      }

      default:
        if (mcpManager && mcpManager.isMcpTool(toolName)) {
          const result = await mcpManager.callTool(toolName, args as Record<string, unknown>);
          return { text: result };
        }
        throw new Error(`Unknown tool: ${toolName}`);
    }
  } catch (error) {
    return { text: `Error: ${error instanceof Error ? error.message : String(error)}` };
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
    case "remember":
      return `Remember: ${(args.content || "").substring(0, 60)}`;
    case "load_skill":
      return `Load skill: ${args.name}`;
    default:
      if (mcpManager?.isMcpTool(toolName)) {
        const parsed = mcpManager.parseMcpToolName(toolName);
        if (parsed) return `MCP: ${parsed.serverName} → ${parsed.toolName}`;
      }
      return `${toolName}`;
  }
}
