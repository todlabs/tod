import * as fs from "fs";
import * as path from "path";
import { getAlwaysOnSkillsContent } from "../services/skills.js";

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

// Read project memory.
// New layout: .tod/memory/MEMORY.md (index) + .tod/memory/<name>.md per entry.
// Old layout: .tod/memory.md (single file). Both are loaded if present.
function readMemory(cwd: string): string | null {
  const root = findProjectRoot(cwd);
  const parts: string[] = [];

  // New layout — index + entries
  const memoryDir = path.join(root, ".tod", "memory");
  const indexPath = path.join(memoryDir, "MEMORY.md");
  if (fs.existsSync(indexPath)) {
    try {
      const index = fs.readFileSync(indexPath, "utf-8").trim();
      if (index) parts.push(`Memory index:\n${index}`);
    } catch {
      /* ignore */
    }

    // Load each memory file content (capped to keep prompt reasonable)
    try {
      const entries = fs
        .readdirSync(memoryDir)
        .filter((f) => f.endsWith(".md") && f !== "MEMORY.md");
      const bodies: string[] = [];
      for (const f of entries) {
        try {
          const content = fs.readFileSync(path.join(memoryDir, f), "utf-8").trim();
          if (content) bodies.push(content);
        } catch {
          /* ignore */
        }
      }
      if (bodies.length > 0) parts.push(bodies.join("\n\n"));
    } catch {
      /* ignore */
    }
  }

  // Old layout fallback / supplement
  const legacyCandidates = [
    path.join(root, ".tod", "memory.md"),
    path.join(root, ".tod", "MEMORY.md"),
  ];
  for (const p of legacyCandidates) {
    try {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, "utf-8").trim();
        if (content) parts.push(content);
        break;
      }
    } catch {
      /* ignore */
    }
  }

  return parts.length > 0 ? parts.join("\n\n") : null;
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
  const alwaysOnSkills = getAlwaysOnSkillsContent(cwd);
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
2. Explore relevant code (glob, grep, list_directory, read_file)
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
- write_file(path, content) - create a new file or fully rewrite an existing one
- edit_file(path, old_string, new_string, replace_all?) - exact-string replacement in an existing file. Prefer this over write_file for targeted changes; cheaper in tokens, easier to review. old_string must be unique unless replace_all is true.
- execute_shell(command) - any shell command: git, npm, curl, etc.
- list_directory(path) - list files and dirs
- create_directory(path) - create directory
- glob(pattern, path?) - find files by glob pattern, e.g. "src/**/*.ts". Faster than execute_shell with find.
- grep(pattern, path?, glob?, ignore_case?, output_mode?) - search file contents with regex (ripgrep when available). Prefer this over execute_shell with grep.
- remember(content, type?, memory_name?) - save a note to project memory. type ∈ {user, feedback, project, reference}; passing the same memory_name later updates the entry. Use when the user explicitly asks you to remember something or when you uncover non-obvious facts worth keeping.
- load_skill(name?) - load a skill by name, or call without args to list available skills. Skills with triggers also auto-activate when the user message matches.

SEARCH TIPS:
- Use glob to find files by name pattern; use grep to search inside file contents.
- Fall back to execute_shell only for things glob/grep cannot express (e.g. git log filters).
- Use git commands freely: git log, git diff, git status.
- Chain shell commands with && when needed; check exit codes in output when debugging.

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
  }${
    alwaysOnSkills
      ? `

${alwaysOnSkills}`
      : ""
  }`;
}

export const COMPACT_SUMMARY_PROMPT = `Produce a structured session summary so a future agent can resume without re-reading the full transcript. Use exactly these section headers, each on its own line, plain text only (no markdown bold/headings):

USER GOALS:
- One bullet per distinct ask or requirement.

FILES READ:
- path: short note on what was learned.

FILES MODIFIED:
- path: what changed and why.

COMMANDS RUN:
- command: outcome (success / error / key output).

KEY DECISIONS:
- Decisions or constraints the agent committed to (architectural choices, naming, scope cuts).

OPEN QUESTIONS / PENDING:
- Anything still unfinished or unanswered. Empty bullet "- (none)" if nothing.

Be specific (real paths, real commands, real reasons). Skip filler. Omit a section if truly empty by writing "- (none)".`;
