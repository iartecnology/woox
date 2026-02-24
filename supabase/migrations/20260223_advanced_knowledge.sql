-- ============================================================
-- WOOX - Nueva Generación de Agentes y Conocimiento Avanzado
-- ============================================================

-- 1. Habilitar extensión de vectores para Búsqueda Semántica
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Añadir columnas de embedding a las tablas de conocimiento y configuración sin forzar una dimensionalidad específica
ALTER TABLE agent_context_blocks ADD COLUMN IF NOT EXISTS embedding vector; 
ALTER TABLE merchant_context_blocks ADD COLUMN IF NOT EXISTS embedding vector;

-- 2.1 Actualizar plataforma para soportar Ollama y Embeddings Dedicados
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS ollama_base_url TEXT DEFAULT 'http://localhost:11434';
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS embed_provider TEXT DEFAULT 'google_gemini';
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS embed_model TEXT DEFAULT 'text-embedding-004';
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS embed_api_key TEXT;

-- Forzar recarga del schema cache
NOTIFY pgrst, 'reload schema';

-- 3. Crear Agente: "Concierge Corporativo"
INSERT INTO agents (id, name, description, personality, system_prompt, welcome_message)
VALUES (
    '00000000-0000-0000-0000-000000000002',
    'Concierge Corporativo',
    'Especialista en atención a empresas, logística y soporte técnico avanzado.',
    'professional',
    'Eres el Concierge Corporativo oficial. Tu enfoque es la eficiencia, la precisión técnica y el soporte proactivo. Dominas los manuales operativos y las políticas de la empresa.',
    'Estimado cliente, bienvenido al portal de atención corporativa. ¿En qué proceso técnico o logístico puedo asistirle hoy?'
) ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    description = EXCLUDED.description;

-- 4. Asignar Habilidades al nuevo Agente
INSERT INTO agent_skills (agent_id, skill_id, is_enabled)
SELECT '00000000-0000-0000-0000-000000000002', id, true 
FROM skills_catalog 
WHERE slug IN ('security_foundation', 'knowledge_base')
ON CONFLICT DO NOTHING;

-- 5. Cargar Información de Prueba: "Logística Express" (Conocimiento Maestro para este Agente)
INSERT INTO agent_context_blocks (agent_id, title, content) VALUES
(
    '00000000-0000-0000-0000-000000000002',
    'Política de Envíos Nacionales',
    'Todos los envíos se procesan en un máximo de 24 horas hábiles. La cobertura nacional incluye el 98% del territorio. Los envíos de prioridad oro llegan en menos de 12 horas entre ciudades principales.'
),
(
    '00000000-0000-0000-0000-000000000002',
    'Garantía de Satisfacción Corporativa',
    'Si un paquete sufre daños durante el transporte, la empresa indemniza el 110% del valor declarado en menos de 48 horas tras reportar el siniestro.'
),
(
    '00000000-0000-0000-0000-000000000002',
    'Soporte Técnico de API',
    'Nuestra API REST soporta hasta 1000 requests por minuto por token. El endpoint principal para rastreo es /api/v1/track/{order_id}. Require autenticación Bearer.'
) ON CONFLICT DO NOTHING;

-- 6. Función Avanzada para Búsqueda Semántica (SIMPLIFICADA por ahora con Keywords si no hay embeddings)
CREATE OR REPLACE FUNCTION match_context_blocks(
    p_agent_id UUID,
    p_merchant_id UUID,
    p_query TEXT,
    p_limit INTEGER DEFAULT 5
)
RETURNS TABLE (title TEXT, content TEXT, rank REAL) AS $$
BEGIN
    RETURN QUERY
    SELECT b.title, b.content, ts_rank_cd(to_tsvector('spanish', b.title || ' ' || b.content), plainto_tsquery('spanish', p_query)) as rank
    FROM (
        SELECT title, content FROM agent_context_blocks WHERE agent_id = p_agent_id
        UNION ALL
        SELECT title, content FROM merchant_context_blocks WHERE merchant_id = p_merchant_id
    ) b
    WHERE to_tsvector('spanish', b.title || ' ' || b.content) @@ plainto_tsquery('spanish', p_query)
    ORDER BY rank DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;
