# MCP (Model Context Protocol)

MCP allows TOD to connect to external tools and services, extending its capabilities beyond the built-in features.

## What is MCP?

Model Context Protocol (MCP) is an open protocol that enables AI assistants to connect to external data sources and tools. With MCP, TOD can:

- Access databases
- Query APIs
- Read files from various sources
- Execute custom commands
- And much more

## Configuration

MCP servers are configured in `~/.tod/config.json`:

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

## Server Types

### STDIO Servers

Local servers that communicate via standard input/output:

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

### Remote (HTTP) Servers

Remote servers accessible via HTTP:

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

## Example Configurations

### Filesystem Access

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

### GitHub Integration

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

### PostgreSQL Database

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

## Managing MCP Servers

Use the `/mcp` command in TOD to see the status of all connected MCP servers:

```
> /mcp
MCP Servers:
  ● filesystem           connected (5 tools)
  ● github               connected (8 tools)
  ○ postgres             connecting (0 tools)
```

## Troubleshooting

If an MCP server fails to connect:

1. Check the server is installed: `npx -y @modelcontextprotocol/server-name --help`
2. Verify the configuration in `~/.tod/config.json`
3. Check TOD logs for error messages
4. Ensure required environment variables are set

## Available MCP Servers

Popular MCP servers you can use:

- `@modelcontextprotocol/server-filesystem` — File system access
- `@modelcontextprotocol/server-github` — GitHub API integration
- `@modelcontextprotocol/server-postgres` — PostgreSQL database access
- `@modelcontextprotocol/server-sqlite` — SQLite database access
- `@modelcontextprotocol/server-puppeteer` — Web browser automation

For a complete list, visit: https://github.com/modelcontextprotocol/servers
