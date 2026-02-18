import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface Skill {
  name: string;
  description: string;
  content: string;
  path: string;
  isGlobal: boolean;
}

export interface SkillManifest {
  name: string;
  description: string;
  version?: string;
  author?: string;
  tags?: string[];
}

export class SkillsManager {
  private globalSkillsPath: string;
  private projectSkillsPath: string;

  constructor() {
    this.globalSkillsPath = path.join(os.homedir(), '.tod', 'skills');
    this.projectSkillsPath = path.join(process.cwd(), '.tod', 'skills');
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

  private parseSkill(content: string, skillPath: string, isGlobal: boolean): Skill | null {
    const lines = content.split('\n');
    const name = path.basename(path.dirname(skillPath));
    
    // Extract description from first non-empty line after title
    let description = '';
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line && !line.startsWith('#')) {
        description = line.substring(0, 100);
        break;
      }
    }

    if (!description) {
      description = 'No description';
    }

    return {
      name,
      description,
      content,
      path: skillPath,
      isGlobal,
    };
  }

  loadSkill(skillName: string): Skill | null {
    // Check project skills first, then global
    const paths = [
      { path: this.getSkillPath(skillName, false), isGlobal: false },
      { path: this.getSkillPath(skillName, true), isGlobal: true },
    ];

    for (const { path: skillPath, isGlobal } of paths) {
      if (fs.existsSync(skillPath)) {
        try {
          const content = fs.readFileSync(skillPath, 'utf-8');
          return this.parseSkill(content, skillPath, isGlobal);
        } catch (error) {
          console.error(`Failed to load skill ${skillName}:`, error);
        }
      }
    }

    return null;
  }

  listSkills(): Skill[] {
    const skills: Skill[] = [];

    // Load global skills
    if (fs.existsSync(this.globalSkillsPath)) {
      const globalSkills = fs.readdirSync(this.globalSkillsPath);
      for (const skillName of globalSkills) {
        const skill = this.loadSkill(skillName);
        if (skill) {
          skills.push(skill);
        }
      }
    }

    // Load project skills
    if (fs.existsSync(this.projectSkillsPath)) {
      const projectSkills = fs.readdirSync(this.projectSkillsPath);
      for (const skillName of projectSkills) {
        // Skip if already loaded from global
        if (!skills.find(s => s.name === skillName)) {
          const skillPath = path.join(this.projectSkillsPath, skillName, 'SKILL.md');
          if (fs.existsSync(skillPath)) {
            try {
              const content = fs.readFileSync(skillPath, 'utf-8');
              const skill = this.parseSkill(content, skillPath, false);
              if (skill) {
                skills.push(skill);
              }
            } catch (error) {
              console.error(`Failed to load project skill ${skillName}:`, error);
            }
          }
        }
      }
    }

    return skills;
  }

  createSkill(name: string, content: string, isGlobal: boolean = false): boolean {
    const basePath = isGlobal ? this.globalSkillsPath : this.projectSkillsPath;
    const skillDir = path.join(basePath, name);
    const skillPath = path.join(skillDir, 'SKILL.md');

    try {
      if (!fs.existsSync(skillDir)) {
        fs.mkdirSync(skillDir, { recursive: true });
      }

      fs.writeFileSync(skillPath, content, 'utf-8');
      return true;
    } catch (error) {
      console.error(`Failed to create skill ${name}:`, error);
      return false;
    }
  }

  deleteSkill(name: string): boolean {
    const skill = this.loadSkill(name);
    if (!skill) {
      return false;
    }

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
    const skills = this.listSkills();
    if (skills.length === 0) {
      return 'No skills found. Use /skill-create to create a new skill.';
    }

    const lines: string[] = ['Available skills:'];
    for (const skill of skills) {
      const location = skill.isGlobal ? '(global)' : '(project)';
      lines.push(`  /${skill.name.padEnd(20)} ${skill.description.substring(0, 50)} ${location}`);
    }
    lines.push('\nUse /skill-name to invoke a skill');
    return lines.join('\n');
  }

  getSkillCreatorTemplate(): string {
    return `# Skill Creator

You are a skill creation assistant. Your task is to help users create new skills for TOD.

A skill is a reusable instruction set that can be invoked with a slash command like /skill-name.

## Skill Format

Skills are stored in SKILL.md files with the following structure:

\`\`\`markdown
# Skill Name

Brief description of what this skill does.

## Instructions

Detailed instructions for the AI on how to execute this skill.

## Examples

### Example 1
Input: user query
Output: expected behavior

### Example 2
Input: another query
Output: expected behavior
\`\`\`

## Rules

1. Skill names should be lowercase with hyphens (e.g., my-skill, code-review)
2. Instructions should be clear and specific
3. Include examples when possible
4. Keep skills focused on a single task
5. Use project skills for project-specific workflows
6. Use global skills for reusable workflows across projects

## Available Commands

When the user wants to create a skill:
1. Ask for the skill name
2. Ask for a brief description
3. Ask for the instructions/content
4. Ask if it should be global or project-specific
5. Create the skill file

When the user wants to list skills:
- Show all available skills with their locations

When the user wants to delete a skill:
- Confirm the deletion
- Remove the skill file and directory
`;
  }

  createExampleSkills(): void {
    // Create skill-creator skill globally
    const skillCreatorContent = this.getSkillCreatorTemplate();
    this.createSkill('skill-creator', skillCreatorContent, true);
  }
}

export const skillsManager = new SkillsManager();
