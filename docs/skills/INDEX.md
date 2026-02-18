# Skills Documentation

Documentation available in multiple languages:

- [English](README.md)
- [Русский](README.ru.md)
- [Deutsch](README.de.md)
- [Français](README.fr.md)

---

## Quick Links

- [What are Skills?](README.md#what-are-skills)
- [Quick Start](README.md#quick-start)
- [Creating Skills](README.md#creating-your-first-skill)
- [Skill Format](README.md#skill-format)
- [Best Practices](README.md#best-practices)

## Creating Skills with AI

TOD includes a built-in `skill-creator` skill that helps you create new skills:

```
> /skill-creator
```

This skill will guide you through:
1. Naming your skill
2. Defining what it does
3. Writing instructions
4. Choosing location (global or project)

## Example Skills

TOD comes with example skills in `~/.tod/skills/`:

- **skill-creator** — Helps create new skills
- **commit** — Creates conventional commit messages

## Skill Locations

- **Global**: `~/.tod/skills/` — Available in all projects
- **Project**: `.tod/skills/` — Specific to current project

Project skills override global skills with the same name.
