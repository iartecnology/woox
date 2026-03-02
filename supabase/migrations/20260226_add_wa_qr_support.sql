-- ============================================================
-- WOOX - Soporte para WhatsApp Web / QR Connector
-- Agrega campos necesarios para gestionar sesiones de WhatsApp
-- sin usar la API oficial de Meta.
-- ============================================================

ALTER TABLE public.merchants 
ADD COLUMN IF NOT EXISTS wa_connector_type TEXT DEFAULT 'meta' CHECK (wa_connector_type IN ('meta', 'web_qr')),
ADD COLUMN IF NOT EXISTS wa_session_id TEXT,
ADD COLUMN IF NOT EXISTS wa_status TEXT DEFAULT 'disconnected',
ADD COLUMN IF NOT EXISTS wa_qr_code TEXT, -- Almacena el raw string del QR o URL
ADD COLUMN IF NOT EXISTS wa_last_connection TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN public.merchants.wa_connector_type IS 'Tipo de conexión a WhatsApp: Oficial (meta) o via Web QR (web_qr)';
COMMENT ON COLUMN public.merchants.wa_status IS 'Estado de la sesión QR: disconnected, pairing, connected';
COMMENT ON COLUMN public.merchants.wa_last_connection IS 'Última vez que se detectó conexión activa';

-- Agrega campos de Evolution API a platform_settings
ALTER TABLE public.platform_settings
ADD COLUMN IF NOT EXISTS evolution_api_url TEXT,
ADD COLUMN IF NOT EXISTS evolution_api_key TEXT;
