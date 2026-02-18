# Skills

Skills are reusable instruction sets that extend TOD's capabilities. They allow you to create custom workflows and prompts that can be invoked with a simple slash command.

## What are Skills?

Skills are like macros for AI-assisted development. Instead of typing the same instructions repeatedly, you create a skill once and invoke it with `/skill-name`.

## How Skills Work

1. **Create a skill** — Write instructions in a `SKILL.md` file
2. **Store it** — Place in `~/.tod/skills/` (global) or `.tod/skills/` (project-specific)
3. **Invoke it** — Type `/skill-name` in TOD
4. **TOD executes** — The skill's instructions guide the AI's response

## Quick Start

### Creating Your First Skill

1. Create a skill directory:
   ```bash
   mkdir -p ~/.tod/skills/my-skill
   ```

2. Create `SKILL.md`:
   ```markdown
   # My Skill
   
   Brief description of what this skill does.
   
   ## Instructions
   
   When this skill is invoked, follow these steps:
   1. Step one
   2. Step two
   3. Step three
   
   ## Examples
   
   ### Example 1
   User: /my-skill
   AI: [Expected behavior]
   ```

3. Use it in TOD:
   ```
   > /my-skill
   ```

## Skill Format

Skills are markdown files with this structure:

```markdown
# Skill Name

Brief description (shows in /skills list)

## Instructions

Detailed instructions for the AI.

## Examples

### Example 1
Input: user input
Output: expected output
```

## Skill Locations

### Global Skills
Stored in `~/.tod/skills/` and available in all projects:
```
~/.tod/skills/
  ├── commit/
  │   └── SKILL.md
  ├── review/
  │   └── SKILL.md
  └── test/
      └── SKILL.md
```

### Project Skills
Stored in `.tod/skills/` in your project root:
```
my-project/
  ├── .tod/
  │   └── skills/
  │       ├── deploy/
  │       │   └── SKILL.md
  │       └── release/
  │           └── SKILL.md
  └── src/
```

**Priority**: Project skills override global skills with the same name.

## Built-in Skills

TOD comes with example skills:

### skill-creator
Helps you create new skills:
```
> /skill-creator
```

### commit
Creates conventional commit messages:
```
> /commit
```

## Commands

| Command | Description |
|---------|-------------|
| `/skills` | List all available skills |
| `/skill-name` | Invoke a skill |

## Best Practices

1. **Keep skills focused** — One skill = one task
2. **Use clear names** — lowercase with hyphens: `code-review`, `git-commit`
3. **Write good descriptions** — First paragraph becomes the skill summary
4. **Include examples** — Show expected inputs and outputs
5. **Version control** — Commit project skills to git
6. **Share globally** — Put reusable skills in `~/.tod/skills/`

## Creating Skills with AI

Use the built-in `skill-creator` skill:

```
> /skill-creator
AI: What would you like to name your skill?
User: deploy-vercel
AI: What should this skill do?
User: Deploy the current project to Vercel
AI: [Creates skill file]
```

## Advanced Features

### Skill Arguments
Skills can accept arguments after the command:
```
> /commit fix authentication bug
```

### Skill Context
Skills have access to:
- Current directory contents
- Git status
- Environment variables
- Previous conversation context

## Troubleshooting

**Skill not found?**
- Check the skill name (case-sensitive)
- Verify the file is named `SKILL.md`
- Run `/skills` to see available skills

**Skill not working?**
- Check the markdown syntax
- Ensure instructions are clear and specific
- Look at example skills for reference

## Examples

See example skills in `~/.tod/skills/` or the [skills repository](https://github.com/todlabs/tod/tree/main/example-skills).
