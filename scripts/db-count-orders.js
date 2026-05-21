require('dotenv').config();
const { Client } = require('pg');

(async () => {
  const db = process.argv[2] || process.env.DATABASE_NAME;
  const url = process.env.DATABASE_URL.replace(/\/[^/]+$/, `/${db}`);
  const client = new Client({ connectionString: url });
  await client.connect();
  const count = await client.query('SELECT COUNT(*)::int AS n FROM "order"');
  console.log(`order row count in ${db}:`, count.rows[0].n);
  await client.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
