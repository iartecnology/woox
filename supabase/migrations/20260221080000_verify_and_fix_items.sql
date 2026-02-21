-- migration 20260221080000_verify_and_fix_items.sql
-- Asegurar que la tabla items tiene todas las columnas necesarias y RLS desactivado
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_name TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS unit_price DECIMAL(10,2);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS subtotal DECIMAL(10,2);

-- Desactiva RLS para evitar problemas de permisos en el prototipo
ALTER TABLE orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE order_items DISABLE ROW LEVEL SECURITY;
