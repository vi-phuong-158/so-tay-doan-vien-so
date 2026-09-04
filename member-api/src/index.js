import { loadConfig } from './config.js';
import { createPool } from './db.js';
import { createServer } from './server.js';

const config = loadConfig();
const pool = createPool(config.databaseUrl);
const server = createServer(pool);

server.listen(config.port, () => {
  console.log(`[member-api] listening on port ${config.port}`);
});

async function shutdown(signal) {
  console.log(`[member-api] received ${signal}, shutting down`);
  server.close();
  await pool.end();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
