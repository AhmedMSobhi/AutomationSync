require('dotenv').config();
const { Client } = require('pg');

const dbName = process.argv[2];
const odooId = process.argv[3];
if (!dbName || !odooId) {
  console.error('Usage: node scripts/db-query-db.js <database> <odoo_id>');
  process.exit(1);
}

const url = process.env.DATABASE_URL.replace(/\/[^/]+$/, `/${dbName}`);

(async () => {
  const client = new Client({ connectionString: url });
  await client.connect();
  const result = await client.query(
    `SELECT * FROM "order" WHERE metadata->>'odoo_id' = $1`,
    [odooId]
  );
  await client.end();
  console.log(JSON.stringify(result.rows, null, 2));
  console.log(`\n${result.rows.length} row(s) in ${dbName}`);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
