-- ============================================================
-- WOOX - Soporte para Múltiples Servicios por Recurso
-- Permite que un profesional (ej. Odontólogo) tenga varios
-- servicios con diferentes duraciones y precios.
-- ============================================================

-- 1. Crear tabla de servicios específicos
CREATE TABLE IF NOT EXISTS public.resource_services (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    resource_id UUID NOT NULL REFERENCES public.reservable_resources(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    duration_minutes INTEGER NOT NULL DEFAULT 30,
    price NUMERIC(10, 2) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Agregar referencia opcional en bookings para trazabilidad
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS service_id UUID REFERENCES public.resource_services(id) ON DELETE SET NULL;

-- 3. Habilitar RLS
ALTER TABLE public.resource_services ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Permitir todo a usuarios autenticados resource_services') THEN
        CREATE POLICY "Permitir todo a usuarios autenticados resource_services" ON public.resource_services FOR ALL USING (true);
    END IF;
END $$;

-- 4. Notificar recarga de esquema
NOTIFY pgrst, 'reload schema';
