import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface SkillFrontmatter {
  name?: string;
  description?: string;
  'argument-hint'?: string;
  'disable-model-invocation'?: boolean;
  'user-invocable'?: boolean;
  'allowed-tools'?: string[];
  model?: string;
  context?: 'inline' | 'fork';
  agent?: string;
}

export interface Skill {
  name: string;
  description: string;
  content: string;
  body: string;
  path: string;
  isGlobal: boolean;
  frontmatter: SkillFrontmatter;
}

interface SkillsManagerOptions {
  globalSkillsPath?: string;
  projectSkillsPath?: string;
  cwd?: string;
}

export class SkillsManager {
  private globalSkillsPath: string;
  private projectSkillsPath: string;

  constructor(opts: SkillsManagerOptions = {}) {
    const cwd = opts.cwd || process.cwd();
    this.globalSkillsPath = opts.globalSkillsPath || path.join(os.homedir(), '.tod', 'skills');
    this.projectSkillsPath = opts.projectSkillsPath || path.join(cwd, '.tod', 'skills');
    this.ensureGlobalSkillsDir();
  }

  private ensureGlobalSkillsDir(): void {
    if (!fs.existsSync(this.globalSkillsPath)) {
      fs.mkdirSync(this.globalSkillsPath, { recursive: true });
    }
  }

  private getSkillPath(skillName: string, isGlobal: boolean): string {
    const basePath = isGlobal ? this.globalSkillsPath : this.projectSkillsPath;
    return path.join(basePath, skillName, 'SKILL.md');
  }

  private parseBool(value: string): boolean | undefined {
    const v = value.trim().toLowerCase();
    if (v === 'true') return true;
    if (v === 'false') return false;
    return undefined;
  }

  private parseList(value: string): string[] {
    return value
      .split(',')
      .map(v => v.trim())
      .filter(Boolean);
  }

