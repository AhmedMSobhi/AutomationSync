require('dotenv').config();
const { Client } = require('pg');

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const dbs = await client.query(
    'SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname'
  );
  console.log('Databases:', dbs.rows.map((r) => r.datname).join('\n  '));
  await client.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
