-- ============================================
-- SQL MIGRATION: ADVANCED RAG & CRM MEMORY
-- ============================================

-- 1. Añadir soporte vectorial a productos si no existe
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'embedding') THEN
        ALTER TABLE public.products ADD COLUMN embedding vector(768);
    END IF;
END $$;

-- 2. Índice HNSW para búsqueda semántica de productos
CREATE INDEX IF NOT EXISTS idx_products_embedding ON public.products USING hnsw (embedding vector_cosine_ops);

-- 3. Función RPC para búsqueda semántica de productos (Híbrida)
CREATE OR REPLACE FUNCTION public.match_products_v2(
    p_merchant_id UUID,
    p_embedding vector(768),
    p_match_threshold float DEFAULT 0.5,
    p_match_count int DEFAULT 10
) RETURNS TABLE (
    id UUID,
    name TEXT,
    price DECIMAL,
    description TEXT,
    stock INTEGER,
    similarity float
) LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id, p.name, p.price, p.description, p.stock,
        1 - (p.embedding <=> p_embedding) AS similarity
    FROM public.products p
    WHERE p.merchant_id = p_merchant_id
      AND p.stock > 0
      AND 1 - (p.embedding <=> p_embedding) > p_match_threshold
    ORDER BY similarity DESC
    LIMIT p_match_count;
END;
$$;

-- 4. View de CRM: Resumen Ejecutivo del Cliente para la IA
CREATE OR REPLACE VIEW public.customer_crm_summary AS
SELECT 
    c.id as customer_id,
    c.merchant_id,
    c.full_name,
    c.phone,
    COUNT(o.id) as total_orders,
    SUM(o.total) as total_spent,
    MAX(o.created_at) as last_order_date,
    (SELECT string_agg(DISTINCT p.name, ', ') 
     FROM order_items oi 
     JOIN products p ON oi.product_id = p.id 
     JOIN orders o2 ON oi.order_id = o2.id 
     WHERE o2.customer_id = c.id 
     LIMIT 3) as favorite_products
FROM public.customers c
-- Filtramos por estados que representen una venta exitosa (delivered o similar)
LEFT JOIN public.orders o ON c.id = o.customer_id AND o.status IN ('delivered', 'confirmed')
GROUP BY c.id, c.merchant_id, c.full_name, c.phone;
