-- ============================================================
-- WOOX - Función de Búsqueda Semántica Optimizada para Python Engine
-- ============================================================

CREATE OR REPLACE FUNCTION match_semantic_context (
  p_merchant_id UUID,
  p_embedding vector,
  p_match_threshold float,
  p_match_count int
) RETURNS TABLE (title TEXT, content TEXT, similarity float)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT b.title, b.content, 1 - (b.embedding <=> p_embedding) AS similarity
  FROM (
    -- Unir bloques de conocimiento del Agente y del Comercio
    SELECT title, content, embedding, merchant_id, NULL as agent_id FROM merchant_context_blocks
    UNION ALL
    SELECT title, content, embedding, NULL as merchant_id, agent_id FROM agent_context_blocks
  ) b
  LEFT JOIN merchants m ON m.id = p_merchant_id
  WHERE 
    (b.merchant_id = p_merchant_id) -- Bloques específicos del comercio
    OR 
    (b.agent_id = m.agent_id)        -- Bloques base del agente asignado al comercio
    
    AND 1 - (b.embedding <=> p_embedding) > p_match_threshold
  ORDER BY similarity DESC
  LIMIT p_match_count;
END;
$$;
