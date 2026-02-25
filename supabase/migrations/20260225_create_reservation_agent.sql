-- ============================================================
-- WOOX - Agente Concierge de Reservaciones
-- Crea un agente especializado y pre-configura sus habilidades.
-- ============================================================

DO $$
DECLARE
    v_agent_id UUID;
    v_skill_check_id UUID;
    v_skill_book_id UUID;
    v_skill_sec_id UUID;
    v_skill_knw_id UUID;
BEGIN
    -- 1. Crear el Agente (si no existe uno con este nombre)
    INSERT INTO public.agents (name, slug, description, personality, welcome_message, system_prompt)
    VALUES (
        'Concierge de Reservaciones', 
        'concierge-reservas', 
        'Agente experto en gestión de citas, mesas y disponibilidad en tiempo real.',
        'Atento, organizado y muy eficiente. Siempre confirma disponibilidad antes de prometer un hueco.',
        '¡Hola! Soy tu asistente de reservas. ¿Para cuándo necesitas tu cita?',
        'Tu misión es gestionar la agenda del negocio de forma impecable. Sigue siempre los protocolos de verificación de disponibilidad.'
    )
    ON CONFLICT (slug) DO UPDATE SET 
        personality = EXCLUDED.personality,
        system_prompt = EXCLUDED.system_prompt
    RETURNING id INTO v_agent_id;

    -- 2. Obtener IDs de las skills
    SELECT id INTO v_skill_check_id FROM skills_catalog WHERE slug = 'availability_check';
    SELECT id INTO v_skill_book_id FROM skills_catalog WHERE slug = 'booking_management';
    SELECT id INTO v_skill_sec_id FROM skills_catalog WHERE slug = 'security_foundation';
    SELECT id INTO v_skill_knw_id FROM skills_catalog WHERE slug = 'knowledge_base';

    -- 3. Asignar Skills al Agente
    -- availability_check
    IF v_skill_check_id IS NOT NULL THEN
        INSERT INTO agent_skills (agent_id, skill_id, is_enabled)
        VALUES (v_agent_id, v_skill_check_id, true) ON CONFLICT DO NOTHING;
    END IF;

    -- booking_management
    IF v_skill_book_id IS NOT NULL THEN
        INSERT INTO agent_skills (agent_id, skill_id, is_enabled)
        VALUES (v_agent_id, v_skill_book_id, true) ON CONFLICT DO NOTHING;
    END IF;

    -- security_foundation
    IF v_skill_sec_id IS NOT NULL THEN
        INSERT INTO agent_skills (agent_id, skill_id, is_enabled)
        VALUES (v_agent_id, v_skill_sec_id, true) ON CONFLICT DO NOTHING;
    END IF;

    -- knowledge_base
    IF v_skill_knw_id IS NOT NULL THEN
        INSERT INTO agent_skills (agent_id, skill_id, is_enabled)
        VALUES (v_agent_id, v_skill_knw_id, true) ON CONFLICT DO NOTHING;
    END IF;

END $$;
