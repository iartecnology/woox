-- ============================================================
-- WOOX - Seed: Escenario de Prueba de Restaurante
-- Crea el comercio "The Grill Master" con industry_type = 'restaurant'
-- para probar la inyección automática del protocolo de diálogo.
-- ============================================================

DO $$
DECLARE
    v_merchant_id UUID;
    v_agent_id UUID;
    v_resource_id UUID;
BEGIN
    -- 1. Obtener ID del Agente Maestro de Reservas
    SELECT id INTO v_agent_id FROM agents WHERE slug = 'concierge-reservas';

    IF v_agent_id IS NULL THEN
        RAISE NOTICE 'Error: Ejecuta primero setup_concierge_agent.sql';
        RETURN;
    END IF;

    -- 2. Crear o Actualizar Comercio de Restaurante
    SELECT id INTO v_merchant_id FROM merchants WHERE slug = 'grill-master-demo';

    IF v_merchant_id IS NULL THEN
        INSERT INTO merchants (name, slug, industry_type, agent_id, ai_personality, ai_welcome_message)
        VALUES (
            'The Grill Master - Steakhouse', 
            'grill-master-demo',
            'restaurant', 
            v_agent_id,
            'Cordial, hospitalario y eficiente.',
            '¡Bienvenidos a The Grill Master! Soy su anfitrión virtual. ¿Desean reservar una mesa?'
        )
        RETURNING id INTO v_merchant_id;
    ELSE
        UPDATE merchants SET 
            industry_type = 'restaurant',
            agent_id = v_agent_id
        WHERE id = v_merchant_id;
    END IF;

    -- 3. Crear Mesas (Recursos)
    INSERT INTO reservable_resources (id, merchant_id, type, name, description, capacity, base_price)
    VALUES 
        ('a1b2c3d4-e5f6-7890-a1b2-c3d4e5f6a1b2', v_merchant_id, 'table', 'Mesa Int 01 (Interior)', 'Mesa cómoda en el salón principal.', 4, 0),
        ('b2c3d4e5-f6a7-8901-b2c3-d4e5f6a7b2c3', v_merchant_id, 'table', 'Gran Mesa Familiar (Interior)', 'Mesa amplia para grupos en zona interior.', 10, 0),
        ('c3d4e5f6-a7b8-9012-c3d4-e5f6a7b8c3d4', v_merchant_id, 'table', 'Mesa Terraza 01 (Terraza)', 'Mesa con aire fresco y vista.', 4, 0)
    ON CONFLICT (id) DO UPDATE SET 
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        capacity = EXCLUDED.capacity;

    -- 4. Crear Horarios de Atención (Lunes a Domingo 08:00 - 22:00) para cada mesa
    INSERT INTO availability_schedules (resource_id, day_of_week, start_time, end_time)
    SELECT r.id, d, '08:00:00', '22:00:00'
    FROM reservable_resources r
    CROSS JOIN generate_series(0, 6) AS d
    WHERE r.merchant_id = v_merchant_id
    ON CONFLICT DO NOTHING;

    RAISE NOTICE 'Seed de Restaurante completado con éxito.';
    RAISE NOTICE 'ID del Comercio (para el simulador): %', v_merchant_id;

END $$;
