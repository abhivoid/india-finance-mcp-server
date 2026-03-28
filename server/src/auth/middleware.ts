import type { IncomingMessage } from 'node:http';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { verifyToken } from './jwt.js';
import { audienceMatchesClient, rolesToTier, tierScopes } from './tiers.js';
import {
  getOAuthProtectedResourceMetadataUrl,
  oauthProtectedResourceLinkHeader,
} from './resourceMetadata.js';
import { logger } from '../utils/logger.js';

const MIN_SCOPE = 'market:read';

// JSON-RPC auth error codes (application-defined range below -32000)
const JSONRPC_UNAUTHORIZED = -32_001;
const JSONRPC_FORBIDDEN = -32_003;

function publicPath(pathname: string): boolean {
  return pathname === '/health' || pathname === '/.well-known/oauth-protected-resource';
}

function resourceMetadataHeader(): string {
  const url = getOAuthProtectedResourceMetadataUrl();
  return `Bearer realm="mcp", resource_metadata="${url}"`;
}

/**
 * Returns a JSON-RPC 2.0 error body.
 * Using JSON-RPC format for HTTP 401/403 lets strict MCP clients (Cursor)
 * parse the body without a Zod `invalid_union` failure.
 * The HTTP status + WWW-Authenticate header remain the authoritative OAuth signals.
 */
function jsonRpcAuthError(
  code: number,
  message: string
): { jsonrpc: '2.0'; id: null; error: { code: number; message: string } } {
  return { jsonrpc: '2.0', id: null, error: { code, message } };
}

function attachMcpAuth(req: IncomingMessage, info: AuthInfo): void {
  const extended = req as IncomingMessage & { auth?: AuthInfo };
  extended.auth = info;
}

/**
 * Runs auth for MCP routes. Sets `request.user` and `request.raw.auth` for the MCP transport.
 * Returns true if the reply was already sent (caller should stop).
 */
export async function runMcpAuth(request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  const pathname = request.url.split('?')[0] ?? request.url;
  if (publicPath(pathname)) {
    return false;
  }
  if (!pathname.startsWith('/mcp')) {
    return false;
  }

  // CORS preflight / probes must not require a Bearer token (avoids non–JSON-RPC 401 bodies on OPTIONS).
  if (request.method === 'OPTIONS' || request.method === 'HEAD') {
    return false;
  }

  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    await reply
      .status(401)
      .type('application/json')
      .header('WWW-Authenticate', resourceMetadataHeader())
      .header('Link', oauthProtectedResourceLinkHeader())
      .send(jsonRpcAuthError(JSONRPC_UNAUTHORIZED, 'Unauthorized: Bearer token required'));
    return true;
  }

  const token = authHeader.slice(7).trim();
  const clientId = process.env.OAUTH_CLIENT_ID || 'mcp-client';

  try {
    const decoded = await verifyToken(token);

    if (!audienceMatchesClient(decoded, clientId)) {
      await reply
        .status(401)
        .type('application/json')
        .header('WWW-Authenticate', resourceMetadataHeader())
        .header('Link', oauthProtectedResourceLinkHeader())
        .send(jsonRpcAuthError(JSONRPC_UNAUTHORIZED, 'Unauthorized: invalid audience'));
      return true;
    }

    const roles: string[] = decoded.realm_access?.roles ?? [];
    const tier = rolesToTier(roles);
    const scopes = tierScopes[tier] ?? tierScopes.free;

    if (!scopes.includes(MIN_SCOPE)) {
      await reply
        .status(403)
        .type('application/json')
        .header(
          'WWW-Authenticate',
          `${resourceMetadataHeader()}, error="insufficient_scope", scope="${MIN_SCOPE}"`
        )
        .header('Link', oauthProtectedResourceLinkHeader())
        .send(
          jsonRpcAuthError(
            JSONRPC_FORBIDDEN,
            `Forbidden: token missing required scope "${MIN_SCOPE}"`
          )
        );
      return true;
    }

    const sub = typeof decoded.sub === 'string' ? decoded.sub : 'unknown';

    request.user = {
      sub,
      tier,
      scopes,
      roles,
      token,
    };

    const authInfo: AuthInfo = {
      token,
      clientId,
      scopes,
      expiresAt: typeof decoded.exp === 'number' ? decoded.exp : undefined,
      extra: {
        sub,
        tier,
        roles,
      },
    };

    attachMcpAuth(request.raw, authInfo);
  } catch (err) {
    logger.warn({ err }, 'Token validation failed');
    await reply
      .status(401)
      .type('application/json')
      .header('WWW-Authenticate', resourceMetadataHeader())
      .header('Link', oauthProtectedResourceLinkHeader())
      .send(jsonRpcAuthError(JSONRPC_UNAUTHORIZED, 'Unauthorized: token invalid or expired'));
    return true;
  }

  return false;
}
