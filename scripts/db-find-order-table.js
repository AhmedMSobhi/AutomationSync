require('dotenv').config();
const { Client } = require('pg');

const dbName = process.argv[2] || process.env.DATABASE_NAME || 'postgres';

(async () => {
  const base = process.env.DATABASE_URL.replace(/\/[^/]+$/, `/${dbName}`);
  const client = new Client({ connectionString: base });
  await client.connect();
  const tables = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name ILIKE '%order%'
    ORDER BY table_name
  `);
  console.log(`Order-related tables in "${dbName}":`);
  console.log(tables.rows.map((r) => r.table_name).join('\n') || '(none)');
  await client.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
