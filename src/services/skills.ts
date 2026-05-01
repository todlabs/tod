import * as fs from "fs";
import * as path from "path";
import { homedir } from "os";
import { findProjectRoot } from "../prompts/system.js";

export type SkillInvocation = "always" | "on-demand";

export interface Skill {
  name: string;
  description: string;
  content: string;
  invocation: SkillInvocation;
  source: "project" | "personal";
}

function parseFrontmatter(raw: string): {
  description: string;
  invocation: SkillInvocation;
  body: string;
} {
  const trimmed = raw.trimStart();
  if (!trimmed.startsWith("---")) {
    return { description: "", invocation: "on-demand", body: raw };
  }
  const end = trimmed.indexOf("---", 3);
  if (end === -1) return { description: "", invocation: "on-demand", body: raw };

  const frontmatter = trimmed.slice(3, end).trim();
  const body = trimmed.slice(end + 3).trim();

  let description = "";
  const descMatch = frontmatter.match(/^description:\s*(.+)$/m);
  if (descMatch) {
    description = descMatch[1].trim().replace(/^['"]|['"]$/g, "");
  }

  let invocation: SkillInvocation = "on-demand";
  const invMatch = frontmatter.match(/^invocation:\s*(.+)$/m);
  if (invMatch) {
    const val = invMatch[1].trim().toLowerCase();
    if (val === "always" || val === "auto") {
      invocation = "always";
    }
  }

  return { description, invocation, body };
}

function scanDir(skillsDir: string, source: "project" | "personal"): Skill[] {
  if (!fs.existsSync(skillsDir)) return [];

  const skills: Skill[] = [];
  try {
    const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillFile = path.join(skillsDir, entry.name, "SKILL.md");
      if (!fs.existsSync(skillFile)) continue;
      try {
        const raw = fs.readFileSync(skillFile, "utf-8");
        const { description, invocation, body } = parseFrontmatter(raw);
        if (!body) continue;
        skills.push({
          name: entry.name,
          description: description || body.split("\n")[0].slice(0, 80),
          content: body,
          invocation,
          source,
        });
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
  return skills;
}

export function discoverSkills(cwd: string): Skill[] {
  const skills: Skill[] = [];
  const seen = new Set<string>();

  const root = findProjectRoot(cwd);

  // Project skills: .tod/skills/
  const projectSkills = scanDir(path.join(root, ".tod", "skills"), "project");
  for (const s of projectSkills) {
    if (!seen.has(s.name)) {
      seen.add(s.name);
      skills.push(s);
    }
  }

  // Also check .agents/skills/ and .claude/skills/ for compatibility
  for (const compatDir of [".agents/skills", ".claude/skills"]) {
    const compatSkills = scanDir(path.join(root, compatDir), "project");
    for (const s of compatSkills) {
      if (!seen.has(s.name)) {
        seen.add(s.name);
        skills.push(s);
      }
    }
  }

  // Personal skills: ~/.tod/skills/
  const home = homedir();
  const personalSkills = scanDir(path.join(home, ".tod", "skills"), "personal");
  for (const s of personalSkills) {
    if (!seen.has(s.name)) {
      seen.add(s.name);
      skills.push(s);
    }
  }

  return skills;
}

export function getSkillByName(cwd: string, name: string): Skill | undefined {
  return discoverSkills(cwd).find((s) => s.name === name);
}

/** Always-on skills: full content injected into system prompt */
export function getAlwaysOnSkillsContent(cwd: string): string {
  const skills = discoverSkills(cwd).filter((s) => s.invocation === "always");
  if (skills.length === 0) return "";

  const parts = skills.map(
    (s) => `[${s.name}] ${s.description}\n${s.content}`,
  );
  return `ACTIVE SKILLS (always follow these rules):\n\n${parts.join("\n\n")}`;
}

/** Get the skills directory path for creating new skills */
export function getSkillsDir(cwd: string): string {
  const root = findProjectRoot(cwd);
  return path.join(root, ".tod", "skills");
}

/** Sanitize a skill name: keep letters/numbers/hyphens/underscores, collapse dashes */
export function sanitizeSkillName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_-]/gu, "-") // allow unicode letters + numbers
    .replace(/-+/g, "-") // collapse multiple dashes
    .replace(/^-|-$/g, ""); // strip leading/trailing dashes
}
