require('dotenv').config();
const { Client } = require('pg');

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  for (const table of ['order_summary', 'order_line_item', 'order']) {
    const cols = await c.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
       ORDER BY ordinal_position`,
      [table]
    );
    console.log(`\n${table} columns:`, cols.rows.map((r) => r.column_name).join(', '));
  }

  const sample = await c.query(`
    SELECT o.id, o.metadata->>'odoo_id' AS odoo_id,
           os.totals, os.raw_total, os.subtotal, os.total
    FROM "order" o
    LEFT JOIN order_summary os ON os.order_id = o.id
    WHERE o.metadata->>'odoo_id' IS NOT NULL
    ORDER BY o.created_at DESC
    LIMIT 1
  `).catch(async (e) => {
    console.log('join query failed:', e.message);
    const fallback = await c.query(`
      SELECT o.id, o.metadata, os.*
      FROM "order" o
      LEFT JOIN order_summary os ON os.order_id = o.id
      WHERE o.metadata->>'odoo_id' IS NOT NULL
      ORDER BY o.created_at DESC LIMIT 1
    `);
    return fallback;
  });

  console.log('\nLatest synced order totals sample:');
  console.log(JSON.stringify(sample.rows[0], null, 2));

  await c.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
