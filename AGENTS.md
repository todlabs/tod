# AGENTS — Project Instructions

## Project Overview

TOD (Tool of Dev) — AI coding agent in the terminal. Built with Bun, TypeScript, React Ink (TUI). Uses OpenAI-compatible API for LLM calls. Supports multiple providers (Fireworks, OpenAI, Anthropic, OpenRouter, etc.) and MCP (Model Context Protocol) for external tools.

## Build & Test

- **Build**: `bun run build` (runs `build.ts`, bundles via Bun bundler, outputs to `dist/index.js` with shebang)
- **Test**: `bun test` (uses `bun:test` runner; test file: `test/tools.test.ts`)
- **Dev**: `bun run --watch src/index.ts` (hot-reload dev mode)
- **Start**: `bun run dist/index.js` (after build)
- **Full test**: `bun run build && bun test` (this is the `test` script — always build first)
- **Type check**: `bunx tsc --noEmit` (strict mode in tsconfig)
- **No linting configured** — no ESLint/Prettier config found

## Code Style

- **Language**: TypeScript (strict mode, ES2022 target, ESM modules)
- **Runtime**: Bun (>=1.0) or Node 18+
- **UI Framework**: React 18 + Ink 5 (terminal UI)
- **Formatting**: No auto-formatter configured. Code uses 2-space indent, single quotes for strings, semicolons. Follow existing patterns.
- **JSX**: React JSX (`"jsx": "react-jsx"` in tsconfig)
- **Imports**: Always use `.js` extension in import paths (e.g., `import { Agent } from "./agent/index.js"`). This is required for ESM compatibility.
- **Type style**: Prefer inline types and interfaces. Use Zod for runtime validation of config schemas.
- **No decorators, no class properties** — simple TypeScript with interfaces and functions.

## Conventions

- **File naming**: Lowercase, kebab-case for files (e.g., `useMessageProcessing.ts`, `mcp-manager.ts`). PascalCase for React components (e.g., `App.tsx`, `Header.tsx`, `MessageList.tsx`).
- **Directory structure**:
  - `src/agent/` — Core agent logic (LLM client, message management, agent orchestration)
  - `src/core/` — Shared types and interfaces
  - `src/services/` — Config, providers, MCP, chat storage, logging, update checks
  - `src/tools/` — Tool definitions and execution (read_file, write_file, execute_shell, etc.)
  - `src/ui/` — React Ink UI components and hooks
  - `src/prompts/` — System prompt construction, AGENTS.md loading, project memory
  - `src/config/` — Experimental config (minimal)
  - `test/` — Test files (bun:test)
  - `docs/` — MCP documentation in multiple languages
  - `public/` — Static assets
- **Import style**: Always use `.js` extension. ESM only (`"type": "module"` in package.json). No `require()`.
- **Singleton pattern**: Services like `configService`, `logger` use singleton pattern (private constructor, `getInstance()`).
- **Error handling**: Try/catch in tool execution, graceful fallback for MCP, config parsing with Zod validation.
- **State management**: React hooks (`useState`, `useCallback`, `useRef`) — no Redux/Zustand.

## Important Files

- **Entry point**: `src/index.ts` — CLI argument parsing, config loading, MCP init, launches Ink UI or non-interactive mode
- **Build script**: `build.ts` — Bun bundler, creates single ESM output with shebang, stubs `react-devtools-core`
- **Agent core**: `src/agent/` — `agent.ts` (Agent class), `llm-client.ts`, `message-manager.ts`, `types.ts`
- **Tools**: `src/tools/index.ts` — Tool definitions, execution, diff computation. Tools: `read_file`, `write_file`, `execute_shell`, `list_directory`, `create_directory`, `remember`
- **Config**: `src/services/config.ts` — `ConfigService` singleton, Zod schemas, `~/.tod/config.json`
- **Providers**: `src/services/providers.ts` — Provider registry (Fireworks, Modal, NVIDIA, Air Force, SwiftRouter, AgentRouter, CanopyWave) + custom providers from config
- **MCP**: `src/services/mcp-manager.ts` — MCP server connection (stdio + remote), tool proxying
- **UI**: `src/ui/App.tsx` — Main React Ink component, menus, suggestions, commands
- **Commands**: `src/ui/commands.ts` — Slash commands (`/provider`, `/model`, `/clear`, `/compact`, `/resume`, `/init`, `/remember`, `/mcp`, `/help`, `/exit`)
- **System prompt**: `src/prompts/system.ts` — Constructs system prompt, reads AGENTS.md and project memory
- **Chat storage**: `src/services/chat-storage.ts` — Saves/loads chat sessions to `~/.tod/chats/`
- **Tests**: `test/tools.test.ts` — Tests for tool execution and diff computation

## Architecture

- **Agent loop**: User message → `agent.processMessage()` → LLM streaming → tool calls → LLM response → tool execution → repeat until done
- **Tool system**: 6 built-in tools + MCP tools. Tools return `ToolResult` with text and optional diff. `write_file` computes LCS diff.
- **Streaming**: LLM responses stream via `onChunk` callback. Thinking tokens are separated from assistant content.
- **MCP integration**: MCP tools are named `mcp__<server>__<tool>`. MCP server configs in `~/.tod/config.json`. Supports stdio and remote (HTTP) transports.
- **Chat persistence**: Each conversation saved to `~/.tod/chats/<id>.json`. Resume with `--resume <id>` or `/resume`.
- **Non-interactive mode**: `tod -p "prompt"` — runs single prompt, prints result to stdout, exits.
- **UI architecture**: Ink (React for terminal). Components: Header, MessageList, InputArea, StatusBar, WorkingIndicator. Hooks: `useMessageProcessing`, `useTerminalSize`.