  private parseFrontmatter(content: string): { frontmatter: SkillFrontmatter; body: string } {
    const lines = content.split('\n');
    if (lines[0]?.trim() !== '---') {
      return { frontmatter: {}, body: content };
    }

    let end = -1;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === '---') {
        end = i;
        break;
      }
    }

    if (end === -1) return { frontmatter: {}, body: content };

    const fmLines = lines.slice(1, end);
    const body = lines.slice(end + 1).join('\n').trimStart();
    const frontmatter: SkillFrontmatter = {};

    for (const raw of fmLines) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const idx = line.indexOf(':');
      if (idx === -1) continue;

      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim().replace(/^"|"$/g, '');

      if (key === 'disable-model-invocation' || key === 'user-invocable') {
        const parsed = this.parseBool(value);
        if (parsed !== undefined) (frontmatter as any)[key] = parsed;
      } else if (key === 'allowed-tools') {
        (frontmatter as any)[key] = this.parseList(value);
      } else if (key === 'context') {
        if (value === 'fork' || value === 'inline') frontmatter.context = value;
      } else if (
        key === 'name' ||
        key === 'description' ||
        key === 'argument-hint' ||
        key === 'model' ||
        key === 'agent'
      ) {
        (frontmatter as any)[key] = value;
      }
    }

    return { frontmatter, body };
  }

  private inferDescription(body: string): string {
    const lines = body.split('\n');
    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      return line.substring(0, 140);
    }
    return 'No description';
  }

  private parseSkill(content: string, skillPath: string, isGlobal: boolean): Skill {
    const dirName = path.basename(path.dirname(skillPath));
    const { frontmatter, body } = this.parseFrontmatter(content);
    const skillName = frontmatter.name || dirName;
    const description = frontmatter.description || this.inferDescription(body);

    return {
      name: skillName,
      description,
      content,
      body,
      path: skillPath,
      isGlobal,
      frontmatter,
    };
  }

  private loadSkillFromPath(skillPath: string, isGlobal: boolean): Skill | null {
    if (!fs.existsSync(skillPath)) return null;
    try {
      const content = fs.readFileSync(skillPath, 'utf-8');
      return this.parseSkill(content, skillPath, isGlobal);
    } catch (error) {
      console.error(`Failed to load skill from ${skillPath}:`, error);
      return null;
    }
  }

  loadSkill(skillName: string): Skill | null {
    // project has priority over global
    const project = this.loadSkillFromPath(this.getSkillPath(skillName, false), false);
    if (project) return project;
    return this.loadSkillFromPath(this.getSkillPath(skillName, true), true);
  }

  listSkills(): Skill[] {
    const byName = new Map<string, Skill>();

    if (fs.existsSync(this.globalSkillsPath)) {
      const globalSkills = fs.readdirSync(this.globalSkillsPath);
      for (const skillName of globalSkills) {
        const skill = this.loadSkillFromPath(this.getSkillPath(skillName, true), true);
        if (skill) byName.set(skill.name, skill);
      }
    }

    // project overrides global
    if (fs.existsSync(this.projectSkillsPath)) {
      const projectSkills = fs.readdirSync(this.projectSkillsPath);
      for (const skillName of projectSkills) {
        const skill = this.loadSkillFromPath(this.getSkillPath(skillName, false), false);
        if (skill) byName.set(skill.name, skill);
      }
    }

    return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  listInvocableSkills(): Skill[] {
    return this.listSkills().filter(skill => skill.frontmatter['user-invocable'] !== false);
  }

  resolveSkillForPrompt(prompt: string): Skill | null {
    const normalized = prompt.toLowerCase();
    const skills = this.listSkills().filter(skill => skill.frontmatter['disable-model-invocation'] !== true);

    // name match first
    for (const skill of skills) {
      if (normalized.includes(skill.name.toLowerCase())) return skill;
    }

    // light description match
    for (const skill of skills) {
      const words = skill.description.toLowerCase().split(/[^a-zа-я0-9]+/i).filter(w => w.length > 3);
      if (words.some(word => normalized.includes(word))) return skill;
    }

    return null;
  }

  renderSkillInstructions(skill: Skill, args?: string): string {
    const rawArgs = (args || '').trim();
    let output = skill.body;

    const splitArgs = rawArgs ? rawArgs.split(/\s+/) : [];
    output = output.replace(/\$ARGUMENTS\[(\d+)\]/g, (_, idx) => splitArgs[Number(idx)] || '');
    output = output.replace(/\$(\d+)/g, (_, idx) => splitArgs[Math.max(Number(idx) - 1, 0)] || '');

    if (output.includes('$ARGUMENTS')) {
      output = output.replace(/\$ARGUMENTS/g, rawArgs);
    } else if (rawArgs.length > 0) {
      output += `\n\nARGUMENTS: ${rawArgs}`;
    }

    return output.trim();
  }

  createSkill(name: string, content: string, isGlobal: boolean = false): boolean {
    const basePath = isGlobal ? this.globalSkillsPath : this.projectSkillsPath;
    const skillDir = path.join(basePath, name);
    const skillPath = path.join(skillDir, 'SKILL.md');

    try {
      if (!fs.existsSync(skillDir)) fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(skillPath, content, 'utf-8');
      return true;
    } catch (error) {
      console.error(`Failed to create skill ${name}:`, error);
      return false;
    }
  }

  deleteSkill(name: string): boolean {
    const skill = this.loadSkill(name);
    if (!skill) return false;

    try {
      const skillDir = path.dirname(skill.path);
      fs.rmSync(skillDir, { recursive: true, force: true });
      return true;
    } catch (error) {
      console.error(`Failed to delete skill ${name}:`, error);
      return false;
    }
  }

  getSkillHelp(): string {
    const skills = this.listInvocableSkills();
    if (skills.length === 0) return 'No skills found.';

    const lines: string[] = ['Available skills:'];
    for (const skill of skills) {
      const location = skill.isGlobal ? '(global)' : '(project)';
      const invocation = skill.frontmatter['disable-model-invocation'] ? 'manual' : 'auto+manual';
      lines.push(`  /${skill.name.padEnd(20)} ${skill.description.substring(0, 60)} ${location} ${invocation}`);
    }
    lines.push('\nUse /skill-name [args] to invoke a skill');
    return lines.join('\n');
  }

  getSkillCreatorTemplate(): string {
    return `---
name: skill-creator
description: Create a new skill with clean frontmatter and focused instructions
disable-model-invocation: true
user-invocable: true
---

You are a skill creation assistant.

When user asks to create a skill:
1. Ask skill name (lowercase-hyphen format)
2. Ask short description
3. Ask instructions content
4. Ask scope (global/project)
5. Create SKILL.md with frontmatter and clear body

Use this base template:
---
name: my-skill
description: what this skill does
disable-model-invocation: false
user-invocable: true
---

Skill instructions here.
`;
  }

  createExampleSkills(): void {
    this.createSkill('skill-creator', this.getSkillCreatorTemplate(), true);
  }
}

export const skillsManager = new SkillsManager();
