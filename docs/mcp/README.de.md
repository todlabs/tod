# MCP (Model Context Protocol)

MCP ermöglicht es TOD, sich mit externen Tools und Diensten zu verbinden und seine Fähigkeiten über die integrierten Funktionen hinaus zu erweitern.

## Was ist MCP?

Model Context Protocol (MCP) ist ein offenes Protokoll, das KI-Assistenten ermöglicht, sich mit externen Datenquellen und Tools zu verbinden. Mit MCP kann TOD:

- Auf Datenbanken zugreifen
- APIs abfragen
- Dateien aus verschiedenen Quellen lesen
- Benutzerdefinierte Befehle ausführen
- Und vieles mehr

## Konfiguration

MCP-Server werden in `~/.tod/config.json` konfiguriert:

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

## Server-Typen

### STDIO-Server

Lokale Server, die über Standard-Ein-/Ausgabe kommunizieren:

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

### Remote (HTTP) Server

Remote-Server, die über HTTP erreichbar sind:

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

## Beispielkonfigurationen

### Dateisystemzugriff

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

### GitHub-Integration

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

### PostgreSQL-Datenbank

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

## MCP-Server verwalten

Verwenden Sie den Befehl `/mcp` in TOD, um den Status aller verbundenen MCP-Server zu sehen:

```
> /mcp
MCP Servers:
  ● filesystem           connected (5 tools)
  ● github               connected (8 tools)
  ○ postgres             connecting (0 tools)
```

## Fehlerbehebung

Wenn ein MCP-Server keine Verbindung herstellen kann:

1. Prüfen Sie, ob der Server installiert ist: `npx -y @modelcontextprotocol/server-name --help`
2. Überprüfen Sie die Konfiguration in `~/.tod/config.json`
3. Prüfen Sie die TOD-Logs auf Fehlermeldungen
4. Stellen Sie sicher, dass die erforderlichen Umgebungsvariablen gesetzt sind

## Verfügbare MCP-Server

Beliebte MCP-Server, die Sie verwenden können:

- `@modelcontextprotocol/server-filesystem` — Dateisystemzugriff
- `@modelcontextprotocol/server-github` — GitHub API-Integration
- `@modelcontextprotocol/server-postgres` — PostgreSQL-Datenbankzugriff
- `@modelcontextprotocol/server-sqlite` — SQLite-Datenbankzugriff
- `@modelcontextprotocol/server-puppeteer` — Web-Browser-Automatisierung

Für eine vollständige Liste besuchen Sie: https://github.com/modelcontextprotocol/servers
