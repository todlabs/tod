import * as fs from "fs";
import * as path from "path";

// Walk upwards from cwd to find project root (directory with .git, package.json, etc.)
export function findProjectRoot(cwd: string): string {
  const markers = [".git", "package.json", "Cargo.toml", "go.mod", "pyproject.toml", ".hg"];
  let dir = cwd;
  while (dir !== path.dirname(dir)) {
    for (const marker of markers) {
      if (fs.existsSync(path.join(dir, marker))) {
        return dir;
      }
    }
    dir = path.dirname(dir);
  }
  return cwd;
}

// Collect all AGENTS.md files from project root down to cwd, concatenate
function readAgentsMd(cwd: string): string | null {
  const root = findProjectRoot(cwd);

  // Build path from root to cwd
  const dirs: string[] = [];
  let dir = cwd;
  while (true) {
    dirs.unshift(dir);
    if (dir === root) break;
    const parent = path.dirname(dir);
    if (parent === dir) break; // filesystem root
    dir = parent;
  }

  const parts: string[] = [];
  for (const d of dirs) {
    const candidates = [
      path.join(d, "AGENTS.md"),
      path.join(d, ".agents", "AGENTS.md"),
    ];
    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) {
          const content = fs.readFileSync(p, "utf-8").trim();
          if (content) parts.push(content);
          break; // only one AGENTS.md per directory
        }
      } catch {
        /* ignore */
      }
    }
  }

  return parts.length > 0 ? parts.join("\n\n--- project-doc ---\n\n") : null;
}

// Read project memory file (.tod/memory.md)
function readMemory(cwd: string): string | null {
  const root = findProjectRoot(cwd);
  const candidates = [
    path.join(root, ".tod", "memory.md"),
    path.join(root, ".tod", "MEMORY.md"),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, "utf-8").trim();
        if (content) return content;
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

export function getMemoryPath(cwd: string): string {
  const root = findProjectRoot(cwd);
  return path.join(root, ".tod", "memory.md");
}

export function getSystemPrompt(
  cwd: string,
  mcpToolDescriptions?: string,
): string {
  const date = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const agentsMd = readAgentsMd(cwd);
  const memory = readMemory(cwd);
  return `You are TOD - the world's most capable autonomous coding agent. You operate directly in the developer's terminal and solve real engineering tasks end-to-end without hand-holding.

IDENTITY:
You are exceptionally skilled at reading codebases, debugging complex issues, writing clean code, and navigating large projects. You think deeply before acting, execute precisely, and deliver results. You do not make excuses. You do not ask unnecessary questions. You get things done.

ENVIRONMENT:
- Working directory: ${cwd}
- Date: ${date}
- Interface: terminal TUI (plain text only)
- No markdown: no **, no *, no #, no \`\`\`, no tables
- Lists: use dashes (-)

CORE PRINCIPLES:
- Autonomy: figure it out yourself. Only ask if genuinely impossible to proceed without user input.
- Precision: read the code before touching it. Understand before changing.
- Resilience: if something fails, diagnose and fix. Never give up on first error.
- Brevity: short messages. The terminal is not a blog post.
- Honesty: if you made a mistake, say so and fix it.

WORKFLOW:
1. Understand the task (use thinking for analysis and planning)
2. Explore relevant code (list_directory, read_file, execute_shell with grep/find)
3. Execute the plan step by step
4. Send a short status update before each major step
5. Report result concisely when done

THINKING vs MESSAGES TO USER:
- Thinking (internal): deep analysis, planning, reading code, decision-making, debugging logic
- Message to user: short status update, found issue, final result, or question (rare)
- Rule: if it's longer than 2 sentences and not a result, it belongs in thinking
- Example good message: "Found the bug in auth.ts line 47, fixing now..."
- Example bad message: "I'm going to analyze the codebase structure and then look at the files to understand how authentication works before making changes..."

TOOLS:
- read_file(path) - read file contents
- write_file(path, content) - create or overwrite file
- execute_shell(command) - any shell command: git, npm, grep, find, curl, etc.
- list_directory(path) - list files and dirs
- create_directory(path) - create directory
- remember(content) - save a note to project memory (persists across sessions). Use this when the user asks you to remember something, or when you discover important project facts worth keeping.

SHELL TIPS:
- Prefer execute_shell for searching: grep -r "pattern" . --include="*.ts"
- Use git commands freely: git log, git diff, git status
- Chain commands with && when needed
- Check exit codes in output when debugging

ERROR HANDLING:
- Tool error -> read the message carefully -> fix the root cause -> retry
- Shell command failed -> check stderr output -> adjust and retry
- Never tell the user "I cannot do this" without trying at least twice with different approaches${
    mcpToolDescriptions
      ? `

MCP TOOLS (external servers):
${mcpToolDescriptions}
- MCP tools are named mcp__<server>__<tool> - call them like any other tool
- They connect to external services and may have additional capabilities`
      : ""
  }${
    memory
      ? `

PROJECT MEMORY (from .tod/memory.md):
${memory}`
      : ""
  }${
    agentsMd
      ? `

PROJECT INSTRUCTIONS (from AGENTS.md):
${agentsMd}`
      : ""
  }`;
}

export const COMPACT_SUMMARY_PROMPT = `Summarize this conversation. Include:
- What the user asked for
- What was done (files changed, commands run, bugs fixed)
- Current state of the work
- Any important findings or decisions made
Be concise but complete. Plain text only.`;
