-- ==========================================================================================
-- Módulo: Woox AI Landing Builder - Esquema Core
-- ==========================================================================================
-- Este script crea la tabla principal para almacenar las páginas generadas por la IA
-- y gestionar los subdominios amigables de cada comercio.
-- ==========================================================================================

CREATE TABLE IF NOT EXISTS public.ai_landing_pages (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
    
    -- URLs y Ruteo
    slug TEXT UNIQUE NOT NULL, -- Ej: 'burgerkingpro' -> woox.ai/p/burgerkingpro
    custom_domain TEXT UNIQUE, -- Ej: 'www.miburger.com' (Futuro)
    
    -- Estructura e Identidad dictada por IA
    industry_type TEXT DEFAULT 'services', -- restaurant, hotel, services, ecommerce, health
    template_id TEXT DEFAULT 'default', 
    
    -- Estética
    theme_palette JSONB DEFAULT '{"primary": "#000000", "secondary": "#ffffff", "background": "#f4f4f4", "text": "#333333", "accent": "#ff0000"}'::jsonb,
    typography TEXT DEFAULT 'Inter',
    logo_url TEXT,
    
    -- Contenido Reactivo Modular
    -- Define el orden en que Angular/React debe pintar los componentes
    blocks_order JSONB DEFAULT '["hero", "features", "catalog", "testimonials"]'::jsonb,
    
    -- La redacción real para cada bloque generada por Gemini
    content_blocks JSONB DEFAULT '{}'::jsonb, 
    
    -- Estado
    is_published BOOLEAN DEFAULT false,
    
    -- Metadatos SEO
    seo_metadata JSONB DEFAULT '{"title": "", "description": "", "og_image": ""}'::jsonb,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Índices para acceso rápido por URL y Merchant
CREATE INDEX idx_ai_landing_pages_slug ON public.ai_landing_pages(slug);
CREATE INDEX idx_ai_landing_pages_merchant ON public.ai_landing_pages(merchant_id);

-- RLS
ALTER TABLE public.ai_landing_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir lectura pública a landing_pages" 
ON public.ai_landing_pages FOR SELECT USING (is_published = true);

CREATE POLICY "Permitir todo al dueño merchant_landing" 
ON public.ai_landing_pages FOR ALL USING (true); -- Ajustar en Prod
