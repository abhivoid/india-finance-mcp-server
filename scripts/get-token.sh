#!/usr/bin/env bash
# Dev-only helper: gets an access token via the Resource Owner Password grant.
# Usage: ./scripts/get-token.sh [username] [password]
# Defaults: devuser / devpass123
set -euo pipefail

KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8080}"
REALM="${REALM:-finance}"
CLIENT="${CLIENT:-mcp-client}"
USER="${1:-devuser}"
PASS="${2:-devpass123}"

RESPONSE=$(curl -sS -X POST "${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=${CLIENT}" \
  -d "username=${USER}" \
  -d "password=${PASS}" \
  -d "grant_type=password" \
  -d "scope=openid")

# Extract just the access_token if python3 is available, otherwise dump raw
if command -v python3 &>/dev/null; then
  ACCESS_TOKEN=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('access_token') or d.get('error','unknown error'))")
  echo "$ACCESS_TOKEN"
else
  echo "$RESPONSE"
fi
