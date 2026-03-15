-- ============================================
-- FIX: AGREGAR COLUMNAS FALTANTES A ORDERS
-- ============================================

-- 1. Agregar columnas necesarias para el Bot Builder y Analíticas
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS internal_note TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS closing_agent_type TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_address TEXT;

-- 2. Recargar el caché de PostgREST para que los cambios sean visibles inmediatamente
NOTIFY pgrst, 'reload schema';

-- 3. Comentarios
COMMENT ON COLUMN public.orders.source IS 'Origen del pedido (simulator, whatsapp, telegram, messenger, etc)';
COMMENT ON COLUMN public.orders.internal_note IS 'Notas internas generadas por el sistema o la IA';
COMMENT ON COLUMN public.orders.closing_agent_type IS 'Indica si el cierre fue por bot o human';
