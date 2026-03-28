import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      sub: string;
      tier: string;
      scopes: string[];
      roles: string[];
      token: string;
    };
  }
}
