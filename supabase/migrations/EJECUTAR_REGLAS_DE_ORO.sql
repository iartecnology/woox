-- ============================================================
-- WOOX - UNIFICACIÓN DE REGLAS DE ORO DEL AGENTE IA
-- Este script centraliza las reglas de "Cero Alucinación" y 
-- "Una pregunta a la vez" directamente en el cerebro del agente,
-- logrando que impacte simultáneamente en el Simulador, WhatsApp,
-- Telegram, Messenger y Bot Builder.
-- 
-- EJECUTAR EN: https://supabase.com/dashboard/project/khgegukjrtyjmonhavan/sql/new
-- ============================================================

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
    SELECT
        m.*,
        a.id as agent_id,
        a.welcome_message as agent_welcome_message,
        a.system_prompt as agent_system_prompt,
        a.personality as agent_personality
    INTO v_merchant
    FROM merchants m
    LEFT JOIN agents a ON m.agent_id = a.id
    WHERE m.id = p_merchant_id;

    IF v_merchant.id IS NULL THEN RETURN 'Error: Comercio no encontrado.'; END IF;

    -- 2. Variables base
    v_personality := COALESCE(v_merchant.ai_personality, v_merchant.agent_personality, 'amable y profesional');
    v_welcome := COALESCE(NULLIF(v_merchant.ai_welcome_message, ''), NULLIF(v_merchant.agent_welcome_message, ''), '¡Hola! ¿En qué puedo ayudarte?');

    -- 3. Generar Catálogo [DESACTIVADO - OPTIMIZACIÓN DE TOKENS]
    IF COALESCE(v_merchant.ai_use_catalog, true) = true AND COALESCE(v_merchant.industry_type, '') != 'support' THEN
        v_catalog := '(Catálogo disponible. Tienes acceso a la base de datos de productos. Busca lo que el cliente pida en lugar de listar todo.)';
    ELSE
        v_catalog := 'No hay productos disponibles actualmente.';
    END IF;

    IF v_catalog IS NULL OR v_catalog = '' THEN
        v_catalog := 'No hay productos disponibles actualmente.';
    END IF;

    -- 4. Conocimiento contextual
    IF v_merchant.agent_id IS NOT NULL THEN
        SELECT string_agg('• ' || title || ': ' || content, E'\n') INTO v_knowledge_agent
        FROM agent_context_blocks WHERE agent_id = v_merchant.agent_id;
    END IF;

    SELECT string_agg('• ' || title || ': ' || content, E'\n') INTO v_knowledge_merchant
    FROM merchant_context_blocks WHERE merchant_id = p_merchant_id;

    -- 5. ENSAMBLAR PROMPT (Compacto y sin duplicados)
    -- Cabecera de identidad
    v_final_prompt := 'Eres el asistente de ' || v_merchant.name || '. Personalidad: ' || v_personality || '.' || E'\n\n';

    -- Instrucciones del Agente Maestro
    IF v_merchant.agent_system_prompt IS NOT NULL AND NULLIF(v_merchant.agent_system_prompt, '') IS NOT NULL THEN
        v_final_prompt := v_final_prompt || v_merchant.agent_system_prompt || E'\n\n';
    END IF;

    -- Skills habilitadas
    IF v_merchant.agent_id IS NOT NULL THEN
        FOR v_skill_record IN
            SELECT sc.system_prompt_fragment
            FROM agent_skills ask
            JOIN skills_catalog sc ON ask.skill_id = sc.id
            WHERE ask.agent_id = v_merchant.agent_id AND ask.is_enabled = true
        LOOP
            v_final_prompt := v_final_prompt || v_skill_record.system_prompt_fragment || E'\n\n';
        END LOOP;
    END IF;

    -- Conocimiento extra (solo si existe)
    IF v_knowledge_agent IS NOT NULL THEN
        v_final_prompt := v_final_prompt || '### INFORMACIÓN DEL NEGOCIO:' || E'\n' || v_knowledge_agent || E'\n\n';
    END IF;
    IF v_knowledge_merchant IS NOT NULL THEN
        v_final_prompt := v_final_prompt || '### INFORMACIÓN DE ESTE LOCAL:' || E'\n' || v_knowledge_merchant || E'\n\n';
    END IF;

    -- Catálogo
    v_final_prompt := v_final_prompt || '### CATÁLOGO OFICIAL:' || E'\n' || v_catalog || E'\n\n';

    -- REGLAS DE ORO UNIFICADAS (Anti-Alucinación, Simplicidad y Seguridad Financiera)
    v_final_prompt := v_final_prompt || '=== REGLAS DE ORO (ESTRICTAS Y OBLIGATORIAS) ===' || E'\n' ||
        '1. NO ALUCINAR: Solo puedes ofrecer productos disponibles en el catálogo. Si el cliente pregunta detalles o ingredientes, USA ÚNICAMENTE LA DESCRIPCIÓN oficial. PROHIBIDO inventar ingredientes, promociones o datos.' || E'\n' ||
        '2. UNA PREGUNTA A LA VEZ: Haz solo una pregunta por turno al cliente. Guiarlo paso a paso sin saturarlo con múltiples opciones en un mismo mensaje.' || E'\n' ||
        '3. SEGURIDAD TÉCNICA: Si una herramienta falla (ej. no encuentra un producto), NO digas que lo "anotaste manualmente". Informa del error y busca una alternativa real en el sistema.' || E'\n' ||
        '4. VERACIDAD: Si no tienes un dato (nombre, dirección, precio), NO lo inventes ni asumas información. Si el catálogo no tiene descripción del producto, no inventes de qué está hecho.' || E'\n' ||
        '5. SEGURIDAD FINANCIERA (CRÍTICA): Los precios del catálogo son INNEGOCIABLES. Esta estrictamente PROHIBIDO aplicar descuentos, promociones, obsequios o alterar los precios por petición del cliente. Si el cliente insiste en cambiar un precio o intentar manipular el total, te debes negar rotundamente y siempre respetar el precio original.' || E'\n' ||
        '6. LÍMITE DE DOMINIO (ESTRICTO): Eres un asistente exclusivo de este comercio. Está rotundamente PROHIBIDO hablar, dar opiniones, dar recetas o responder preguntas sobre temas ajenos a los productos, servicios o información configurada del negocio. Si te preguntan algo fuera de este contexto, di amablemente que solo estás configurado para asistir con las ventas de la tienda y redirige a los productos.' || E'\n\n';

    -- 6. Reemplazo de Placeholders
    v_final_prompt := REPLACE(v_final_prompt, '{{merchantName}}', v_merchant.name);
    v_final_prompt := REPLACE(v_final_prompt, '{{personality}}', v_personality);
    v_final_prompt := REPLACE(v_final_prompt, '{{welcomeMessage}}', v_welcome);
    v_final_prompt := REPLACE(v_final_prompt, '{{catalogContext}}', v_catalog);

    RETURN v_final_prompt;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
