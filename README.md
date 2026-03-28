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

- **POST/GET/DELETE** `/mcp` — Streamable HTTP with session header `mcp-session-id` after initialize (see MCP Streamable HTTP spec and `@modelcontextprotocol/sdk` examples). **Bearer access token required** on all `/mcp` calls (Day 1).

## Day 1: OAuth, tiers, and NSE quote

### Keycloak

1. Realm **`finance`**, client **`mcp-client`** (public, PKCE as needed).
2. Enable **Direct access grants** on `mcp-client` if you use [`scripts/get-token.sh`](scripts/get-token.sh) (dev only).
3. Realm roles: **`free`**, **`premium`**, **`analyst`** — assign to test users (e.g. `free@example.com`, …).
4. Ensure **realm roles appear in the access token** (client scope + *realm roles* mapper, or default `roles` scope).
5. Audience / authorized party: tokens should include **`azp`** = `mcp-client` and/or **`aud`** containing `mcp-client` (add an **audience** mapper in Keycloak if needed).

### Environment

See [`.env.example`](.env.example): `AUTH_SERVER_URL` (must match JWT `iss`), optional `KEYCLOAK_INTERNAL_URL` when the MCP container fetches JWKS from `http://keycloak:8080/...` but tokens use `http://localhost:8080/...`, plus `PUBLIC_BASE_URL`, `OAUTH_CLIENT_ID`.

### Tools

- **`get_stock_quote`** — NSE equity quote via [`stock-nse-india`](https://www.npmjs.com/package/stock-nse-india) (the `nseindia` npm name from the brief is not published; this library provides `NseIndia`). Quotes are cached in **Redis** (60s TTL); on upstream failure, a cached value is returned when available.
- Tier → synthetic **scopes** are derived from `realm_access.roles` in [`server/src/auth/tiers.ts`](server/src/auth/tiers.ts). Middleware requires **`market:read`** for any `/mcp` traffic; the quote tool checks the same scope via MCP `authInfo`.

### Dev token

```bash
./scripts/get-token.sh free@example.com 'user-password'
```

### Why Cursor showed `invalid_union` / JSON-RPC errors

The MCP client only understands **JSON-RPC 2.0** bodies. Anything else (for example Fastify’s default **404 JSON**, or **`{ "error": "missing_token" }` on OPTIONS preflight**) gets validated as JSON-RPC and fails.

This server now:

- Skips Bearer auth for **`OPTIONS` and `HEAD`** on `/mcp` (CORS preflight).
- Registers **CORS** (`@fastify/cors`) for browser/Electron OAuth flows.
- Returns **JSON-RPC-shaped errors** for bad **GET/DELETE** session cases.
- Serves **RFC 9728–style** metadata at `/.well-known/oauth-protected-resource` (including `resource`, `authorization_servers`, `jwks_uri`, `openid_configuration`).

### Cursor: OAuth vs static `Authorization` header

- **OAuth (`auth` in `mcp.json`)**: Cursor is responsible for opening the login page, exchanging the code, and attaching **`Authorization: Bearer …`** to MCP HTTP requests. That behavior is implemented in **Cursor**, not in this repo. The same pattern applies to **Auth0**, **Keycloak**, or any OIDC provider as long as issuer/JWKS and client settings match.
- **Do not** mix a long-lived **`headers.Authorization`** entry with **`auth`** unless you know Cursor’s merge rules; prefer **one** method. Example without secrets: [`docs/cursor-mcp.example.json`](docs/cursor-mcp.example.json).

If you previously pasted a JWT into `mcp.json`, **rotate** that user session or client secret in Keycloak and use OAuth or a short-lived dev token only.

### How to invoke this MCP

1. **Cursor** — add the server in `mcp.json` (see example), start Docker / `npm start`, reload MCP; complete OAuth when prompted.
2. **curl / scripts** — obtain a token (`scripts/get-token.sh`), then send **`Authorization: Bearer <token>`** on every **POST/GET/DELETE** to `/mcp` (Streamable HTTP + `mcp-session-id` after initialize).
3. **Other MCP clients** — point the HTTP transport at `http://localhost:3000/mcp` and configure OIDC using `/.well-known/oauth-protected-resource`.

### Using this MCP in Cursor (step by step)

1. **Start everything** (repo root): `docker compose up --build` — wait until `mcp-server`, Keycloak, Postgres, and Redis are up. Check: `curl -s http://localhost:3000/health`.
2. **Keycloak** (one-time): realm `finance`, public client `mcp-client`, valid **redirect URIs** for Cursor’s OAuth callback, **Direct access grants** on if you use `scripts/get-token.sh`, users with realm roles `free` / `premium` / `analyst`.
3. **Cursor config** — merge [`docs/cursor-mcp.example.json`](docs/cursor-mcp.example.json) into `~/.cursor/mcp.json`, then **reload MCP** (Command Palette → MCP: reload / restart Cursor).
4. **OAuth flow** — Cursor opens Keycloak (or shows a login step), you sign in; Cursor stores tokens and sends **`Authorization: Bearer …`** on each `/mcp` request. Then **initialize** runs over Streamable HTTP (session id in headers on later requests).
5. **In chat** — use tools like `ping` or `get_stock_quote` when the host lists them; you do not paste JWTs into the prompt.

### If logs still show `invalid_union`

That means Cursor parsed **JSON that is not JSON-RPC 2.0** (e.g. OAuth error body, Fastify 404 JSON, or a non-`data:` SSE line). If you also see **“Recovering … connected after successful listOfferings”**, the client often **recovers** and tools still work.

We fixed **`Method not found` for `prompts` / `resources`**: the server used to advertise `prompts` and `resources` without implementing `prompts/list` or `resources/list`. It now advertises **tools only** ([`server/src/mcp/serverFactory.ts`](server/src/mcp/serverFactory.ts)). **Rebuild** after pulling changes: `docker compose up --build`.

### Docker note

[`docker-compose.yml`](docker-compose.yml) sets `AUTH_SERVER_URL` to the **public** issuer (`http://localhost:8080/realms/finance`) and `KEYCLOAK_INTERNAL_URL` to **`http://keycloak:8080/realms/finance`** so JWKS works from inside the `mcp-server` container.

## Project layout

- [`server/`](server/) — MCP HTTP server
- [`docs/architecture.md`](docs/architecture.md) — architecture (placeholder)
- [`scripts/keycloak-setup.sh`](scripts/keycloak-setup.sh) — automation placeholder
