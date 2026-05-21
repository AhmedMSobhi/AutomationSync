require('dotenv').config();
const { Client } = require('pg');

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const cols = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'order'
      AND (column_name ILIKE '%display%' OR column_name = 'custom_display_id')
    ORDER BY column_name
  `);
  console.log('display-related columns:', cols.rows.map((r) => r.column_name));

  const sample = await client.query(`
    SELECT id,
           display_id,
           metadata->>'source_number' AS source_number,
           metadata->>'odoo_id' AS odoo_id
    FROM "order"
    WHERE metadata->>'odoo_id' IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 5
  `);
  console.log(JSON.stringify(sample.rows, null, 2));

  await client.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
