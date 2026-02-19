import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { SkillsManager } from '../dist/services/skills.js';

function mkSkill(base, name, content) {
  const dir = path.join(base, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), content, 'utf8');
}

test('parses frontmatter and args rendering', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tod-skills-'));
  const globalDir = path.join(root, 'global');
  const projectDir = path.join(root, 'project');
  fs.mkdirSync(globalDir, { recursive: true });
  fs.mkdirSync(projectDir, { recursive: true });

  mkSkill(projectDir, 'deploy', `---
name: deploy
description: Deploy app safely
disable-model-invocation: true
user-invocable: true
---
Deploy $1 to $2\nArgs: $ARGUMENTS`);

  const sm = new SkillsManager({ globalSkillsPath: globalDir, projectSkillsPath: projectDir });
  const skill = sm.loadSkill('deploy');
  assert.ok(skill);
  assert.equal(skill.frontmatter['disable-model-invocation'], true);
  assert.equal(skill.description, 'Deploy app safely');

  const rendered = sm.renderSkillInstructions(skill, 'staging eu-west-1');
  assert.match(rendered, /Deploy staging to eu-west-1/);
  assert.match(rendered, /Args: staging eu-west-1/);
});

test('project skill overrides global skill with same name', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tod-skills-'));
  const globalDir = path.join(root, 'global');
  const projectDir = path.join(root, 'project');
  fs.mkdirSync(globalDir, { recursive: true });
  fs.mkdirSync(projectDir, { recursive: true });

  mkSkill(globalDir, 'lint', 'Global lint skill');
  mkSkill(projectDir, 'lint', 'Project lint skill');

  const sm = new SkillsManager({ globalSkillsPath: globalDir, projectSkillsPath: projectDir });
  const skill = sm.loadSkill('lint');
  assert.ok(skill);
  assert.equal(skill.isGlobal, false);
  assert.match(skill.body, /Project lint skill/);
});

test('listInvocableSkills excludes user-invocable:false', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tod-skills-'));
  const globalDir = path.join(root, 'global');
  const projectDir = path.join(root, 'project');
  fs.mkdirSync(globalDir, { recursive: true });
  fs.mkdirSync(projectDir, { recursive: true });

  mkSkill(projectDir, 'internal-memory', `---
name: internal-memory
user-invocable: false
---
Internal helper`);
  mkSkill(projectDir, 'review', 'Review code changes');

  const sm = new SkillsManager({ globalSkillsPath: globalDir, projectSkillsPath: projectDir });
  const names = sm.listInvocableSkills().map(s => s.name);
  assert.deepEqual(names, ['review']);
});
