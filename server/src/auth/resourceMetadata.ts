/**
 * OAuth 2.0 Protected Resource Metadata (RFC 9728) + MCP client hints.
 * @see https://www.rfc-editor.org/rfc/rfc9728.html
 */

export const SCOPES_SUPPORTED = [
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
] as const;

export function getPublicBaseUrl(): string {
  return (process.env.PUBLIC_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
}

/** Resource identifier for this MCP HTTP endpoint (RFC 8707 / MCP HTTP). */
export function getMcpResourceUrl(): string {
  const override = process.env.MCP_RESOURCE_URL?.replace(/\/$/, '');
  if (override) return override;
  return `${getPublicBaseUrl()}/mcp`;
}

export function getAuthorizationServerUrl(): string {
  return (process.env.AUTH_SERVER_URL || 'http://localhost:8080/realms/finance').replace(/\/$/, '');
}

export function getOAuthProtectedResourceMetadataUrl(): string {
  return `${getPublicBaseUrl()}/.well-known/oauth-protected-resource`;
}

export function getOpenIdConfigurationUrl(): string {
  return `${getAuthorizationServerUrl()}/.well-known/openid-configuration`;
}

/**
 * RFC 9728 document. Clients (including Cursor) use this for discovery.
 * We keep legacy `issuer` / OIDC endpoint fields for older readers.
 */
export function buildProtectedResourceMetadata(): Record<string, unknown> {
  const authServerUrl = getAuthorizationServerUrl();
  const resource = getMcpResourceUrl();

  return {
    resource,
    authorization_servers: [authServerUrl],
    scopes_supported: [...SCOPES_SUPPORTED],
    bearer_methods_supported: ['header'],
    // Hints for OIDC stacks (Keycloak, Auth0, etc.)
    issuer: authServerUrl,
    authorization_endpoint: `${authServerUrl}/protocol/openid-connect/auth`,
    token_endpoint: `${authServerUrl}/protocol/openid-connect/token`,
    jwks_uri: `${authServerUrl}/protocol/openid-connect/certs`,
    openid_configuration: getOpenIdConfigurationUrl(),
  };
}

export function oauthProtectedResourceLinkHeader(): string {
  return `<${getOAuthProtectedResourceMetadataUrl()}>; rel="oauth-protected-resource"`;
}
