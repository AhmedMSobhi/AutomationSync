require('dotenv').config();
const { Client } = require('pg');

const orderId = process.argv[2] || 'order_01KS5EA6BN1MNS2BS5THXFKR48';

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const result = await client.query(
    `SELECT * FROM public.order_fulfillment WHERE order_id = $1 ORDER BY created_at`,
    [orderId]
  );
  const bad = result.rows.filter((r) => r.order_id !== orderId);
  if (bad.length) {
    console.error('Rows with wrong order_id:', bad);
  }
  const distinct = [...new Set(result.rows.map((r) => (r.deleted_at == null ? 'NULL' : String(r.deleted_at))))];
  console.log(JSON.stringify(result.rows, null, 2));
  console.log('\nrows:', result.rows.length);
  console.log('distinct deleted_at:', distinct);
  await client.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
