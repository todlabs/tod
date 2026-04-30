# TOD

**T**ool **o**f **D**ev

<p align="center">
  <img src="public/preview.png" alt="TOD Preview" width="600">
</p>

<p align="center">
  AI-агент в твоём терминале. Пишешь — он делает.
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

## Суть

TOD — это просто. Открываешь терминал, пишешь что надо, получаешь результат. Никаких подписок, никаких привязок к одному провайдеру. Твой ключ — твоя модель.

## Quick Start

```bash
git clone https://github.com/todlabs/tod.git
cd tod
bun install
bun run build
bun run start
```

Первый запуск — TOD сам спросит провайдера и ключ. Всё.

## Использование

```
> Сделай компонент логина на React
> @src/utils.js перепиши на async/await
> /model
> /clear
```

## Команды

| Команда | Что делает |
|---------|------------|
| `/provider` | Выбрать провайдера и ввести API ключ |
| `/model` | Сменить модель |
| `/thinking` | Показать/скрыть размышления модели |
| `/clear` | Очистить историю |
| `/compact` | Сжать контекст |
| `/mcp` | Показать MCP серверы |
| `/help` | Список команд |
| `/exit` | Выйти |

Тоже самое: `/providers`, `/models`.

## Конфиг

Всё в `~/.tod/config.json`. Ключи хранятся локально, никуда не уходят.

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

Поддерживаемые провайдеры: Fireworks, OpenAI, Anthropic, OpenRouter — и любой OpenAI-совместимый API через кастомный baseURL.

## Why not just...

**Claude Code?** Привязан к Anthropic. Платная подписка. TOD — любой провайдер, свой ключ, без переплат.

**OpenCode?** Go. Монолит. Сложнее контрибьютить. TOD — TypeScript, Bun, React Ink — стек понятный, код читаемый.

**Cursor/Windsurf?** Это IDE, не терминал. TOD живёт там, где ты работаешь — в терминале. Без оверхеда.

По сути: TOD — это просто инструмент. Не продукт, не сервис. Берёшь — пользуешься.

## MCP

Поддержка Model Context Protocol — подключай внешние инструменты и сервисы.

- [English](docs/mcp/README.md)
- [Русский](docs/mcp/README.ru.md)
- [Deutsch](docs/mcp/README.de.md)
- [Français](docs/mcp/README.fr.md)

## Требования

- Bun 1.0+
- API ключ любого поддерживаемого провайдера

## License

MIT
