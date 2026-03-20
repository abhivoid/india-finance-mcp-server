import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerPingTool } from '../tools/ping.js';

export function createMcpServer(): McpServer {
  const server = new McpServer(
    { name: 'india-finance-mcp', version: '1.0.0' },
    { capabilities: { tools: {}, resources: {}, prompts: {} } }
  );
  registerPingTool(server);
  return server;
}
