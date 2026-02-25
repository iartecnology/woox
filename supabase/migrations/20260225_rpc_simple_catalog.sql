-- WOOX - Re-corrección get_compiled_prompt (Eliminación de JOIN problemático)
-- Esta versión simplifica al máximo la agregación para evitar errores de Postgres.

CREATE OR REPLACE FUNCTION public.get_compiled_prompt(p_merchant_id UUID)
RETURNS TEXT AS $$
DECLARE
    v_merchant RECORD;
    v_catalog TEXT := '';
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

    -- 3. Generar Catálogo (Sin JOIN para evitar error 42803)
    IF COALESCE(v_merchant.ai_use_catalog, true) = true AND v_merchant.industry_type != 'support' THEN
        SELECT string_agg('➔ ' || name || ' | Precio: $' || price, E'\n') INTO v_catalog
        FROM products
        WHERE merchant_id = p_merchant_id AND is_available = true;
    END IF;

    IF v_catalog IS NULL OR v_catalog = '' THEN v_catalog := 'No hay productos disponibles actualmente.'; END IF;

    -- 4. Conocimiento
    SELECT string_agg('• ' || title || ': ' || content, E'\n') INTO v_knowledge_agent
    FROM agent_context_blocks WHERE agent_id = v_merchant.agent_id;
    
    SELECT string_agg('• ' || title || ': ' || content, E'\n') INTO v_knowledge_merchant
    FROM merchant_context_blocks WHERE merchant_id = p_merchant_id;

    -- 5. Ensamblar Prompt
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

    v_final_prompt := v_final_prompt || '### CATÁLOGO OFICIAL (FUENTE ÚNICA DE VERDAD):\n' || v_catalog || E'\n\n';

    -- 6. Placeholders
    v_final_prompt := REPLACE(v_final_prompt, '{{merchantName}}', v_merchant.name);
    v_final_prompt := REPLACE(v_final_prompt, '{{personality}}', v_personality);
    v_final_prompt := REPLACE(v_final_prompt, '{{welcomeMessage}}', v_welcome);
    v_final_prompt := REPLACE(v_final_prompt, '{{catalogContext}}', v_catalog);

    RETURN v_final_prompt;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
