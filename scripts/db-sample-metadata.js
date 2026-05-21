require('dotenv').config();
const { Client } = require('pg');

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const result = await client.query(`
    SELECT id, metadata, created_at
    FROM "order"
    ORDER BY created_at DESC
    LIMIT 3
  `);
  await client.end();
  console.log(JSON.stringify(result.rows, null, 2));
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
