-- Migración para configuración de Pruebas Locales AI
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS local_ai_enabled BOOLEAN DEFAULT false;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS local_ai_url TEXT DEFAULT 'http://10.20.30.152:1234';
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS local_ai_model TEXT DEFAULT 'qwen/qwen3.5-9b';
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS lmstudio_base_url TEXT DEFAULT 'http://localhost:1234';
