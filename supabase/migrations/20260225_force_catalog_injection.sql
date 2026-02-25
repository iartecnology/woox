-- WOOX - Reconstrucción de get_compiled_prompt para Máxima Autoridad
-- Esta migración asegura que el catálogo se inyecte SIEMPRE que esté habilitado,
-- incluso si no hay un Agente Maestro asignado o si la Skill está desactivada (como respaldo).

CREATE OR REPLACE FUNCTION public.get_compiled_prompt(p_merchant_id UUID)
RETURNS TEXT AS $$
DECLARE
    v_merchant RECORD;
    v_prompt TEXT := '';
    v_catalog TEXT := '';
    v_knowledge TEXT := '';
    v_skill_record RECORD;
    v_catalog_was_injected BOOLEAN := false;
BEGIN
    -- 1. Obtener Merchant y Agente
    SELECT m.*, a.id as agent_id, a.welcome_message as agent_welcome_message, a.system_prompt as agent_system_prompt
    INTO v_merchant
    FROM merchants m
    LEFT JOIN agents a ON m.agent_id = a.id
    WHERE m.id = p_merchant_id;

    IF v_merchant.id IS NULL THEN RETURN 'Error: Comercio no encontrado.'; END IF;

    -- 2. Identidad Base y Saludo
    v_prompt := '### TU ROL: Asistente Virtual Expert de ' || v_merchant.name || '.
- Personalidad: ' || COALESCE(v_merchant.ai_personality, 'amable y profesional') || '.
- Saludo Inicial: ' || COALESCE(NULLIF(v_merchant.ai_welcome_message, ''), NULLIF(v_merchant.agent_welcome_message, ''), '¡Hola! ¿En qué puedo ayudarte?') || E'\n\n';

    -- 3. Inyectar Lógica Base del Agente
    IF v_merchant.agent_system_prompt IS NOT NULL THEN
        v_prompt := v_prompt || REPLACE(REPLACE(v_merchant.agent_system_prompt, '{{merchantName}}', v_merchant.name), '{{personality}}', COALESCE(v_merchant.ai_personality, 'amable')) || E'\n\n';
    END IF;

    -- 4. Inyectar Skills Habilitadas
    IF v_merchant.agent_id IS NOT NULL THEN
        FOR v_skill_record IN 
            SELECT sc.slug, sc.system_prompt_fragment 
            FROM agent_skills ask
            JOIN skills_catalog sc ON ask.skill_id = sc.id
            WHERE ask.agent_id = v_merchant.agent_id AND ask.is_enabled = true
        LOOP
            v_prompt := v_prompt || REPLACE(v_skill_record.system_prompt_fragment, '{{merchantName}}', v_merchant.name) || E'\n\n';

            -- Lógica de Datos Dinámicos para 'inventory_sales'
            IF v_skill_record.slug = 'inventory_sales' THEN
                SELECT string_agg(
                    '➔ [' || COALESCE(c.name, 'Otros') || '] ' || p.name || ' | Precio: $' || p.price || 
                    CASE WHEN p.is_available THEN ' | [EN STOCK]' ELSE ' | [AGOTADO]' END,
                    E'\n'
                ) INTO v_catalog
                FROM products p
                LEFT JOIN categories c ON p.category_id = c.id
                WHERE p.merchant_id = p_merchant_id AND p.is_available = true
                ORDER BY c.name, p.name;
                
                IF v_catalog IS NOT NULL THEN
                    v_prompt := v_prompt || 
                               E'### !!! FUENTE DE VERDAD ABSOLUTA - CATÁLOGO OFICIAL !!! ###\n' || 
                               'IMPORTANTE: Olvida cualquier conocimiento previo de tu entrenamiento general.\n' ||
                               'Tu ÚNICA fuente de verdad es esta lista:\n\n' ||
                               v_catalog || E'\n\n';
                    v_catalog_was_injected := true;
                END IF;
            END IF;

            -- Lógica de Conocimiento
            IF v_skill_record.slug = 'knowledge_base' THEN
                SELECT string_agg('• ' || title || ': ' || content, E'\n') INTO v_knowledge
                FROM agent_context_blocks WHERE agent_id = v_merchant.agent_id;
                IF v_knowledge IS NOT NULL THEN v_prompt := v_prompt || '### CONOCIMIENTO MAESTRO:' || E'\n' || v_knowledge || E'\n\n'; END IF;

                v_knowledge := NULL;
                SELECT string_agg('• ' || title || ': ' || content, E'\n') INTO v_knowledge
                FROM merchant_context_blocks WHERE merchant_id = p_merchant_id;
                IF v_knowledge IS NOT NULL THEN v_prompt := v_prompt || '### CONOCIMIENTO COMPLEMENTARIO:' || E'\n' || v_knowledge || E'\n\n'; END IF;
            END IF;
        END LOOP;
    END IF;

    -- 5. RESPALDO SEGURIDAD (Si el catálogo no se inyectó por skill pero está habilitado)
    IF v_catalog_was_injected = false AND COALESCE(v_merchant.ai_use_catalog, true) = true THEN
         SELECT string_agg(
            '➔ ' || p.name || ' | $' || p.price,
            E'\n'
        ) INTO v_catalog
        FROM products p
        WHERE p.merchant_id = p_merchant_id AND p.is_available = true;

        IF v_catalog IS NOT NULL THEN
            v_prompt := v_prompt || 
                       E'### CATÁLOGO DE PRODUCTOS (FUENTE ÚNICA DE VERDAD):\n' || 
                       'No inventes productos. Solo existen estos:\n' ||
                       v_catalog || E'\n\n';
        END IF;
    END IF;

    -- 6. Personalización Final
    IF NULLIF(v_merchant.ai_restrictions, '') IS NOT NULL THEN
        v_prompt := v_prompt || '### RESTRICCIONES ###' || E'\n' || v_merchant.ai_restrictions || E'\n\n';
    END IF;

    IF NULLIF(v_merchant.ai_system_prompt, '') IS NOT NULL THEN
        v_prompt := v_prompt || '### INSTRUCCIONES MANUALES ###' || E'\n' || v_merchant.ai_system_prompt || E'\n\n';
    END IF;

    RETURN v_prompt;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
