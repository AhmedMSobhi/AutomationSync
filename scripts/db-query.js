require('dotenv').config();
const { Client } = require('pg');

const odooId = process.argv[2];
if (!odooId) {
  console.error('Usage: npm run db:query -- <odoo_id>');
  console.error('Example: npm run db:query -- 55554');
  process.exit(1);
}

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const result = await client.query(
    `SELECT * FROM "order" WHERE metadata->>'odoo_id' = $1`,
    [odooId]
  );
  await client.end();
  console.log(JSON.stringify(result.rows, null, 2));
  console.log(`\n${result.rows.length} row(s) for odoo_id=${odooId}`);
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
