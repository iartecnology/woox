-- WOOX - Refuerzo de Grounding Estricto y Reset de Memoria Base
-- Esta migración implementa la instrucción de "Catálogo como única verdad" solicitada por el usuario.

-- 1. Actualizar el fragmento de la habilidad 'inventory_sales' en el catálogo maestro
UPDATE public.skills_catalog 
SET system_prompt_fragment = '### HABILIDAD: VENTAS Y PEDIDOS (GROUNDING ESTRICTO)
1. **REGLA DE VERACIDAD ABSOLUTA**: Eres un asistente conectado en tiempo real a la base de datos de {{merchantName}}. 
2. **RESET DE MEMORIA**: Olvida todo lo que crees saber sobre productos, precios o menús de este tipo de industria por tu entrenamiento general en internet.
3. **FUENTE ÚNICA DE VERDAD**: Toda tu información sobre productos, precios y disponibilidad DEBE provenir EXCLUSIVAMENTE de la sección ### CATÁLOGO OFICIAL.
4. **PROHIBICIÓN DE ALUCINACIÓN**: Tienes estrictamente prohibido mencionar productos que no estén en la lista enviada. Si el usuario pide algo que no ves en el catálogo, responde: "Lo siento, actualmente no tenemos [Producto] en nuestro menú."
5. **COMANDOS**: Usa `[UPDATE_CART:{"name":"NOMBRE_PRODUCTO", "price":0, "quantity":1}]` para cada ítem que el usuario decida llevar.'
WHERE slug = 'inventory_sales';

-- 2. Actualizar la función RPC para inyectar las advertencias de "Verdad Absoluta" de forma más agresiva
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
    -- 1. Obtener Merchant y Agente
    SELECT m.*, a.id as agent_id, a.welcome_message as agent_welcome_message, a.system_prompt as agent_system_prompt
    INTO v_merchant
    FROM merchants m
    LEFT JOIN agents a ON m.agent_id = a.id
    WHERE m.id = p_merchant_id;

    IF v_merchant.id IS NULL THEN RETURN 'Error: Comercio no encontrado.'; END IF;

    -- 2. Identidad Base y Saludo
    v_prompt := '### TU ROL: Asistente Concierge de ' || v_merchant.name || '.
