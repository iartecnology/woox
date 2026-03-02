-- ============================================================
-- WOOX - Datos de Prueba para Reservas (Full Suite)
-- Crea Empresa, Recursos y Reservas para demostración.
-- ============================================================

DO $$
DECLARE
    v_merchant_id UUID;
    v_customer_id UUID;
    v_agent_id UUID;
    v_resource_dr UUID;
    v_resource_mesa UUID;
BEGIN
    -- 1. Crear Empresa (Merchant) de Prueba
    -- Note: Agregamos 'slug' que es obligatorio (NOT NULL)
    SELECT id INTO v_merchant_id FROM merchants WHERE name = 'Clínica Dental Woox Premium' OR slug = 'clinica-dental-demo';

    IF v_merchant_id IS NULL THEN
        INSERT INTO merchants (name, slug, industry_type, ai_personality, ai_welcome_message)
        VALUES (
            'Clínica Dental Woox Premium', 
            'clinica-dental-demo',
            'reservations', 
            'Profesional, experta y empática.', 
            '¡Hola! Soy el asistente de la Clínica Dental Woox. ¿En qué podemos ayudarte hoy?'
        )
        RETURNING id INTO v_merchant_id;
    ELSE
        UPDATE merchants SET 
            industry_type = 'reservations',
            ai_personality = 'Profesional, experta y empática.',
            ai_welcome_message = '¡Hola! Soy el asistente de la Clínica Dental Woox. ¿En qué podemos ayudarte hoy?'
        WHERE id = v_merchant_id;
    END IF;

    -- 2. Asegurar que tenga el Agente de Reservas asignado
    SELECT id INTO v_agent_id FROM agents WHERE slug = 'concierge-reservas';
    IF v_agent_id IS NOT NULL THEN
        UPDATE merchants SET agent_id = v_agent_id WHERE id = v_merchant_id;
    END IF;
    
    -- 3. Crear Cliente de Prueba
    SELECT id INTO v_customer_id FROM customers WHERE merchant_id = v_merchant_id AND full_name = 'Ricardo Bernal' LIMIT 1;
    
    IF v_customer_id IS NULL THEN
        INSERT INTO customers (merchant_id, full_name, phone)
        VALUES (v_merchant_id, 'Ricardo Bernal', '+573001234567')
        RETURNING id INTO v_customer_id;
    END IF;

    -- 4. Crear Recursos de Prueba
    -- Doctor/Servicio
    INSERT INTO reservable_resources (merchant_id, type, name, description, duration_minutes, buffer_time_minutes, base_price)
    VALUES (v_merchant_id, 'service', 'Dr. Camilo Sánchez (Odontología)', 'Especialista en ortodoncia.', 45, 15, 120000)
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_resource_dr;

    IF v_resource_dr IS NULL THEN
        SELECT id INTO v_resource_dr FROM reservable_resources WHERE merchant_id = v_merchant_id AND name = 'Dr. Camilo Sánchez (Odontología)';
    END IF;

    -- Mesa
    INSERT INTO reservable_resources (merchant_id, type, name, description, capacity, base_price)
    VALUES (v_merchant_id, 'table', 'Mesa VIP 01 (Terraza)', 'Mesa con vista al mar.', 4, 50000)
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_resource_mesa;

    IF v_resource_mesa IS NULL THEN
        SELECT id INTO v_resource_mesa FROM reservable_resources WHERE merchant_id = v_merchant_id AND name = 'Mesa VIP 01 (Terraza)';
    END IF;

    -- 5. Crear Reservas para HOY
    -- 9:00 AM - Dr. Sánchez
    INSERT INTO bookings (merchant_id, customer_id, resource_id, start_time, end_time, status, pax, channel)
    VALUES (v_merchant_id, v_customer_id, v_resource_dr, CURRENT_DATE + TIME '09:00:00', CURRENT_DATE + TIME '09:45:00', 'confirmed', 1, 'whatsapp')
    ON CONFLICT DO NOTHING;

    -- 11:00 AM - Dr. Sánchez
    INSERT INTO bookings (merchant_id, customer_id, resource_id, start_time, end_time, status, pax, channel)
    VALUES (v_merchant_id, v_customer_id, v_resource_dr, CURRENT_DATE + TIME '11:00:00', CURRENT_DATE + TIME '11:45:00', 'pending', 1, 'telegram')
    ON CONFLICT DO NOTHING;

    -- 1:00 PM - Mesa VIP
    INSERT INTO bookings (merchant_id, customer_id, resource_id, start_time, end_time, status, pax, channel)
    VALUES (v_merchant_id, v_customer_id, v_resource_mesa, CURRENT_DATE + TIME '13:00:00', CURRENT_DATE + TIME '15:00:00', 'confirmed', 4, 'web')
    ON CONFLICT DO NOTHING;

    -- Bloqueo global de Almuerzo
    INSERT INTO availability_exceptions (merchant_id, start_datetime, end_datetime, reason, is_block)
    VALUES (v_merchant_id, CURRENT_DATE + TIME '12:00:00', CURRENT_DATE + TIME '13:00:00', 'Almuerzo Staff', true)
    ON CONFLICT DO NOTHING;

    -- Imprimir el ID para que el usuario lo sepa
    RAISE NOTICE 'Seed completado. Merchant ID: %', v_merchant_id;

END $$;
