import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerPingTool(server: McpServer): void {
  server.registerTool(
    'ping',
    {
      description: 'A simple test tool',
    },
    async () => ({
      content: [
        {
          type: 'text',
          text: JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }),
        },
      ],
    })
  );
}
