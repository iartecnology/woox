-- ============================================================
-- WOOX - Agente Concierge de Reservaciones Maestro
-- Vincula los Motores Técnicos y prepara el Agente para
-- usar cualquier protocolo según el comercio.
-- ============================================================

DO $$
DECLARE
    v_agent_id UUID;
    v_skill_engine_avail UUID;
    v_skill_engine_book UUID;
BEGIN
    -- 1. Buscar o Crear el Agente Concierge Maestro
    SELECT id INTO v_agent_id FROM agents WHERE slug = 'concierge-reservas';
    
    IF v_agent_id IS NULL THEN
        INSERT INTO agents (name, slug, system_prompt, welcome_message, personality)
        VALUES (
            'Concierge Reservas Maestro', 
            'concierge-reservas', 
            'Eres el recepcionista inteligente de {{merchantName}}. Tu misión es gestionar agendas, mesas y servicios de forma impecable.',
            '¡Hola! Soy tu asistente de reservas. ¿Cómo puedo ayudarte hoy?',
            'Eficiente, organizado y muy amable.'
        )
        RETURNING id INTO v_agent_id;
    END IF;

    -- 2. Obtener IDs de los Motores Técnicos (Habilidades Core)
    SELECT id INTO v_skill_engine_avail FROM skills_catalog WHERE slug = 'engine_availability';
    SELECT id INTO v_skill_engine_book FROM skills_catalog WHERE slug = 'engine_booking';

    -- 3. Vincular Motores Técnicos al Agente Reservas (SIEMPRE ACTIVOS)
    INSERT INTO agent_skills (agent_id, skill_id, is_enabled)
    VALUES (v_agent_id, v_skill_engine_avail, true)
    ON CONFLICT (agent_id, skill_id) DO UPDATE SET is_enabled = true;

    INSERT INTO agent_skills (agent_id, skill_id, is_enabled)
    VALUES (v_agent_id, v_skill_engine_book, true)
    ON CONFLICT (agent_id, skill_id) DO UPDATE SET is_enabled = true;

    -- 4. Nota: Los protocolos específicos (Restaurante, Hotel, etc.) 
    -- Se activarán dinámicamente según la industria del Merchant.
    -- Para fines de prueba, activémoslos todos al agente maestro, 
    -- el prompt compilado filtrará por lógica de industria si lo deseamos.

END $$;
