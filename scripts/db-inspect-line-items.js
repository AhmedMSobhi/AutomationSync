require('dotenv').config();
const { Client } = require('pg');

const odooId = process.argv[2] || '55561';

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  const order = await c.query(
    `SELECT o.id FROM "order" o WHERE o.metadata->>'odoo_id' = $1 LIMIT 1`,
    [odooId]
  );
  const orderId = order.rows[0]?.id;
  console.log('order_id:', orderId);

  const tables = await c.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name LIKE '%order%line%'
    ORDER BY table_name
  `);
  console.log('line tables:', tables.rows.map((r) => r.table_name).join(', '));

  const cols = await c.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'order_line_item' ORDER BY ordinal_position
  `);
  console.log('order_line_item cols:', cols.rows.map((r) => r.column_name).join(', '));

  const oiCols = await c.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'order_item' ORDER BY ordinal_position
  `);
  console.log('order_item cols:', oiCols.rows.map((r) => r.column_name).join(', '));

  const items = await c.query(`
    SELECT oi.*, oli.title, oli.product_title, oli.variant_title, oli.unit_price, oli.metadata AS line_metadata
    FROM order_item oi
    JOIN order_line_item oli ON oli.id = oi.item_id
    WHERE oi.order_id = $1 AND oi.deleted_at IS NULL AND oli.deleted_at IS NULL
    ORDER BY oi.created_at
  `, [orderId]).catch(async (e) => {
    console.log('order_item join failed:', e.message);
    return c.query(`SELECT * FROM order_line_item WHERE deleted_at IS NULL LIMIT 3`);
  });

  console.log('\nLine items:');
  console.log(JSON.stringify(items.rows, null, 2));

  await c.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
