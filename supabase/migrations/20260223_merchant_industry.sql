-- Agregar columna de industria a merchants
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS industry_type TEXT DEFAULT 'retail';

-- Actualizar la función get_compiled_prompt para soportar Múltiples Industrias y Saludos Prioritarios
CREATE OR REPLACE FUNCTION public.get_compiled_prompt(p_merchant_id UUID)
RETURNS TEXT AS $$
DECLARE
    v_merchant RECORD;
    v_prompt TEXT := '';
    v_catalog TEXT := '';
    v_knowledge TEXT := '';
    v_categories TEXT := '';
    v_skill_record RECORD;
BEGIN
    -- Obtener Merchant y Agente, con soporte al saludo del agente como fallback
    SELECT m.*, a.id as agent_id, a.welcome_message as agent_welcome_message
    INTO v_merchant
    FROM merchants m
    LEFT JOIN agents a ON m.agent_id = a.id
    WHERE m.id = p_merchant_id;

    IF v_merchant.id IS NULL THEN RETURN 'Error: Comercio no encontrado.'; END IF;

    -- A. Identidad Base (Prioridad: Saludo Comercio -> Saludo Agente -> Por defecto)
    v_prompt := '### TU ROL: Asistente Concierge de ' || v_merchant.name || '.
- Personalidad: ' || COALESCE(v_merchant.ai_personality, 'amable y profesional') || '.
- Saludo Inicial: ' || COALESCE(NULLIF(v_merchant.ai_welcome_message, ''), NULLIF(v_merchant.agent_welcome_message, ''), '¡Hola! ¿En qué puedo ayudarte?') || E'\n\n';

    -- B. Generar Bloques de Datos de Categorías
    SELECT string_agg(DISTINCT name, ', ' ORDER BY name) INTO v_categories
    FROM categories WHERE merchant_id = p_merchant_id;

    -- C. Inyectar Skills Habilitadas desde la Tabla Relacional
    FOR v_skill_record IN 
        SELECT sc.slug, sc.system_prompt_fragment 
        FROM agent_skills ask
        JOIN skills_catalog sc ON ask.skill_id = sc.id
        WHERE ask.agent_id = v_merchant.agent_id AND ask.is_enabled = true
    LOOP
        v_prompt := v_prompt || v_skill_record.system_prompt_fragment || E'\n\n';

        -- Lógica especial para 'inventory_sales'
        -- Si la industria es 'support', NOS SALTAMOS la carga del catálogo para ahorrar tokens y evitar alucinaciones.
        IF v_skill_record.slug = 'inventory_sales' THEN
            IF v_merchant.industry_type = 'support' THEN
                v_prompt := v_prompt || '### AVISO: MODO ATENCIÓN AL CLIENTE ###' || E'\n' ||
                            'Esta empresa opera en modo soporte. No intentes listar un menú de productos para venta.' || E'\n\n';
            ELSE
                SELECT string_agg(
                    '➔ [' || COALESCE(c.name, 'Otras Categorías') || '] ' || p.name || ' | Precio: $' || p.price || 
                    CASE WHEN p.is_available THEN ' | Estado: EN STOCK' ELSE ' | Estado: AGOTADO' END ||
                    CASE WHEN p.description IS NOT NULL AND p.description != '' THEN E'\n   └─ Descripción: ' || p.description ELSE '' END,
                    E'\n'
                ) INTO v_catalog
                FROM products p
                LEFT JOIN categories c ON p.category_id = c.id
                WHERE p.merchant_id = p_merchant_id
                ORDER BY c.name, p.name;
                
                IF v_catalog IS NOT NULL THEN
                    v_prompt := v_prompt || '### !!! FUENTE DE VERDAD ABSOLUTA - CATÁLOGO OFICIAL !!!' || E'\n' || 
                               'Esta es la lista real y única de productos (servicios) en la base de datos local.' || E'\n' ||
                               'SI ALGO NO ESTÁ AQUÍ, NO EXISTE. NO LO INVENTES.' || E'\n' ||
                               v_catalog || E'\n\n';
                ELSE
                    v_prompt := v_prompt || '### !!! CATÁLOGO OFICIAL VACÍO !!!' || E'\n' || 
                               'ADVERTENCIA: No hay configuraciones previas guardadas en el inventario.' || E'\n' ||
                               'No intentes vender nada. Enfócate en la atención.' || E'\n\n';
                END IF;
            END IF;
        END IF;

        IF v_skill_record.slug = 'knowledge_base' THEN
            -- 1. Conocimiento Maestro (Agente)
            SELECT string_agg('• ' || title || ': ' || content, E'\n') INTO v_knowledge
            FROM agent_context_blocks WHERE agent_id = v_merchant.agent_id;
            
            IF v_knowledge IS NOT NULL THEN
                v_prompt := v_prompt || '### CONOCIMIENTO MAESTRO (REGLAS GENERALES DEL AGENTE):' || E'\n' || v_knowledge || E'\n\n';
            END IF;

            -- 2. Conocimiento Específico (Comercio) - PRIORIDAD ALTA
            v_knowledge := NULL;
            SELECT string_agg('• ' || title || ': ' || content, E'\n') INTO v_knowledge
            FROM merchant_context_blocks WHERE merchant_id = p_merchant_id;

            IF v_knowledge IS NOT NULL THEN
                v_prompt := v_prompt || '### CONOCIMIENTO ESPECÍFICO DE LA SUCURSAL/LOCAL (PRIORIDAD MÁXIMA):' || E'\n' || 
                           'Usa esta información para responder sobre horarios, políticas locales o detalles del negocio puntual:' || E'\n' ||
                           v_knowledge || E'\n\n';
            END IF;
            
            IF v_knowledge IS NULL AND v_prompt NOT LIKE '%### CONOCIMIENTO MAESTRO%' THEN
                v_prompt := v_prompt || '### CONOCIMIENTO EXTRA:' || E'\n' || 'Sin información adicional.' || E'\n\n';
            END IF;
        END IF;
    END LOOP;

    -- D. Personalización y Restricciones del Comercio
    IF v_merchant.ai_menu_context IS NOT NULL AND v_merchant.ai_menu_context != '' THEN
        v_prompt := v_prompt || '### CONTEXTO DE MENÚ ADICIONAL:' || E'\n' || v_merchant.ai_menu_context || E'\n\n';
    END IF;

    IF v_merchant.ai_restrictions IS NOT NULL AND v_merchant.ai_restrictions != '' THEN
        v_prompt := v_prompt || '### RESTRICCIONES ESPECÍFICAS DE ESTE LOCAL:' || E'\n' || v_merchant.ai_restrictions || E'\n\n';
    END IF;

    IF v_merchant.ai_system_prompt IS NOT NULL AND v_merchant.ai_system_prompt != '' THEN
        v_prompt := v_prompt || '### INSTRUCCIONES MANUALES DE ESTE LOCAL:' || E'\n' || v_merchant.ai_system_prompt || E'\n\n';
    END IF;

    RETURN v_prompt;
END;
$$ LANGUAGE plpgsql;

NOTIFY pgrst, 'reload schema';
