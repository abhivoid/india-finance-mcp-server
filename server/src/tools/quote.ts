import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { getStockQuote } from '../services/nse.js';
import { logger } from '../utils/logger.js';

const MARKET_READ = 'market:read';

type ToolExtra = { authInfo?: AuthInfo };

export function registerQuoteTool(server: McpServer): void {
  const register = server.registerTool.bind(server) as (
    name: string,
    config: { description: string; inputSchema: { symbol: z.ZodString } },
    handler: (args: { symbol: string }, extra: ToolExtra) => Promise<unknown>
  ) => void;

  register(
    'get_stock_quote',
    {
      description: 'Get live/latest quote for an NSE-listed equity symbol',
      inputSchema: {
        symbol: z.string().describe('Stock symbol (e.g. RELIANCE, INFY)'),
      },
    },
    async ({ symbol }, extra) => {
      const scopes = extra.authInfo?.scopes ?? [];
      const sub = (extra.authInfo?.extra?.sub as string | undefined) ?? 'unknown';

      if (!extra.authInfo) {
        return {
          isError: true,
          content: [{ type: 'text', text: JSON.stringify({ error: 'unauthorized' }) }],
        };
      }

      if (!scopes.includes(MARKET_READ)) {
        logger.warn({ sub, tool: 'get_stock_quote' }, 'insufficient_scope');
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: 'insufficient_scope',
                required_scope: MARKET_READ,
              }),
            },
          ],
        };
      }

      logger.info({ tool: 'get_stock_quote', symbol, sub }, 'tool invocation');

      try {
        const quote = await getStockQuote(symbol);
        return {
          content: [{ type: 'text', text: JSON.stringify(quote, null, 2) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          isError: true,
          content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
        };
      }
    }
  );
}
