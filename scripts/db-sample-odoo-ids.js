require('dotenv').config();
const { Client } = require('pg');

const dbName = process.argv[2] || 'dbstaging';
const url = process.env.DATABASE_URL.replace(/\/[^/]+$/, `/${dbName}`);

(async () => {
  const client = new Client({ connectionString: url });
  await client.connect();
  const result = await client.query(`
    SELECT metadata->>'odoo_id' AS odoo_id, COUNT(*)::int AS n
    FROM "order"
    WHERE metadata->>'odoo_id' IS NOT NULL AND metadata->>'odoo_id' <> ''
    GROUP BY 1
    ORDER BY MAX(created_at) DESC
    LIMIT 5
  `);
  await client.end();
  console.log(`Recent odoo_id values in ${dbName}:`);
  console.log(JSON.stringify(result.rows, null, 2));
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
