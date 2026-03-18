-- ============================================================
-- WOOX - MIGRACIÓN A SISTEMA RAG MODULAR (TOOL CALLING)
-- Este script:
-- 1. Detiene la inyección sucia de bloques de contexto en el prompt maestro.
-- 2. Crea la base de datos vectorial para el futuro Skill `semantic_search`.
-- ============================================================

-- A. HABILITAR EXTENSIÓN VECTORIAL (Si no existe)
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;

-- B. CREAR ESTRUCTURA PARA RAG EFICIENTE
-- 1. Tabla de Documentos Maestros (ej. "Manual de Empleados.pdf", "Menú Secreto")
CREATE TABLE IF NOT EXISTS public.knowledge_base_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID REFERENCES public.merchants(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    source_type TEXT DEFAULT 'text' CHECK (source_type IN ('text', 'pdf', 'url', 'file')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- 2. Tabla de Segmentos Vectorizados (Los "Chunks" de información listos para buscar)
CREATE TABLE IF NOT EXISTS public.knowledge_base_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES public.knowledge_base_documents(id) ON DELETE CASCADE,
    merchant_id UUID REFERENCES public.merchants(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    embedding vector(768), -- Suponiendo Google Gemini text-embedding-004
    chunk_index INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- Índices para búsqueda ultra rápida (HNSW)
CREATE INDEX IF NOT EXISTS knowledge_base_chunks_embedding_idx 
ON public.knowledge_base_chunks 
USING hnsw (embedding vector_cosine_ops);

-- C. ACTUALIZAR GET_COMPILED_PROMPT (Quitando la basura antigua)
CREATE OR REPLACE FUNCTION public.get_compiled_prompt(p_merchant_id UUID)
RETURNS TEXT AS $$
DECLARE
    v_merchant RECORD;
    v_catalog TEXT := '';
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

    -- NOTA: Se ha eliminado completamente la carga de agent_context_blocks 
    -- y merchant_context_blocks para evitar contaminar el prompt.
    -- La IA usará el Tool 'semantic_search' cuando necesite conocimiento.

    -- 5. ENSAMBLAR PROMPT (Compacto y limpio)
    v_final_prompt := 'Eres el asistente de ' || v_merchant.name || '. Personalidad: ' || v_personality || '.' || E'\n\n';

    IF v_merchant.agent_system_prompt IS NOT NULL AND NULLIF(v_merchant.agent_system_prompt, '') IS NOT NULL THEN
        v_final_prompt := v_final_prompt || v_merchant.agent_system_prompt || E'\n\n';
    END IF;

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
