-- Use Medusa order.id from "order" table (NOT ordful_* fulfillment id)
SELECT *
FROM public.order_fulfillment
WHERE order_id = 'order_01KS5EA6BN1MNS2BS5THXFKR48'
ORDER BY created_at;
-- All returned rows must have the same order_id as above

-- After WH/OUT sync:
--   PASS  → NULL + timestamp (one active, one soft-deleted)
--   FAIL  → NULL only | timestamp + timestamp | single value only
