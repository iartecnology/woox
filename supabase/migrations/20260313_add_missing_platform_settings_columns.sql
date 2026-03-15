-- Add missing columns to platform_settings table
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS ai_engine_url TEXT;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS ollama_base_url TEXT DEFAULT 'http://localhost:11434';
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS embed_provider TEXT DEFAULT 'google_gemini';
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS embed_model TEXT DEFAULT 'text-embedding-004';
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS embed_api_key TEXT;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS evolution_api_url TEXT;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS evolution_api_key TEXT;

-- Update the global row if it exists
UPDATE platform_settings SET ai_engine_url = 'http://167.86.73.89:8000/' WHERE id = 'global' AND ai_engine_url IS NULL;
