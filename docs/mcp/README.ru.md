# MCP (Model Context Protocol)

MCP позволяет TOD подключаться к внешним инструментам и сервисам, расширяя его возможности за пределы встроенных функций.

## Что такое MCP?

Model Context Protocol (MCP) — это открытый протокол, который позволяет ИИ-ассистентам подключаться к внешним источникам данных и инструментам. С помощью MCP TOD может:

- Доступ к базам данных
- Запрашивать API
- Читать файлы из различных источников
- Выполнять пользовательские команды
- И многое другое

## Конфигурация

MCP-серверы настраиваются в файле `~/.tod/config.json`:

```json
{
  "mcpServers": {
    "server-name": {
      "type": "stdio",
      "command": "command-to-run",
      "args": ["arg1", "arg2"],
      "env": {
        "KEY": "value"
      },
      "enabled": true
    }
  }
}
```

## Типы серверов

### STDIO серверы

Локальные серверы, которые общаются через стандартный ввод/вывод:

```json
{
  "mcpServers": {
    "filesystem": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/dir"],
      "enabled": true
    }
  }
}
```

### Удаленные (HTTP) серверы

Удаленные серверы, доступные через HTTP:

```json
{
  "mcpServers": {
    "remote-api": {
      "type": "remote",
      "url": "https://api.example.com/mcp",
      "headers": {
        "Authorization": "Bearer token"
      },
      "enabled": true
    }
  }
}
```

## Примеры конфигураций

### Доступ к файловой системе

```json
{
  "mcpServers": {
    "filesystem": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home/user/projects"],
      "enabled": true
    }
  }
}
```

### Интеграция с GitHub

```json
{
  "mcpServers": {
    "github": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "your-token-here"
      },
      "enabled": true
    }
  }
}
```

### База данных PostgreSQL

```json
{
  "mcpServers": {
    "postgres": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres", "postgresql://localhost/mydb"],
      "enabled": true
    }
  }
}
```

## Управление MCP серверами

Используйте команду `/mcp` в TOD, чтобы увидеть статус всех подключенных MCP серверов:

```
> /mcp
MCP Servers:
  ● filesystem           connected (5 tools)
  ● github               connected (8 tools)
  ○ postgres             connecting (0 tools)
```

## Устранение неполадок

Если MCP сервер не подключается:

1. Проверьте, что сервер установлен: `npx -y @modelcontextprotocol/server-name --help`
2. Проверьте конфигурацию в файле `~/.tod/config.json`
3. Проверьте логи TOD на наличие сообщений об ошибках
4. Убедитесь, что установлены необходимые переменные окружения

## Доступные MCP серверы

Популярные MCP серверы, которые вы можете использовать:

- `@modelcontextprotocol/server-filesystem` — Доступ к файловой системе
- `@modelcontextprotocol/server-github` — Интеграция с GitHub API
- `@modelcontextprotocol/server-postgres` — Доступ к базе данных PostgreSQL
- `@modelcontextprotocol/server-sqlite` — Доступ к базе данных SQLite
- `@modelcontextprotocol/server-puppeteer` — Автоматизация веб-браузера

Для полного списка посетите: https://github.com/modelcontextprotocol/servers
