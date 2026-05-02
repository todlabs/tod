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
      name: "edit_file",
      description: "Replace exact text in an existing file. Cheaper and safer than write_file when changing parts of a file. Fails if old_string is not found, or if it appears more than once and replace_all is false. Use this for targeted edits; use write_file only when creating files or rewriting them entirely.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path to the file to edit" },
          old_string: {
            type: "string",
            description: "The exact text to find. Must be unique in the file unless replace_all is true. Include enough surrounding context to make it unique.",
          },
          new_string: {
            type: "string",
            description: "The text to replace old_string with",
          },
          replace_all: {
            type: "boolean",
            description: "Replace every occurrence (default false)",
          },
        },
        required: ["path", "old_string", "new_string"],
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
      name: "glob",
      description: "Find files by glob pattern (e.g. \"src/**/*.ts\"). Returns matching paths sorted by modification time. Faster and clearer than execute_shell with find.",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "Glob pattern, e.g. \"**/*.ts\" or \"src/**/*.{ts,tsx}\"" },
          path: { type: "string", description: "Directory to search in (default: cwd)" },
        },
        required: ["pattern"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "grep",
      description: "Search file contents with a regex (powered by ripgrep when available, grep fallback). Use this instead of execute_shell with grep for code searches.",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "Regex pattern to search for" },
          path: { type: "string", description: "Directory or file to search in (default: cwd)" },
          glob: { type: "string", description: "Optional glob to filter files, e.g. \"*.ts\"" },
          ignore_case: { type: "boolean", description: "Case-insensitive search (default false)" },
          output_mode: {
            type: "string",
            enum: ["content", "files_with_matches", "count"],
            description: "content shows matching lines, files_with_matches shows paths, count shows match counts (default content)",
          },
        },
        required: ["pattern"],
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
      description: "Save a note to project memory (persists across sessions, indexed in .tod/memory/MEMORY.md). Group memories by type so future sessions can recall the right kind: user (who the user is, preferences), feedback (corrections or validated approaches — explain why), project (current work, deadlines, constraints), reference (where to look in external systems). Pick a stable name; calling remember with the same name updates the existing entry.",
      parameters: {
        type: "object",
        properties: {
          content: {
            type: "string",
            description: "The note body. For feedback/project, lead with the rule/fact then a Why: line and a How to apply: line.",
          },
          type: {
            type: "string",
            enum: ["user", "feedback", "project", "reference"],
            description: "Category. Defaults to project if omitted.",
          },
          memory_name: {
            type: "string",
            description: "Short kebab-case identifier so the entry can be updated later (e.g. user-role, feedback-tests). Auto-generated if omitted.",
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
  old_string?: string;
  new_string?: string;
  replace_all?: boolean;
  pattern?: string;
  glob?: string;
  ignore_case?: boolean;
  output_mode?: "content" | "files_with_matches" | "count";
  type?: string;
  memory_name?: string;
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

// Convert a glob pattern to a regex. Supports **, *, ?, and brace expansion {a,b}.
function globToRegex(pattern: string): RegExp {
  // Expand brace groups first: src/**/*.{ts,tsx} -> (src/**/*.ts|src/**/*.tsx)
  const expand = (p: string): string[] => {
    const m = p.match(/\{([^{}]+)\}/);
    if (!m) return [p];
    const opts = m[1].split(",");
    const out: string[] = [];
    for (const o of opts) {
      out.push(...expand(p.slice(0, m.index!) + o + p.slice(m.index! + m[0].length)));
    }
    return out;
  };

  const branches = expand(pattern).map((p) => {
    let re = "";
    for (let i = 0; i < p.length; i++) {
      const ch = p[i];
      if (ch === "*") {
        if (p[i + 1] === "*") {
          re += ".*";
          i++;
          if (p[i + 1] === "/") i++; // consume the trailing slash of **/
        } else {
          re += "[^/]*";
        }
      } else if (ch === "?") {
        re += "[^/]";
      } else if (/[.+^$()|\[\]\\]/.test(ch)) {
        re += "\\" + ch;
      } else {
        re += ch;
      }
    }
    return re;
  });

  return new RegExp("^(?:" + branches.join("|") + ")$");
}

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".turbo",
  "dist",
  "build",
  ".cache",
  "coverage",
  ".venv",
  "__pycache__",
]);

async function walkFiles(
  rootDir: string,
  matcher: (relPath: string) => boolean,
  limit = 500,
): Promise<Array<{ path: string; mtimeMs: number }>> {
  const results: Array<{ path: string; mtimeMs: number }> = [];

  async function walk(dir: string): Promise<void> {
    if (results.length >= limit) return;
    let entries: Dirent[];
    try {
      entries = (await fs.readdir(dir, { withFileTypes: true })) as Dirent[];
    } catch {
      return;
    }
    for (const entry of entries) {
      if (results.length >= limit) return;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        await walk(full);
      } else if (entry.isFile()) {
        const rel = path.relative(rootDir, full);
        if (matcher(rel)) {
          try {
            const stat = await fs.stat(full);
            results.push({ path: full, mtimeMs: stat.mtimeMs });
          } catch {
            /* ignore stat failure */
          }
        }
      }
    }
  }

  await walk(rootDir);
  return results;
}

