-- ==========================================================================================
-- Módulo: Woox AI Reservation Engine - Lógica de Disponibilidad (RPC)
-- ==========================================================================================
-- Función altamente optimizada para que la Inteligencia Artificial consulte si hay cupo
-- antes de hacer promesas falsas al usuario.
-- Se invoca así desde el webhook de la IA: supabase.rpc('check_availability', { p_resource_id, p_start, p_end, p_pax })
-- ==========================================================================================

CREATE OR REPLACE FUNCTION public.check_availability(
    p_resource_id UUID,
    p_start_datetime TIMESTAMP WITH TIME ZONE,
    p_end_datetime TIMESTAMP WITH TIME ZONE,
    p_requested_pax INTEGER DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_resource RECORD;
    v_total_reserved_pax INTEGER;
    v_available_capacity INTEGER;
    v_is_within_schedule BOOLEAN;
    v_day_of_week INTEGER;
    v_start_time TIME;
    v_end_time TIME;
    v_has_blocking_exception BOOLEAN;
BEGIN
    -- 1. Verificar existencia y capacidad neta del recurso solicitado
    SELECT * INTO v_resource FROM public.reservable_resources WHERE id = p_resource_id AND is_active = true;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('available', false, 'reason', 'El recurso no existe o está inactivo.');
    END IF;

    -- Extraemos datos básicos del rango solicitado
    v_day_of_week := EXTRACT(DOW FROM p_start_datetime AT TIME ZONE 'UTC'); 
    v_start_time := p_start_datetime::TIME;
    v_end_time := p_end_datetime::TIME;

    -- 2. Regla de Negocio: Validar Schedule Base (¿Cae en un día y hora en la que trabajamos?)
    SELECT EXISTS (
        SELECT 1 FROM public.availability_schedules s
        WHERE s.resource_id = p_resource_id
          AND s.is_active = true
          AND s.day_of_week = v_day_of_week
          AND v_start_time >= s.start_time
          AND v_end_time <= s.end_time
    ) INTO v_is_within_schedule;

    IF NOT v_is_within_schedule THEN
        RETURN jsonb_build_object('available', false, 'reason', 'Fuera de nuestro horario de atención.');
    END IF;

    -- 3. Excepciones: Revisar bloqueos manuales (Vacaciones, hora de almuerzo)
    SELECT EXISTS (
        SELECT 1 FROM public.availability_exceptions e
        WHERE (e.resource_id = p_resource_id OR e.resource_id IS NULL) -- Null = aplica a todo el negocio
          AND e.merchant_id = v_resource.merchant_id
          AND e.is_block = true
          AND p_start_datetime < e.end_datetime AND p_end_datetime > e.start_datetime -- Tralape estricto de fechas
    ) INTO v_has_blocking_exception;

    IF v_has_blocking_exception THEN
        RETURN jsonb_build_object('available', false, 'reason', 'Horario bloqueado administrativamente (ej. pausa o vacaciones).');
    END IF;

    -- 4. Cálculo de Colisiones de Reservas Previas (Inventario/Overbooking Protection)
    -- Sumamos la cantidad de personas (pax) que ya tienen reservas confirmadas o pendientes
    -- que se crucen matemáticamente con la ventana de tiempo solicitada.
    SELECT COALESCE(SUM(b.pax), 0)
    INTO v_total_reserved_pax
    FROM public.bookings b
    WHERE b.resource_id = p_resource_id
      AND b.status IN ('confirmed', 'pending')
      AND (
          -- La fórmula dorada para intersección de rangos de tiempo [StartA, EndA] vs [StartB, EndB]
          (p_start_datetime < b.end_time) AND (p_end_datetime > b.start_time)
      );

    -- Capacidad Matemática Sofisticada
    v_available_capacity := v_resource.capacity - v_total_reserved_pax;

    -- 5. Decisión Final de Alocación
    IF v_available_capacity >= p_requested_pax THEN
        RETURN jsonb_build_object(
            'available', true, 
            'requested_pax', p_requested_pax,
            'remaining_capacity', v_available_capacity,
            'reason', 'Aprobado. Cupo suficiente.'
        );
    ELSE
        -- Ya no caben (Restaurante lleno) o el tiempo ya está tomado y el odontologo no da abasto (capacity=1)
        RETURN jsonb_build_object(
            'available', false, 
            'requested_pax', p_requested_pax,
            'remaining_capacity', GREATEST(0, v_available_capacity),
            'reason', 'Capacidad excedida para el horario solicitado.'
        );
    END IF;

END;
$$;
