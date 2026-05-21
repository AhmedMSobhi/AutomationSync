require('dotenv').config();
const { Client } = require('pg');

const orderId = process.argv[2];
const odooId = process.argv[3];

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  let id = orderId;
  if (!id && odooId) {
    const o = await client.query(
      `SELECT id FROM "order" WHERE metadata->>'odoo_id' = $1`,
      [odooId]
    );
    id = o.rows[0]?.id;
    console.log('Resolved order_id:', id);
  }

  if (process.argv[2] === '--refs') {
    const refs = await client.query(
      `SELECT reference, COUNT(*)::int AS n
       FROM public.order_transaction
       GROUP BY reference
       ORDER BY n DESC
       LIMIT 30`
    );
    await client.end();
    console.log(refs.rows);
    return;
  }

  if (!id) {
    console.error('Usage: node scripts/db-order-transactions.js <order_id>');
    console.error('   or: node scripts/db-order-transactions.js -- <odoo_id>');
    console.error('   or: node scripts/db-order-transactions.js --refs');
    process.exit(1);
  }

  const result = await client.query(
    `SELECT * FROM public.order_transaction WHERE order_id = $1 ORDER BY created_at DESC`,
    [id]
  );
  await client.end();
  console.log(JSON.stringify(result.rows, null, 2));
  console.log(`\n${result.rows.length} transaction(s)`);
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
