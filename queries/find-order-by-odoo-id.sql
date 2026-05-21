-- Replace :odoo_id with the numeric id from the Odoo URL (/odoo/sales/55554 → 55554)
-- Requires Cloud SQL proxy: start-cloud-sql-proxy.bat

SELECT *
FROM "order"
WHERE metadata->>'odoo_id' = ':odoo_id';
