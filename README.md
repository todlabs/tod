# TOD

<p align="center">
  <img src="public/preview.png" alt="TOD Preview" width="600">
</p>

<p align="center">
  <b>An AI agent that lives in your terminal and codes for you.</b>
</p>

<p align="center">
  <a href="https://github.com/todlabs/tod/releases">
    <img src="https://img.shields.io/github/v/release/todlabs/tod?style=flat-square&color=blue" alt="Version">
  </a>
  <a href="https://github.com/todlabs/tod/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/todlabs/tod?style=flat-square&color=green" alt="License">
  </a>
  <a href="https://nodejs.org/">
    <img src="https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen?style=flat-square&logo=node.js" alt="Node Version">
  </a>
  <a href="https://github.com/todlabs/tod/actions">
    <img src="https://img.shields.io/github/actions/workflow/status/todlabs/tod/ci.yml?style=flat-square&label=ci" alt="CI Status">
  </a>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#installation">Installation</a> •
  <a href="#usage">Usage</a> •
  <a href="#configuration">Configuration</a> •
  <a href="#commands">Commands</a>
</p>

---

## Features

- **Natural language commands** — Just describe what you want in plain English
- **File @-mentions** — Reference files with `@filename` for context-aware responses
- **Slash commands** — Quick access with `/providers`, `/models`, `/clear`, and more
- **Background tasks** — Execute long-running operations without blocking your workflow
- **Multi-provider support** — Works with OpenAI, Anthropic, and other LLM providers
- **Terminal-native** — Built with React + Ink for a smooth TUI experience

## Installation

```bash
npm install -g tod
```

Or run directly with npx:

```bash
npx tod
```

## Usage

Start TOD in your project directory:

```bash
tod
```

Then just type what you need:

```
> Create a React component for a login form
> @src/utils.js refactor this to use async/await
> /clear
```

## Configuration

TOD stores config in `~/.tod/config.json`:

```json
{
  "provider": "openai",
  "model": "gpt-4",
  "apiKey": "your-api-key"
}
```

Or use the interactive menu: `/providers`

## Commands

| Command | Description |
|---------|-------------|
| `/providers` | Select LLM provider |
| `/models` | Select model |
| `/thinking` | Toggle thinking display |
| `/clear` | Clear conversation history |
| `/compact` | Compress context |
| `/tasks` | Show background tasks |
| `/mcp` | Show active MCP servers |
| `/exit` | Exit TOD |

## Development

```bash
# Clone
git clone https://github.com/todlabs/tod.git
cd tod

# Install dependencies
npm install

# Build
npm run build

# Run in dev mode
npm run dev
```

## Requirements

- Node.js 18+
- API key for your chosen LLM provider

## License

MIT
