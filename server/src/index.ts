import dotenv from 'dotenv';
import { createHttpServer } from './transport/http.js';
import { logger } from './utils/logger.js';

dotenv.config();

const PORT = parseInt(process.env.PORT || '3000', 10);

async function main(): Promise<void> {
  const app = await createHttpServer(PORT);
  await app.listen({ port: PORT, host: '0.0.0.0' });
  logger.info({ port: PORT }, 'MCP server listening');
}

main().catch((err: unknown) => {
  logger.error({ err }, 'Fatal error');
  process.exit(1);
});
