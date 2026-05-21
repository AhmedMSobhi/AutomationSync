require('dotenv').config();

// Re-use step logging from compiled helpers via dynamic require of ts not available —
// mirror the same steps here for CLI.
const { Client } = require('pg');

function cfg() {
  const url = process.env.DATABASE_URL ?? '';
  const p = new URL(url.replace(/^postgresql:/, 'http:'));
  return {
    host: p.hostname,
    port: p.port,
    database: p.pathname.replace(/^\//, ''),
    user: decodeURIComponent(p.username || ''),
  };
}

(async () => {
  const c = cfg();
  console.log('\n────────── Database connection steps ──────────');
  console.log('[DB 1/7] npm run db:proxy');
  console.log(`         → ${c.host}:${c.port}  instance: ${process.env.CLOUD_SQL_INSTANCE || '?'}`);
  console.log('[DB 2/7] .env credentials:');
  console.log(`         user=${c.user}  database=${c.database}`);
  console.log('[DB 3/7] Connecting...');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log('[DB 3/7] Connected OK');
  console.log('[DB 4/7] SELECT COUNT(*) FROM "order"');
  const info = await client.query(
    'SELECT current_database() AS db, current_user AS user, COUNT(*)::int AS orders FROM "order"'
  );
  await client.end();
  console.log('[DB 4/7] Result:', info.rows[0]);
  console.log('──────────────────────────────────────────────\n');
})().catch((e) => {
  console.error('[DB 3/7] Connection FAILED:', e.message);
  console.error('         Run: npm run db:proxy');
  process.exit(1);
});
