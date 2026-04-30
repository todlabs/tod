# TOD

**T**ool **o**f **D**ev

<p align="center">
  AI agent in your terminal. You type — it does.
</p>

<p align="center">
  <a href="https://github.com/todlabs/tod/releases">
    <img src="https://img.shields.io/github/v/release/todlabs/tod?style=flat-square&color=blue" alt="Version">
  </a>
  <a href="https://github.com/todlabs/tod/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/todlabs/tod?style=flat-square&color=green" alt="License">
  </a>
  <a href="https://bun.sh/">
    <img src="https://img.shields.io/badge/bun-%3E%3D1.0.0-brightgreen?style=flat-square&logo=bun" alt="Bun">
  </a>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> •
  <a href="#commands">Commands</a> •
  <a href="#why-not-just">Why not just...</a> •
  <a href="#mcp">MCP</a>
</p>

---

## The point

TOD is simple. Open terminal, type what you need, get it done. No subscriptions, no vendor lock-in. Your key — your model.

## Quick Start

```bash
git clone https://github.com/todlabs/tod.git
cd tod
bun install
bun run build
bun run start
```

First launch — TOD asks for provider and API key. That's it.

## Usage

```
> Create a React login component
> @src/utils.js rewrite with async/await
> /model
> /clear
```

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

Everything in `~/.tod/config.json`. Keys stay local, never sent anywhere.

```json
{
  "activeProvider": "openai",
  "providerConfigs": {
    "openai": {
      "apiKey": "sk-...",
      "model": "gpt-4o-mini"
    }
  }
}
```

Supported providers: Fireworks, OpenAI, Anthropic, OpenRouter — and any OpenAI-compatible API via custom baseURL.

## Why not just...

**Claude Code?** Locked to Anthropic. Paid subscription. TOD — any provider, your own key, no markup.

**OpenCode?** Go. Monolith. Harder to contribute. TOD — TypeScript, Bun, React Ink — familiar stack, readable code.

**Cursor/Windsurf?** Those are IDEs, not terminals. TOD lives where you work — in the terminal. Zero overhead.

Bottom line: TOD is just a tool. Not a product, not a service. Pick it up — use it.

## MCP

Model Context Protocol support — connect external tools and services.

- [English](docs/mcp/README.md)
- [Русский](docs/mcp/README.ru.md)
- [Deutsch](docs/mcp/README.de.md)
- [Français](docs/mcp/README.fr.md)

## Requirements

- Bun 1.0+
- API key from any supported provider

## License

MIT
