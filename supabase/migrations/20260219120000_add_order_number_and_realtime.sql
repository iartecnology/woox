-- migration 20260219120000_add_order_number_and_realtime.sql
-- 1. Añadir columna order_number a la tabla orders si no existe
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_number SERIAL;

-- 2. Añadir columna product_name a order_items para guardar el nombre en el momento de la compra
-- Esto permite que los pedidos del simulador (que pueden no tener product_id válido) muestren el nombre
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_name TEXT;

-- 3. Habilitar Realtime para la tabla orders
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'La publicación ya podría existir';
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE orders;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'La tabla orders ya podría estar en la publicación';
END $$;

-- 4. RLS y Permisos (Lectura pública para el panel de gestión)
ALTER TABLE orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE order_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
ALTER TABLE categories DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir lectura de ítems" ON order_items;
CREATE POLICY "Permitir lectura de ítems" ON order_items FOR SELECT USING (true);
