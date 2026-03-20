import { randomUUID } from 'node:crypto';
import * as http from 'node:http';
import Fastify, { type FastifyInstance } from 'fastify';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { InMemoryEventStore } from '@modelcontextprotocol/sdk/examples/shared/inMemoryEventStore.js';
import { createMcpServer } from '../mcp/serverFactory.js';
import { logger } from '../utils/logger.js';

const transports: Record<string, StreamableHTTPServerTransport> = {};

function sessionIdFromHeader(value: string | string[] | undefined): string | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

export async function createHttpServer(
  _port: number
): Promise<FastifyInstance<http.Server, http.IncomingMessage, http.ServerResponse>> {
  const app = Fastify<http.Server>({ logger: true });

  const scopesSupported = [
    'market:read',
    'fundamentals:read',
    'technicals:read',
    'mf:read',
    'news:read',
    'filings:read',
    'filings:deep',
    'macro:read',
    'macro:historical',
    'research:generate',
    'watchlist:read',
    'watchlist:write',
    'portfolio:read',
    'portfolio:write',
  ];

  app.get('/.well-known/oauth-protected-resource', async () => {
    const authServerUrl = process.env.AUTH_SERVER_URL || 'http://localhost:8080/realms/finance';
    return {
      issuer: authServerUrl,
      scopes_supported: scopesSupported,
      authorization_endpoint: `${authServerUrl}/protocol/openid-connect/auth`,
      token_endpoint: `${authServerUrl}/protocol/openid-connect/token`,
    };
  });

  app.get('/health', async () => ({ status: 'ok' }));

  app.post('/mcp', async (request, reply) => {
    const sessionId = sessionIdFromHeader(request.headers['mcp-session-id']);
    const body = request.body;

    try {
      let transport: StreamableHTTPServerTransport | undefined;

      if (sessionId && transports[sessionId]) {
        transport = transports[sessionId];
      } else if (!sessionId && isInitializeRequest(body)) {
        reply.hijack();
        const eventStore = new InMemoryEventStore();
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          eventStore,
          onsessioninitialized: (sid) => {
            transports[sid] = transport!;
          },
        });
        transport.onclose = () => {
          const sid = transport!.sessionId;
          if (sid && transports[sid]) {
            delete transports[sid];
          }
        };
        const server = createMcpServer();
        await server.connect(transport);
        await transport.handleRequest(request.raw, reply.raw, body);
        return;
      } else {
        return reply.code(400).send({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Bad Request: No valid session ID provided',
          },
          id: null,
        });
      }

      reply.hijack();
      await transport.handleRequest(request.raw, reply.raw, body);
    } catch (err) {
      logger.error({ err }, 'MCP POST error');
      if (!reply.raw.headersSent) {
        return reply.code(500).send({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
          },
          id: null,
        });
      }
    }
  });

  app.get('/mcp', async (request, reply) => {
    const sessionId = sessionIdFromHeader(request.headers['mcp-session-id']);
    if (!sessionId || !transports[sessionId]) {
      return reply.code(400).send('Invalid or missing session ID');
    }
    reply.hijack();
    await transports[sessionId].handleRequest(request.raw, reply.raw);
  });

  app.delete('/mcp', async (request, reply) => {
    const sessionId = sessionIdFromHeader(request.headers['mcp-session-id']);
    if (!sessionId || !transports[sessionId]) {
      return reply.code(400).send('Invalid or missing session ID');
    }
    reply.hijack();
    try {
      await transports[sessionId].handleRequest(request.raw, reply.raw);
    } catch (err) {
      logger.error({ err }, 'MCP DELETE error');
      if (!reply.raw.headersSent) {
        reply.raw.statusCode = 500;
        reply.raw.end('Error processing session termination');
      }
    }
  });

  return app;
}
