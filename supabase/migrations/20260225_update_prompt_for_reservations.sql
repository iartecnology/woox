-- WOOX - Actualización de get_compiled_prompt para incluir Recursos Reservables
-- Esta versión inyecta la lista de recursos si el merchant los tiene activos.

CREATE OR REPLACE FUNCTION public.get_compiled_prompt(p_merchant_id UUID)
RETURNS TEXT AS $$
DECLARE
    v_merchant RECORD;
    v_catalog TEXT := '';
    v_resources TEXT := '';
    v_knowledge_agent TEXT := '';
    v_knowledge_merchant TEXT := '';
    v_skill_record RECORD;
    v_personality TEXT;
    v_welcome TEXT;
    v_final_prompt TEXT;
BEGIN
    -- 1. Obtener Merchant y Agente
    SELECT m.*, a.id as agent_id, a.welcome_message as agent_welcome_message, a.system_prompt as agent_system_prompt, a.personality as agent_personality
    INTO v_merchant
    FROM merchants m
    LEFT JOIN agents a ON m.agent_id = a.id
    WHERE m.id = p_merchant_id;

    IF v_merchant.id IS NULL THEN RETURN 'Error: Comercio no encontrado.'; END IF;

    -- 2. Variables base
    v_personality := COALESCE(v_merchant.ai_personality, v_merchant.agent_personality, 'amable y profesional');
    v_welcome := COALESCE(NULLIF(v_merchant.ai_welcome_message, ''), NULLIF(v_merchant.agent_welcome_message, ''), '¡Hola! ¿En qué puedo ayudarte?');

    -- 3. Generar Catálogo
    IF COALESCE(v_merchant.ai_use_catalog, true) = true AND COALESCE(v_merchant.industry_type, '') NOT IN ('support', 'reservations') THEN
        SELECT string_agg(item_line, E'\n') INTO v_catalog
        FROM (
            SELECT '➔ [' || COALESCE(c.name, 'Otros') || '] ' || p.name || ' | Precio: $' || p.price as item_line
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            WHERE p.merchant_id = p_merchant_id AND p.is_available = true
            ORDER BY c.name, p.name
        ) sub;
    END IF;

    -- 4. Generar Recursos Reservables (Si aplica)
    IF v_merchant.industry_type = 'reservations' THEN
        SELECT string_agg(res_line, E'\n') INTO v_resources
        FROM (
            SELECT '📅 [RECURSO] ' || name || ' (Tipo: ' || type || ') | ID: ' || id as res_line
            FROM reservable_resources
            WHERE merchant_id = p_merchant_id AND is_active = true
            ORDER BY created_at ASC
        ) res_sub;
    END IF;

    IF v_catalog IS NULL OR v_catalog = '' THEN v_catalog := 'No hay productos disponibles actualmente.'; END IF;
    IF v_resources IS NULL OR v_resources = '' THEN v_resources := 'No hay recursos reservables configurados.'; END IF;

    -- 5. Conocimiento
    SELECT string_agg('• ' || title || ': ' || content, E'\n') INTO v_knowledge_agent
    FROM agent_context_blocks WHERE agent_id = v_merchant.agent_id;
    
    SELECT string_agg('• ' || title || ': ' || content, E'\n') INTO v_knowledge_merchant
    FROM merchant_context_blocks WHERE merchant_id = p_merchant_id;

    -- 6. Ensamblar
    v_final_prompt := '### TU ROL: Asistente Concierge de ' || v_merchant.name || E'.\n\n' ||
                      '### IDENTIDAD BASE:\n- Personalidad: ' || v_personality || E'.\n- Saludo: ' || v_welcome || E'\n\n';

    IF v_merchant.agent_system_prompt IS NOT NULL THEN
        v_final_prompt := v_final_prompt || '### LÓGICA MAESTRA (AGENTE):\n' || v_merchant.agent_system_prompt || E'\n\n';
    END IF;

    FOR v_skill_record IN 
        SELECT sc.slug, sc.system_prompt_fragment 
        FROM agent_skills ask
        JOIN skills_catalog sc ON ask.skill_id = sc.id
        WHERE ask.agent_id = v_merchant.agent_id AND ask.is_enabled = true
    LOOP
        v_final_prompt := v_final_prompt || '### HABILIDAD: ' || v_skill_record.slug || E'\n' || v_skill_record.system_prompt_fragment || E'\n\n';
    END LOOP;

    IF v_knowledge_agent IS NOT NULL THEN v_final_prompt := v_final_prompt || '### CONOCIMIENTO MAESTRO:\n' || v_knowledge_agent || E'\n\n'; END IF;
    IF v_knowledge_merchant IS NOT NULL THEN v_final_prompt := v_final_prompt || '### CONOCIMIENTO ESPECÍFICO DEL LOCAL:\n' || v_knowledge_merchant || E'\n\n'; END IF;

    IF NULLIF(v_merchant.ai_restrictions, '') IS NOT NULL THEN
        v_final_prompt := v_final_prompt || '### RESTRICCIONES DEL LOCAL:\n' || v_merchant.ai_restrictions || E'\n\n'; END IF;
    IF NULLIF(v_merchant.ai_system_prompt, '') IS NOT NULL THEN
        v_final_prompt := v_final_prompt || '### INSTRUCCIONES ADICIONALES DEL COMERCIO:\n' || v_merchant.ai_system_prompt || E'\n\n'; END IF;

    IF v_merchant.industry_type = 'reservations' THEN
        v_final_prompt := v_final_prompt || '### RECURSOS (LO QUE PUEDES AGENDAR):\n' || v_resources || E'\n\n';
    ELSE
        v_final_prompt := v_final_prompt || '### CATÁLOGO OFICIAL (FUENTE ÚNICA DE VERDAD):\n' || v_catalog || E'\n\n';
    END IF;

    -- 7. Placeholders finales
    v_final_prompt := REPLACE(v_final_prompt, '{{merchantName}}', v_merchant.name);
    
    RETURN v_final_prompt;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
