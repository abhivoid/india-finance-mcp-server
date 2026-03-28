/** JSON-RPC 2.0 payloads for HTTP responses (helps strict MCP clients). */
export function mcpJsonRpcError(
  code: number,
  message: string,
  id: string | number | null = null
): { jsonrpc: '2.0'; error: { code: number; message: string }; id: string | number | null } {
  return {
    jsonrpc: '2.0',
    error: { code, message },
    id,
  };
}
