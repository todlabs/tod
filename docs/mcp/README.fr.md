# MCP (Model Context Protocol)

MCP permet à TOD de se connecter à des outils et services externes, étendant ses capacités au-delà des fonctionnalités intégrées.

## Qu'est-ce que MCP?

Model Context Protocol (MCP) est un protocole ouvert qui permet aux assistants IA de se connecter à des sources de données externes et des outils. Avec MCP, TOD peut:

- Accéder aux bases de données
- Interroger des APIs
- Lire des fichiers de diverses sources
- Exécuter des commandes personnalisées
- Et bien plus encore

## Configuration

Les serveurs MCP sont configurés dans `~/.tod/config.json`:

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

## Types de serveurs

### Serveurs STDIO

Serveurs locaux qui communiquent via l'entrée/sortie standard:

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

### Serveurs distants (HTTP)

Serveurs distants accessibles via HTTP:

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

## Exemples de configurations

### Accès au système de fichiers

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

### Intégration GitHub

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

### Base de données PostgreSQL

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

## Gestion des serveurs MCP

Utilisez la commande `/mcp` dans TOD pour voir le statut de tous les serveurs MCP connectés:

```
> /mcp
MCP Servers:
  ● filesystem           connected (5 tools)
  ● github               connected (8 tools)
  ○ postgres             connecting (0 tools)
```

## Dépannage

Si un serveur MCP ne parvient pas à se connecter:

1. Vérifiez que le serveur est installé: `npx -y @modelcontextprotocol/server-name --help`
2. Vérifiez la configuration dans `~/.tod/config.json`
3. Consultez les logs TOD pour les messages d'erreur
4. Assurez-vous que les variables d'environnement requises sont définies

## Serveurs MCP disponibles

Serveurs MCP populaires que vous pouvez utiliser:

- `@modelcontextprotocol/server-filesystem` — Accès au système de fichiers
- `@modelcontextprotocol/server-github` — Intégration API GitHub
- `@modelcontextprotocol/server-postgres` — Accès base de données PostgreSQL
- `@modelcontextprotocol/server-sqlite` — Accès base de données SQLite
- `@modelcontextprotocol/server-puppeteer` — Automatisation navigateur web

Pour une liste complète, visitez: https://github.com/modelcontextprotocol/servers
