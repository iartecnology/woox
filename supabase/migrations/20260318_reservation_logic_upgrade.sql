-- ============================================================
-- WOOX - Mejora de Lógica de Reservaciones e Inventario
-- Fecha: 2026-03-18
-- ============================================================

-- 1. Agregar campos extra para sincronización y alojamientos
ALTER TABLE public.reservable_resources 
ADD COLUMN IF NOT EXISTS external_sync_url TEXT,
ADD COLUMN IF NOT EXISTS min_stay_nights INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS max_pax INTEGER;

-- 2. Función para verificar disponibilidad técnica de un recurso
-- Devuelve un objeto JSON con { "available": boolean, "reason": string }
CREATE OR REPLACE FUNCTION public.check_resource_availability(
    p_resource_id UUID,
    p_start_time TIMESTAMP WITH TIME ZONE,
    p_end_time TIMESTAMP WITH TIME ZONE,
    p_pax INTEGER DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_resource RECORD;
    v_has_schedule BOOLEAN;
    v_is_within_schedule BOOLEAN;
    v_is_blocked BOOLEAN;
    v_count_overlapping INTEGER;
    v_day_of_week INTEGER;
    v_start_time_local TIME;
    v_end_time_local TIME;
BEGIN
    -- 1. Obtener info del recurso
    SELECT * INTO v_resource FROM public.reservable_resources WHERE id = p_resource_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('available', false, 'reason', 'Recurso no encontrado.');
    END IF;

    -- 2. Verificar horarios de atención (availability_schedules)
    -- Opcional: si no hay schedules definidos, se asume disponibilidad 24/7
    v_day_of_week := EXTRACT(DOW FROM p_start_time);
    v_start_time_local := p_start_time::TIME;
    v_end_time_local := p_end_time::TIME;

    SELECT EXISTS (
        SELECT 1 FROM public.availability_schedules 
        WHERE resource_id = p_resource_id AND day_of_week = v_day_of_week AND is_active = true
    ) INTO v_has_schedule;

    IF v_has_schedule THEN
        SELECT EXISTS (
            SELECT 1 FROM public.availability_schedules 
            WHERE resource_id = p_resource_id 
              AND day_of_week = v_day_of_week 
              AND is_active = true
              AND start_time <= v_start_time_local
              AND end_time >= v_end_time_local
        ) INTO v_is_within_schedule;

        IF NOT v_is_within_schedule THEN
            RETURN jsonb_build_object('available', false, 'reason', 'El horario solicitado está fuera del horario de atención permitido.');
        END IF;
    END IF;

    -- 3. Verificar Excepciones/Bloqueos (availability_exceptions)
    SELECT EXISTS (
        SELECT 1 FROM public.availability_exceptions
        WHERE (resource_id = p_resource_id OR (resource_id IS NULL AND merchant_id = v_resource.merchant_id))
          AND is_block = true
          AND (
            (p_start_time >= start_datetime AND p_start_time < end_datetime) -- Empieza adentro
            OR (p_end_time > start_datetime AND p_end_time <= end_datetime) -- Termina adentro
            OR (p_start_time <= start_datetime AND p_end_time >= end_datetime) -- Envuelve al bloqueo
          )
    ) INTO v_is_blocked;

    IF v_is_blocked THEN
        RETURN jsonb_build_object('available', false, 'reason', 'El recurso no está disponible en este horario (bloqueo administrativo o día festivo).');
    END IF;

    -- 4. Verificar Traslape con Reservas Existentes (bookings)
    -- Lógica de capacidad básica
    IF v_resource.type IN ('service', 'table', 'property', 'room_type') THEN
        -- Exclusivos: No pueden tener más reservas que su capacidad (que suele ser 1 por bloque de tiempo)
        SELECT COUNT(*) INTO v_count_overlapping
        FROM public.bookings
        WHERE resource_id = p_resource_id
          AND status IN ('confirmed', 'pending')
          AND (
            (p_start_time >= start_time AND p_start_time < end_time)
            OR (p_end_time > start_time AND p_end_time <= end_time)
            OR (p_start_time <= start_time AND p_end_time >= end_time)
          );
          
        IF v_count_overlapping >= v_resource.capacity THEN
            RETURN jsonb_build_object('available', false, 'reason', 'El recurso ya está ocupado en el horario solicitado.');
        END IF;
    ELSE
        -- Compartidos (Ej: Clases): Sumamos la cantidad de personas
        SELECT COALESCE(SUM(pax), 0) INTO v_count_overlapping
        FROM public.bookings
        WHERE resource_id = p_resource_id
          AND status IN ('confirmed', 'pending')
          AND (
            (p_start_time >= start_time AND p_start_time < end_time)
            OR (p_end_time > start_time AND p_end_time <= end_time)
            OR (p_start_time <= start_time AND p_end_time >= end_time)
          );
          
        IF (v_count_overlapping + p_pax) > v_resource.capacity THEN
            RETURN jsonb_build_object('available', false, 'reason', 'No hay cupo suficiente para ' || p_pax || ' personas.');
        END IF;
    END IF;

    RETURN jsonb_build_object('available', true, 'reason', 'Disponible');
END;
$$;

-- 3. Función para obtener slots disponibles en un día
CREATE OR REPLACE FUNCTION public.get_available_slots(
    p_resource_id UUID,
    p_date DATE,
    p_pax INTEGER DEFAULT 1
)
RETURNS TABLE (slot_start TIMESTAMP WITH TIME ZONE, slot_end TIMESTAMP WITH TIME ZONE)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_resource RECORD;
    v_schedule RECORD;
    v_curr TIMESTAMP WITH TIME ZONE;
    v_end_of_day TIMESTAMP WITH TIME ZONE;
    v_check JSONB;
    v_duration INTEGER;
BEGIN
    SELECT * INTO v_resource FROM public.reservable_resources WHERE id = p_resource_id;
    IF NOT FOUND THEN RETURN; END IF;
    
    v_duration := COALESCE(v_resource.duration_minutes, 60);

    -- Si no hay schedules, asumimos de 08:00 a 20:00 como default razonable para búsqueda
    IF NOT EXISTS (SELECT 1 FROM public.availability_schedules WHERE resource_id = p_resource_id AND day_of_week = EXTRACT(DOW FROM p_date)) THEN
        v_curr := (p_date::TEXT || ' 08:00:00')::TIMESTAMP WITH TIME ZONE;
        v_end_of_day := (p_date::TEXT || ' 20:00:00')::TIMESTAMP WITH TIME ZONE;
        
        WHILE (v_curr + (v_duration || ' minutes')::INTERVAL) <= v_end_of_day LOOP
            v_check := public.check_resource_availability(p_resource_id, v_curr, v_curr + (v_duration || ' minutes')::INTERVAL, p_pax);
            IF (v_check->>'available')::BOOLEAN THEN
                slot_start := v_curr;
                slot_end := v_curr + (v_duration || ' minutes')::INTERVAL;
                RETURN NEXT;
            END IF;
            v_curr := v_curr + ((v_duration + v_resource.buffer_time_minutes) || ' minutes')::INTERVAL;
        END LOOP;
    ELSE
        -- Seguir los horarios definidos
        FOR v_schedule IN 
            SELECT * FROM public.availability_schedules 
            WHERE resource_id = p_resource_id AND day_of_week = EXTRACT(DOW FROM p_date) AND is_active = true
            ORDER BY start_time
        LOOP
            v_curr := (p_date::TEXT || ' ' || v_schedule.start_time::TEXT)::TIMESTAMP WITH TIME ZONE;
            v_end_of_day := (p_date::TEXT || ' ' || v_schedule.end_time::TEXT)::TIMESTAMP WITH TIME ZONE;
            
            WHILE (v_curr + (v_duration || ' minutes')::INTERVAL) <= v_end_of_day LOOP
                v_check := public.check_resource_availability(p_resource_id, v_curr, v_curr + (v_duration || ' minutes')::INTERVAL, p_pax);
                
                IF (v_check->>'available')::BOOLEAN THEN
                    slot_start := v_curr;
                    slot_end := v_curr + (v_duration || ' minutes')::INTERVAL;
                    RETURN NEXT;
                END IF;
                
                v_curr := v_curr + ((v_duration + v_resource.buffer_time_minutes) || ' minutes')::INTERVAL;
            END LOOP;
        END LOOP;
    END IF;
END;
$$;
