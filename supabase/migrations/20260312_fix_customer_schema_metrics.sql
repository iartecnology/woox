-- Fix: Añadir columnas faltantes a la tabla customers referenciadas en el trigger de métricas
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS last_purchase_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Asegurar que la columna status existe (algunas versiones del esquema podrian no tenerla)
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- Recargar el esquema para PostgREST
NOTIFY pgrst, 'reload schema';