let cachedRipgrep: string | null | undefined;

async function detectRipgrep(): Promise<string | null> {
  if (cachedRipgrep !== undefined) return cachedRipgrep;
  for (const cmd of ["rg", "/usr/bin/rg", "/usr/local/bin/rg"]) {
    try {
      await execAsync(`${cmd} --version`, { timeout: 5000 });
      cachedRipgrep = cmd;
      return cmd;
    } catch {
      /* try next */
    }
  }
  cachedRipgrep = null;
  return null;
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

async function runGrep(args: ToolArgs): Promise<string> {
  const pattern = args.pattern!;
  const searchPath = args.path || ".";
  const mode = args.output_mode || "content";
  const ignore = args.ignore_case ? true : false;

  const rg = await detectRipgrep();
  if (rg) {
    const parts = [rg, "--no-heading", "--color=never"];
    if (ignore) parts.push("-i");
    if (args.glob) parts.push("--glob", shellQuote(args.glob));
    if (mode === "files_with_matches") parts.push("-l");
    else if (mode === "count") parts.push("-c");
    else parts.push("-n");
    parts.push("--", shellQuote(pattern), shellQuote(searchPath));

    const cmd = parts.join(" ");
    try {
      const { stdout } = await execAsync(cmd, {
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024,
        timeout: 60_000,
      });
      return stdout || "(no matches)";
    } catch (error: any) {
      // ripgrep exits 1 when no matches — that's not an error for us
      if (error?.code === 1 && !error?.stderr) return "(no matches)";
      throw error;
    }
  }

  // grep fallback
  const flags = ["-r", "-n", "-E"];
  if (ignore) flags.push("-i");
  if (args.glob) flags.push("--include", shellQuote(args.glob));
  if (mode === "files_with_matches") flags.push("-l");
  else if (mode === "count") flags.push("-c");
  const cmd = `grep ${flags.join(" ")} -- ${shellQuote(pattern)} ${shellQuote(searchPath)}`;
  try {
    const { stdout } = await execAsync(cmd, {
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
      timeout: 60_000,
    });
    return stdout || "(no matches)";
  } catch (error: any) {
    if (error?.code === 1 && !error?.stderr) return "(no matches)";
    throw error;
  }
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

      case "edit_file": {
        if (!args.path) throw new Error("Path is required");
        if (args.old_string === undefined || args.new_string === undefined) {
          throw new Error("old_string and new_string are required");
        }
        if (args.old_string === args.new_string) {
          throw new Error("old_string and new_string must differ");
        }
        if (!existsSync(args.path)) {
          throw new Error(`File does not exist: ${args.path}`);
        }
        const oldContent = await fs.readFile(args.path, "utf-8");
        const occurrences = oldContent.split(args.old_string).length - 1;
        if (occurrences === 0) {
          throw new Error(
            `old_string not found in ${args.path}. Make sure it matches exactly, including whitespace.`,
          );
        }
        if (occurrences > 1 && !args.replace_all) {
          throw new Error(
            `old_string is not unique in ${args.path} (${occurrences} occurrences). Add more context to make it unique, or pass replace_all: true.`,
          );
        }
        const newContent = args.replace_all
          ? oldContent.split(args.old_string).join(args.new_string)
          : oldContent.replace(args.old_string, args.new_string);
        await fs.writeFile(args.path, newContent, "utf-8");
        const oldLines = oldContent.split("\n");
        const newLines = newContent.split("\n");
        const editDiff = computeDiff(oldLines, newLines, args.path, false);
        return {
          text: `Edited: ${args.path} (+${editDiff.addedCount} -${editDiff.removedCount}${args.replace_all && occurrences > 1 ? `, ${occurrences} occurrences` : ""})`,
          diff: editDiff,
        };
      }

      case "execute_shell":
        if (!args.command) throw new Error("Command is required");
        const { stdout, stderr } = await execAsync(args.command, {
          encoding: "utf-8",
          maxBuffer: 10 * 1024 * 1024,
          timeout: 120_000,
        });
        return { text: stdout || stderr || "Command executed successfully" };

      case "glob": {
        if (!args.pattern) throw new Error("Pattern is required");
        const searchRoot = path.resolve(args.path || process.cwd());
        const regex = globToRegex(args.pattern);
        const matches = await walkFiles(searchRoot, (rel) => regex.test(rel));
        if (matches.length === 0) return { text: "(no matches)" };
        matches.sort((a, b) => b.mtimeMs - a.mtimeMs);
        const list = matches.map((m) => m.path).join("\n");
        return { text: list };
      }

      case "grep": {
        if (!args.pattern) throw new Error("Pattern is required");
        const out = await runGrep(args);
        return { text: out };
      }

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

      case "remember": {
        if (!args.content) throw new Error("Content is required");
        const content = args.content.trim();
        const validTypes = ["user", "feedback", "project", "reference"] as const;
        const memType = (validTypes as readonly string[]).includes(args.type || "")
          ? (args.type as (typeof validTypes)[number])
          : "project";

        const slugify = (s: string) =>
          s
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 40) || "note";
        const baseName = args.memory_name
          ? slugify(args.memory_name)
          : `${memType}-${slugify(content.split("\n")[0]).slice(0, 30)}`;

        const root = findProjectRoot(process.cwd());
        const memoryDir = path.join(root, ".tod", "memory");
        if (!existsSync(memoryDir)) mkdirSync(memoryDir, { recursive: true });

        const memoryFile = path.join(memoryDir, `${baseName}.md`);
        const firstLine = content.split("\n")[0].slice(0, 80);
        const body = `---
name: ${baseName}
description: ${firstLine}
type: ${memType}
updatedAt: ${new Date().toISOString().split("T")[0]}
---

${content}
`;
        const isUpdate = existsSync(memoryFile);
        await fs.writeFile(memoryFile, body, "utf-8");

        // Maintain MEMORY.md index — one line per memory
        const indexPath = path.join(memoryDir, "MEMORY.md");
        const indexEntry = `- [${baseName}](${baseName}.md) — ${firstLine}`;
        let indexContent = "";
        try {
          indexContent = readFileSync(indexPath, "utf-8");
        } catch {
          /* new index */
        }

        const lines = indexContent.split("\n").filter((l) => l.trim());
        const matchPrefix = `- [${baseName}](`;
        const filtered = lines.filter((l) => !l.startsWith(matchPrefix));
        filtered.push(indexEntry);
        const newIndex = filtered.join("\n") + "\n";
        await fs.writeFile(indexPath, newIndex, "utf-8");

        return {
          text: `${isUpdate ? "Updated" : "Saved"} memory [${memType}/${baseName}]: ${firstLine}`,
        };
      }

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
    case "edit_file":
      return `Edit file "${args.path}"`;
    case "execute_shell":
      return `Execute shell command "${args.command}"`;
    case "list_directory":
      return `List directory "${args.path}"`;
    case "create_directory":
      return `Create directory "${args.path}"`;
    case "glob":
      return `Glob "${args.pattern}"${args.path ? ` in ${args.path}` : ""}`;
    case "grep":
      return `Grep "${args.pattern}"${args.path ? ` in ${args.path}` : ""}`;
    case "remember":
      return `Remember${args.type ? ` (${args.type})` : ""}: ${(args.content || "").substring(0, 60)}`;
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
