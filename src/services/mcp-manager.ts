import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import type { McpServerConfig } from './config.js';
import { logger } from './logger.js';

export interface McpStatus {
  name: string;
  status: 'connected' | 'error' | 'connecting';
  toolCount: number;
  error?: string;
}

interface McpConnection {
  client: Client;
  transport: Transport;
  tools: ChatCompletionTool[];
  status: McpStatus;
}

export class McpManager {
  private connections = new Map<string, McpConnection>();

  async connectAll(servers: Record<string, McpServerConfig>): Promise<void> {
    const entries = Object.entries(servers).filter(([, config]) => config.enabled !== false);
    if (entries.length === 0) return;

    const results = await Promise.allSettled(
      entries.map(([name, config]) => this.connectServer(name, config))
    );

    for (let i = 0; i < entries.length; i++) {
      const [name] = entries[i];
      const result = results[i];
      if (result.status === 'rejected') {
        logger.error(`MCP server "${name}" failed to connect`, { error: result.reason });
      }
    }
  }

  private createTransport(config: McpServerConfig): Transport {
    if (config.type === 'remote') {
      return new StreamableHTTPClientTransport(
        new URL(config.url),
        config.headers ? { requestInit: { headers: config.headers } } : undefined
      );
    }

    // stdio (default)
    return new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: config.env ? { ...process.env as Record<string, string>, ...config.env } : undefined,
      stderr: 'pipe',
    });
  }

  private async connectServer(name: string, config: McpServerConfig): Promise<void> {
    const status: McpStatus = { name, status: 'connecting', toolCount: 0 };

    try {
      const transport = this.createTransport(config);

      const client = new Client(
        { name: 'tod', version: '1.1.0' },
        { capabilities: {} }
      );

      await client.connect(transport);

      const { tools: mcpTools } = await client.listTools();

      const openaiTools: ChatCompletionTool[] = mcpTools.map(tool => ({
        type: 'function' as const,
        function: {
          name: `mcp__${name}__${tool.name}`,
          description: tool.description || `MCP tool from ${name}`,
          parameters: tool.inputSchema as Record<string, unknown>,
        },
      }));

      status.status = 'connected';
      status.toolCount = openaiTools.length;

      this.connections.set(name, { client, transport, tools: openaiTools, status });
      logger.info(`MCP server "${name}" connected`, { toolCount: openaiTools.length });
    } catch (error) {
      status.status = 'error';
      status.error = error instanceof Error ? error.message : String(error);

      this.connections.set(name, {
        client: null as any,
        transport: null as any,
        tools: [],
        status,
      });

      logger.error(`MCP server "${name}" connection failed`, { error: status.error });
    }
  }

  getTools(): ChatCompletionTool[] {
    const allTools: ChatCompletionTool[] = [];
    for (const conn of this.connections.values()) {
      allTools.push(...conn.tools);
    }
    return allTools;
  }

  isMcpTool(toolName: string): boolean {
    return toolName.startsWith('mcp__');
  }

  parseMcpToolName(prefixedName: string): { serverName: string; toolName: string } | null {
    const match = prefixedName.match(/^mcp__([^_]+)__(.+)$/);
    if (!match) return null;
    return { serverName: match[1], toolName: match[2] };
  }

  async callTool(prefixedName: string, args: Record<string, unknown>): Promise<string> {
    const parsed = this.parseMcpToolName(prefixedName);
    if (!parsed) throw new Error(`Invalid MCP tool name: ${prefixedName}`);

    const conn = this.connections.get(parsed.serverName);
    if (!conn || conn.status.status !== 'connected') {
      throw new Error(`MCP server "${parsed.serverName}" is not connected`);
    }

    const result = await conn.client.callTool({ name: parsed.toolName, arguments: args });

    // Extract text content from MCP result
    if (result.content && Array.isArray(result.content)) {
      return result.content
        .map((item: any) => {
          if (item.type === 'text') return item.text;
          if (item.type === 'image') return `[image: ${item.mimeType}]`;
          if (item.type === 'resource') return item.resource?.text || '[resource]';
          return JSON.stringify(item);
        })
        .join('\n');
    }

    return JSON.stringify(result);
  }

  getStatus(): McpStatus[] {
    return Array.from(this.connections.values()).map(c => c.status);
  }

  getStatusSummary(): { connected: number; total: number } {
    const statuses = this.getStatus();
    return {
      connected: statuses.filter(s => s.status === 'connected').length,
      total: statuses.length,
    };
  }

  getToolDescriptions(): string {
    const lines: string[] = [];
    for (const [name, conn] of this.connections) {
      if (conn.status.status !== 'connected') continue;
      lines.push(`MCP Server "${name}":`);
      for (const tool of conn.tools) {
        const desc = tool.function.description || '';
        lines.push(`  - ${tool.function.name}: ${desc}`);
      }
    }
    return lines.join('\n');
  }

  async shutdown(): Promise<void> {
    for (const [name, conn] of this.connections) {
      try {
        if (conn.transport) {
          await conn.transport.close();
        }
      } catch (error) {
        logger.error(`Failed to close MCP server "${name}"`, { error });
      }
    }
    this.connections.clear();
  }
}
