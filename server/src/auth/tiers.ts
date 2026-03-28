import type { JwtPayload } from 'jsonwebtoken';

/** Tier-derived scopes (OIDC scopes string on token is not required when using realm roles). */
export const tierScopes: Record<string, string[]> = {
  free: ['market:read', 'news:read', 'mf:read', 'macro:read'],
  premium: [
    'market:read',
    'news:read',
    'mf:read',
    'macro:read',
    'fundamentals:read',
    'technicals:read',
    'watchlist:read',
    'watchlist:write',
    'macro:historical',
  ],
  analyst: [
    'market:read',
    'news:read',
    'mf:read',
    'macro:read',
    'fundamentals:read',
    'technicals:read',
    'watchlist:read',
    'watchlist:write',
    'macro:historical',
    'filings:read',
    'filings:deep',
    'research:generate',
  ],
};

export function rolesToTier(roles: string[]): 'free' | 'premium' | 'analyst' {
  if (roles.includes('analyst')) return 'analyst';
  if (roles.includes('premium')) return 'premium';
  return 'free';
}

export function audienceMatchesClient(
  payload: { aud?: JwtPayload['aud']; azp?: string },
  clientId: string
): boolean {
  if (payload.azp === clientId) return true;
  const { aud } = payload;
  if (Array.isArray(aud)) return aud.includes(clientId);
  if (typeof aud === 'string') return aud === clientId;
  return false;
}
