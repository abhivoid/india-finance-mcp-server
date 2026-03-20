# India Finance MCP Server

An MCP server providing unified access to Indian financial data (NSE, BSE, mutual funds, news, macro) with OAuth 2.1 and role-based tiers.

## Stack

- **Runtime:** Node.js 18+, TypeScript, Fastify
- **MCP:** `@modelcontextprotocol/sdk` (Streamable HTTP, stateful sessions)
- **Infra (Docker):** Keycloak 26, PostgreSQL 16, Redis 7

## Day 0 setup

1. Clone the repo.
2. Copy `.env.example` to `.env` at the repo root (for Compose variable substitution) and fill in API keys as needed.
3. From the repo root: `docker compose up --build`.
4. Configure Keycloak (dev):
   - Open [http://localhost:8080](http://localhost:8080) and sign in with **admin** / **admin** (bootstrap admin from `KC_BOOTSTRAP_ADMIN_*`).
   - Create realm **`finance`**.
   - Create a public client **`mcp-client`** with PKCE enabled (for later OAuth flows).
5. Verify the API:
   - `curl -s http://localhost:3000/health` → `{"status":"ok"}`
   - Optional: `curl -s http://localhost:3000/.well-known/oauth-protected-resource` for OAuth resource metadata.

### Local development (without Docker for the Node app)

```bash
npm install --prefix server
cp .env.example server/.env   # optional; dotenv loads from cwd
npm run dev --prefix server
```

### Database note

PostgreSQL is initialized with database **`keycloak`** (for Keycloak) and **`mcp_data`** (for the app), via [`scripts/init-mcp-db.sql`](scripts/init-mcp-db.sql). The MCP container uses `DATABASE_URL=postgresql://keycloak:keycloak@postgres:5432/mcp_data`.

### MCP endpoint

- **POST/GET/DELETE** `/mcp` — Streamable HTTP with session header `mcp-session-id` after initialize (see MCP Streamable HTTP spec and `@modelcontextprotocol/sdk` examples).

## Project layout

- [`server/`](server/) — MCP HTTP server
- [`docs/architecture.md`](docs/architecture.md) — architecture (placeholder)
- [`scripts/keycloak-setup.sh`](scripts/keycloak-setup.sh) — automation placeholder
