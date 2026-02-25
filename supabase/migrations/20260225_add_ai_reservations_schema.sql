-- ==========================================================================================
-- Módulo: Woox AI Reservation Engine - Esquema Core
-- ==========================================================================================
-- Este script crea las tablas fundamentales para manejar los 6 modelos de reservación 
-- (Citas, Mesas, Airbnb, Hoteles, Alquileres, Eventos).
-- ==========================================================================================

-- 1. Tabla de Recursos Reservables (Lo que se alquila/reserva)
-- Puede ser un servicio (corte de pelo), un espacio (mesa, cabaña), o un recurso (habitación).
CREATE TABLE IF NOT EXISTS public.reservable_resources (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('service', 'table', 'property', 'room_type', 'tangible', 'class')),
    name TEXT NOT NULL,
    description TEXT,
    duration_minutes INTEGER, -- Útil para 'service' o 'class' (Ej: 45 min)
    capacity INTEGER DEFAULT 1, -- Cuántas personas/items aguanta este recurso a la vez
    buffer_time_minutes INTEGER DEFAULT 0, -- Tiempo de limpieza/descanso entre reservas
    base_price NUMERIC(10, 2) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Tabla de Disponibilidad (Reglas de negocio)
-- Define los horarios regulares en los que un recurso está disponible (ej. L-V 8am a 5pm)
CREATE TABLE IF NOT EXISTS public.availability_schedules (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    resource_id UUID NOT NULL REFERENCES public.reservable_resources(id) ON DELETE CASCADE,
    day_of_week INTEGER CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Domingo, 1=Lunes, etc.
    start_time TIME NOT NULL, -- Ej: '08:00:00'
    end_time TIME NOT NULL,   -- Ej: '17:00:00'
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Tabla de Excepciones de Disponibilidad (Bloqueos o Días Festivos)
-- Fechas específicas donde las reglas regulares no aplican (ej. Vacaciones, Almuerzo)
CREATE TABLE IF NOT EXISTS public.availability_exceptions (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    resource_id UUID REFERENCES public.reservable_resources(id) ON DELETE CASCADE, -- Si es null, aplica a todo el merchant
    merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
    start_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
    end_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
    reason TEXT, -- Ej: 'Mantenimiento', 'Hora de Almuerzo'
    is_block BOOLEAN DEFAULT true, -- Si es true, bloquea la disponibilidad. Si es false, podría agregar horas extra.
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Tabla Central de Reservas (Bookings)
-- Almacena la reserva real hecha por el cliente (vía IA, Landing o Manual)
CREATE TABLE IF NOT EXISTS public.bookings (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL, -- Si se hizo vía chat
    resource_id UUID NOT NULL REFERENCES public.reservable_resources(id),
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    pax INTEGER DEFAULT 1, -- Número de personas (invitados/party size)
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed', 'no_show')),
    channel TEXT NOT NULL DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp', 'telegram', 'facebook', 'instagram', 'web', 'manual')),
    total_price NUMERIC(10, 2) DEFAULT 0,
    special_requests TEXT,
    metadata JSONB DEFAULT '{}'::jsonb, -- Para guardar info extra (ej. respuestas a formularios)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Índices para optimizar las consultas de disponibilidad y cruce de fechas (Vital para la IA)
CREATE INDEX idx_bookings_resource_dates ON public.bookings(resource_id, start_time, end_time);
CREATE INDEX idx_bookings_merchant_status ON public.bookings(merchant_id, status);
CREATE INDEX idx_availability_resource_day ON public.availability_schedules(resource_id, day_of_week);

-- Habilitar RLS (Row Level Security) - Políticas básicas (pueden ajustarse luego)
ALTER TABLE public.reservable_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.availability_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.availability_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

-- Políticas temporales para ambiente de desarrollo (se recomienda ajustar en prod)
CREATE POLICY "Permitir todo a usuarios autenticados reservable_resources" ON public.reservable_resources FOR ALL USING (true);
CREATE POLICY "Permitir todo a usuarios autenticados availability_schedules" ON public.availability_schedules FOR ALL USING (true);
CREATE POLICY "Permitir todo a usuarios autenticados availability_exceptions" ON public.availability_exceptions FOR ALL USING (true);
CREATE POLICY "Permitir todo a usuarios autenticados bookings" ON public.bookings FOR ALL USING (true);
