-- ============================================
-- PLATFORM SETTINGS & ASSISTANCE SYSTEM
-- ============================================

CREATE TABLE IF NOT EXISTS platform_settings (
    id TEXT PRIMARY KEY DEFAULT 'global',
    ai_provider TEXT DEFAULT 'google_gemini',
    ai_model TEXT DEFAULT 'gemini-1.5-flash',
    ai_api_key TEXT,
    support_ai_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert global row if not exists
INSERT INTO platform_settings (id) VALUES ('global') ON CONFLICT DO NOTHING;

-- Extension to skills_catalog to support AI tags or metadata if needed
ALTER TABLE skills_catalog ADD COLUMN IF NOT EXISTS ai_logic_hint TEXT;