- Personalidad: ' || COALESCE(v_merchant.ai_personality, 'amable y profesional') || '.
- Saludo Inicial: ' || COALESCE(NULLIF(v_merchant.ai_welcome_message, ''), NULLIF(v_merchant.agent_welcome_message, ''), '¡Hola! ¿En qué puedo ayudarte?') || E'\n\n';

    -- 3. Inyectar Lógica Base del Agente (reemplazando placeholders)
    IF v_merchant.agent_system_prompt IS NOT NULL THEN
        v_prompt := v_prompt || REPLACE(REPLACE(v_merchant.agent_system_prompt, '{{merchantName}}', v_merchant.name), '{{personality}}', COALESCE(v_merchant.ai_personality, 'amable')) || E'\n\n';
    END IF;

    -- 4. Inyectar Skills Habilitadas
    FOR v_skill_record IN 
        SELECT sc.slug, sc.system_prompt_fragment 
        FROM agent_skills ask
        JOIN skills_catalog sc ON ask.skill_id = sc.id
        WHERE ask.agent_id = v_merchant.agent_id AND ask.is_enabled = true
    LOOP
        -- Reemplazar placeholders en el fragmento de la habiliad
        v_prompt := v_prompt || REPLACE(v_skill_record.system_prompt_fragment, '{{merchantName}}', v_merchant.name) || E'\n\n';

        -- Lógica de Datos Dinámicos para 'inventory_sales'
        IF v_skill_record.slug = 'inventory_sales' THEN
            -- Solo inyectamos catálogo si el comercio lo tiene habilitado
            IF COALESCE(v_merchant.ai_use_catalog, true) = false THEN
                 v_prompt := v_prompt || '### AVISO: CATÁLOGO DESHABILITADO ###' || E'\n' ||
                            'No tienes acceso al catálogo de productos por configuración del administrador.' || E'\n\n';
            ELSIF v_merchant.industry_type = 'support' THEN
                v_prompt := v_prompt || '### AVISO: MODO SOPORTE ACTIVO ###' || E'\n' ||
                            'Enfócate en ayudar con dudas técnicas. No hay un catálogo para la venta directa.' || E'\n\n';
            ELSE
                SELECT string_agg(
                    '➔ [' || COALESCE(c.name, 'Otras Categorías') || '] ' || p.name || ' | Precio: $' || p.price || 
                    CASE WHEN p.is_available THEN ' | [DISPONIBLE]' ELSE ' | [AGOTADO]' END ||
                    CASE WHEN p.description IS NOT NULL AND p.description != '' THEN E'\n   └─ ' || p.description ELSE '' END,
                    E'\n'
                ) INTO v_catalog
                FROM products p
                LEFT JOIN categories c ON p.category_id = c.id
                WHERE p.merchant_id = p_merchant_id
                ORDER BY c.name, p.name;
                
                IF v_catalog IS NOT NULL THEN
                    v_prompt := v_prompt || 
                               E'### !!! FUENTE DE VERDAD ABSOLUTA - CATÁLOGO OFICIAL !!! ###\n' || 
                               'IMPORTANTE: Olvida cualquier conocimiento previo sobre productos, menús o precios de este tipo de negocio que tengas de tu entrenamiento general.\n' ||
                               'Tu ÚNICA fuente de verdad es la lista que se muestra a continuación. Si un producto NO está en esta lista, NO EXISTE para ti. No lo inventes ni lo menciones.\n\n' ||
                               'LISTA DE PRODUCTOS REALES EN ' || v_merchant.name || ':\n' ||
                               v_catalog || E'\n\n';
                ELSE
                    v_prompt := v_prompt || '### !!! CATÁLOGO OFICIAL VACÍO !!! ###' || E'\n' || 
                               'ADVERTENCIA: No hay productos cargados en el inventario aún para este local.' || E'\n' ||
                               'Informa al cliente que estamos actualizando el menú y ofrece tomar sus datos para contactarlo luego.' || E'\n\n';
                END IF;
            END IF;
        END IF;

        -- Lógica de Conocimiento (Knowledge Base)
        IF v_skill_record.slug = 'knowledge_base' THEN
            -- 1. Conocimiento Maestro (Agente)
            SELECT string_agg('• ' || title || ': ' || content, E'\n') INTO v_knowledge
            FROM agent_context_blocks WHERE agent_id = v_merchant.agent_id;
            
            IF v_knowledge IS NOT NULL THEN
                v_prompt := v_prompt || '### CONOCIMIENTO MAESTRO (REGLAS GENERALES):' || E'\n' || v_knowledge || E'\n\n';
            END IF;

            -- 2. Conocimiento Específico (Comercio) - PRIORIDAD ALTA
            v_knowledge := NULL;
            SELECT string_agg('• ' || title || ': ' || content, E'\n') INTO v_knowledge
            FROM merchant_context_blocks WHERE merchant_id = p_merchant_id;

            IF v_knowledge IS NOT NULL THEN
                v_prompt := v_prompt || '### CONOCIMIENTO ESPECÍFICO DEL LOCAL (MÁXIMA PRIORIDAD):' || E'\n' || 
                           'Usa esta información específica para responder sobre este punto de venta:' || E'\n' ||
                           v_knowledge || E'\n\n';
            END IF;
        END IF;
    END LOOP;

    -- 5. Personalización Final del Comercio
    IF v_merchant.ai_restrictions IS NOT NULL AND v_merchant.ai_restrictions != '' THEN
        v_prompt := v_prompt || '### RESTRICCIONES PERSONALIZADAS ###' || E'\n' || v_merchant.ai_restrictions || E'\n\n';
    END IF;

    IF v_merchant.ai_system_prompt IS NOT NULL AND v_merchant.ai_system_prompt != '' THEN
        v_prompt := v_prompt || '### INSTRUCCIONES ADICIONALES DEL COMERCIO ###' || E'\n' || v_merchant.ai_system_prompt || E'\n\n';
    END IF;

    RETURN v_prompt;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
