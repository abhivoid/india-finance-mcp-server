import jwt, { type JwtPayload } from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

export type KeycloakJwtPayload = JwtPayload & {
  realm_access?: { roles?: string[] };
  azp?: string;
};

/** Issuer claim (`iss`) — must match tokens (often public host, e.g. localhost). */
function getIssuerUrl(): string {
  return (process.env.AUTH_SERVER_URL || 'http://localhost:8080/realms/finance').replace(/\/$/, '');
}

/** Reachable from this process for JWKS (use internal Docker hostname when MCP runs in Compose). */
function getJwksRealmBase(): string {
  return (process.env.KEYCLOAK_INTERNAL_URL || process.env.AUTH_SERVER_URL || 'http://localhost:8080/realms/finance').replace(
    /\/$/,
    ''
  );
}

function getJwksUri(): string {
  return `${getJwksRealmBase()}/protocol/openid-connect/certs`;
}

const client = jwksClient({
  jwksUri: getJwksUri(),
  cache: true,
  rateLimit: true,
  cacheMaxAge: 86_400_000,
});

function getSigningKey(kid: string): Promise<string> {
  return new Promise((resolve, reject) => {
    client.getSigningKey(kid, (err, key) => {
      if (err) {
        reject(err);
        return;
      }
      if (!key) {
        reject(new Error('No signing key'));
        return;
      }
      resolve(key.getPublicKey());
    });
  });
}

export async function verifyToken(token: string): Promise<KeycloakJwtPayload> {
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded || typeof decoded === 'string' || !decoded.header.kid) {
    throw new Error('Invalid token');
  }

  const signingKey = await getSigningKey(decoded.header.kid);
  const issuer = getIssuerUrl();

  return new Promise((resolve, reject) => {
    jwt.verify(token, signingKey, { algorithms: ['RS256'], issuer }, (err, verified) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(verified as KeycloakJwtPayload);
    });
  });
}
