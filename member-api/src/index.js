import { loadConfig } from './config.js';
import { createPool } from './db.js';
import { createMemberManagementAuthorizer } from './memberScope.js';
import { createServer } from './server.js';

const config = loadConfig();
const pool = createPool(config.databaseUrl);
const authorizeMemberManagement = createMemberManagementAuthorizer({
  resolverUrl: config.memberScopeResolverUrl,
  resolverSecret: config.memberScopeResolverSecret,
});
const server = createServer(pool, { authorizeMemberManagement });

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
