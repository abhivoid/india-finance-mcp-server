import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerPingTool } from '../tools/ping.js';
import { registerQuoteTool } from '../tools/quote.js';

export function createMcpServer(): McpServer {
  // Only advertise what we implement. Empty `resources` / `prompts` objects still tell
  // clients those features exist, so Cursor calls resources/list & prompts/list → -32601.
  const server = new McpServer(
    { name: 'india-finance-mcp', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );
  registerPingTool(server);
  registerQuoteTool(server);
  return server;
}