## Custom Providers

Users can add any OpenAI-compatible API provider through `~/.tod/config.json` without modifying source code. Any provider ID that doesn't match a hardcoded provider and has a `baseURL` is treated as custom. Models are fetched dynamically from the provider's `/v1/models` endpoint.

Example config:
```json
{
  "providers": {
    "my-provider": {
      "apiKey": "sk-xxx",
      "baseURL": "https://api.example.com/v1",
      "model": "gpt-4o",
      "maxTokens": 16384,
      "temperature": 1,
      "headers": {}
    }
  }
}
```

**NEVER hardcode new providers into `providers.ts`** — that forces users to modify source code. Always use the config-based approach.

## Release Process

### Step-by-step

1. **Make changes** — edit code, fix bugs, add features
2. **Type check**: `bunx tsc --noEmit` — must pass with 0 errors
3. **Build**: `bun run build` — must succeed
4. **Test**: `bun test` — all tests must pass
5. **Bump version** in `package.json` (e.g. `"version": "1.6.1"`)
6. **Rebuild**: `bun run build` — rebuild so `dist/index.js` has the new version baked in (version is inlined from package.json at build time)
7. **Commit**: `git add` changed files, `git commit -m "feat: description"`
8. **Push**: `git push origin main`
9. **Tag**: `git tag v1.6.1 && git push origin v1.6.1`
10. **Create GitHub release**: use `gh release create` (see format below)
11. **npm publish happens automatically** via CI workflow on tag push (requires `NPM_TOKEN` secret)
12. **Update locally**: `bun i -g @todlabs/tod@latest` or `npm i -g @todlabs/tod@latest`

### Release command template

```bash
gh release create vX.Y.Z \
  dist/index.js \
  package.json \
  --title "vX.Y.Z" \
  --notes "$(cat <<'EOF'
## Install

\`\`\`bash
npm i -g @todlabs/tod
# or
bun i -g @todlabs/tod
\`\`\`

Then just run `tod`.

## What changed

- **Feature name** — description of what it does
- **Another change** — description
EOF
)"
```

### Release notes style

Follow the pattern of previous releases:
- Start with install instructions (npm/bun)
- "## What changed" section with bullet points
- Each bullet: **bold feature name** — description
- Keep it concise, user-facing, no internal details

### CI workflows

- **ci.yml** — runs on push to main and on tags `v*`. Lints, type-checks, builds, tests. On tag push, also creates/updates GitHub Release with `dist/**` assets.
- **npm-publish.yml** — runs on tag push `v*`. Publishes to npm (requires `NPM_TOKEN` secret in repo settings).

### Important

- **Version is inlined at build time** — `import { version } from "../package.json"` in `src/index.ts` gets baked into `dist/index.js` by Bun bundler. Always rebuild after bumping version.
- **Tag must match `package.json` version** — tag `v1.6.1` must match `"version": "1.6.1"`
- **Don't create releases before pushing the tag** — CI's `softprops/action-gh-release@v2` will update an existing release if one already exists (e.g. created manually via `gh`), but it's cleaner to let CI handle it OR do it manually. Don't do both.
- **`dist/` is in `.gitignore`** — build output is never committed. It's attached to GitHub Release as an asset.

## Gotchas

- **Import extensions**: Always use `.js` in import paths (e.g., `./agent/index.js`), not `.ts`. TypeScript compiles to ESM and `.js` extension is required.
- **react-devtools-core stub**: Build creates a stub for `react-devtools-core` in `dist/node_modules/` because Ink has it as optional dependency. Don't remove this from `build.ts`.
- **Shebang**: Build script prepends `#!/usr/bin/env node` to the output. The compiled JS runs as a Node/Bun script.
- **No runtime dependencies**: All deps are devDependencies. Everything is bundled into `dist/index.js`. `node_modules` not needed at runtime.
- **Config location**: `~/.tod/config.json` — not in project directory. Chat storage in `~/.tod/chats/`. Memory in `.tod/memory.md` in project root.
- **Logger disabled by default**: `enabled = false` in Logger class. Only logs in development mode.
- **Tool execution timeout**: `execute_shell` has 120s timeout and 10MB buffer.
- **Diff algorithm**: LCS-based diff in `computeDiff()` — O(m*n) space, fine for typical files. Only shows 3 context lines around changes.
- **Agent busy state**: `agent.isBusy()` / `agent.forceUnstick()` — agent can get stuck if error during tool execution. UI handles this with force-unstick.
- **Auto-compact**: Optional feature (off by default). When context reaches 80% of model's max context, auto-compacts conversation.
- **MCP tool naming**: MCP tools are prefixed with `mcp__<serverName>__<toolName>`. Regular tools have no prefix.
- **Provider env vars**: `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`, `MAX_TOKENS`, `TEMPERATURE` override config file values.
- **Chat IDs**: Generated from `Date.now().toString(36)` + random suffix. Resume hint shown on exit.
