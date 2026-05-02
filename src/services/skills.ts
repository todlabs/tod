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
  /** Optional regex/keyword triggers — if any matches the latest user message, skill is auto-injected. */
  triggers: string[];
  /** Optional human-readable hint about when to load this skill. */
  whenToUse?: string;
}

function parseList(raw: string): string[] {
  // Accept either a YAML-flow array `[a, b]` or a comma-separated string.
  const trimmed = raw.trim().replace(/^['"]|['"]$/g, "");
  if (!trimmed) return [];
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed
      .slice(1, -1)
      .split(",")
      .map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
      .filter(Boolean);
  }
  return trimmed
    .split(",")
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean);
}

function parseFrontmatter(raw: string): {
  description: string;
  invocation: SkillInvocation;
  triggers: string[];
  whenToUse?: string;
  body: string;
} {
  const trimmed = raw.trimStart();
  if (!trimmed.startsWith("---")) {
    return { description: "", invocation: "on-demand", triggers: [], body: raw };
  }
  const end = trimmed.indexOf("---", 3);
  if (end === -1) return { description: "", invocation: "on-demand", triggers: [], body: raw };

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

  let triggers: string[] = [];
  const trigMatch = frontmatter.match(/^triggers:\s*(.+)$/m);
  if (trigMatch) triggers = parseList(trigMatch[1]);

  let whenToUse: string | undefined;
  const whenMatch = frontmatter.match(/^when[_-]?to[_-]?use:\s*(.+)$/m);
  if (whenMatch) whenToUse = whenMatch[1].trim().replace(/^['"]|['"]$/g, "");

  return { description, invocation, triggers, whenToUse, body };
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
        const { description, invocation, triggers, whenToUse, body } =
          parseFrontmatter(raw);
        if (!body) continue;
        skills.push({
          name: entry.name,
          description: description || body.split("\n")[0].slice(0, 80),
          content: body,
          invocation,
          source,
          triggers,
          whenToUse,
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

/**
 * Test a single trigger against text. Triggers that look like a regex
 * (`/.../flags`) are compiled as such; everything else is a case-insensitive
 * substring match.
 */
function triggerMatches(trigger: string, text: string): boolean {
  if (!trigger) return false;
  const regexShape = trigger.match(/^\/(.+)\/([gimsuy]*)$/);
  if (regexShape) {
    try {
      const flags = regexShape[2].includes("i") ? regexShape[2] : regexShape[2] + "i";
      return new RegExp(regexShape[1], flags).test(text);
    } catch {
      return false;
    }
  }
  return text.toLowerCase().includes(trigger.toLowerCase());
}

/** Find on-demand skills whose triggers match the given user text. */
export function findTriggeredSkills(cwd: string, userText: string): Skill[] {
  if (!userText.trim()) return [];
  const skills = discoverSkills(cwd);
  return skills.filter(
    (s) =>
      s.invocation === "on-demand" &&
      s.triggers.length > 0 &&
      s.triggers.some((t) => triggerMatches(t, userText)),
  );
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
