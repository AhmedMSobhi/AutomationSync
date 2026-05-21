-- Medusa order id from "order".id (e.g. order_01KS58SHR3SXVKH318Y98TW4EA)
SELECT *
FROM public.order_transaction
WHERE order_id = 'order_01KS58SHR3SXVKH318Y98TW4EA'
ORDER BY created_at DESC;

-- Payment synced successfully when reference = 'capture'
SELECT *
FROM public.order_transaction
WHERE order_id = 'order_01KS58SHR3SXVKH318Y98TW4EA'
  AND reference = 'capture';
