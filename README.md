# TOD

**T**ool **o**f **D**ev

<p align="center">
  AI agent in your terminal. You type — it does.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@todlabs/tod">
    <img src="https://img.shields.io/npm/v/@todlabs/tod?style=flat-square&color=blue" alt="npm">
  </a>
  <a href="https://github.com/todlabs/tod/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/todlabs/tod?style=flat-square&color=green" alt="License">
  </a>
  <a href="https://bun.sh/">
    <img src="https://img.shields.io/badge/bun-%3E%3D1.0.0-brightgreen?style=flat-square&logo=bun" alt="Bun">
  </a>
</p>

<p align="center">
  <a href="#install">Install</a> •
  <a href="#commands">Commands</a> •
  <a href="#why-not-just">Why not just...</a> •
  <a href="#mcp">MCP</a>
</p>

---

## Install

```bash
# npm
npm i -g @todlabs/tod

# bun
bun i -g @todlabs/tod
```

Then run:

```bash
tod
```

First launch — TOD asks for provider and API key. That's it.

## Commands

| Command | What it does |
|---------|--------------|
| `/provider` | Pick provider & enter API key |
| `/model` | Switch model |
| `/thinking` | Show/hide model thinking |
| `/clear` | Clear history |
| `/compact` | Compress context |
| `/mcp` | Show MCP servers |
| `/help` | List commands |
| `/exit` | Exit |

Also works: `/providers`, `/models`.

## Config

`~/.tod/config.json` — keys stay local, never sent anywhere.

Supported providers: Fireworks, OpenAI, Anthropic, OpenRouter — and any OpenAI-compatible API via custom baseURL.

## Why not just...

**Claude Code?** Locked to Anthropic. Paid subscription. TOD — any provider, your own key, no markup.

**OpenCode?** Go. Monolith. Harder to contribute. TOD — TypeScript, Bun, React Ink — familiar stack, readable code.

**Cursor/Windsurf?** Those are IDEs, not terminals. TOD lives where you work — in the terminal. Zero overhead.

TOD is just a tool. Not a product, not a service. Pick it up — use it.

## MCP

Model Context Protocol support — connect external tools and services.

- [English](docs/mcp/README.md)
- [Русский](docs/mcp/README.ru.md)
- [Deutsch](docs/mcp/README.de.md)
- [Français](docs/mcp/README.fr.md)

## Requirements

- Bun 1.0+ or Node 18+
- API key from any supported provider

## License

MIT
