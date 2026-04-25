-- ============================================
-- SQL MIGRATION: UNIFICAR CANALES (platform/channel)
-- ============================================
-- Problema: Telegram usa platform='telegram', WhatsApp usa channel='whatsapp_evolution'.
-- Esta inconsistencia causa bugs de búsqueda de sesiones.
-- Solución: Estandarizar ambas columnas con valores consistentes.

-- 1. Asegurar que 'channel' tenga valores válidos basados en 'platform' donde falte
UPDATE conversations
SET channel = platform
WHERE channel IS NULL OR channel = '';

-- 2. Normalizar valores de 'channel' para consistencia
UPDATE conversations
SET channel = 'whatsapp'
WHERE channel IN ('whatsapp_evolution', 'evolution', 'whatsapp_cloud');

UPDATE conversations
SET channel = 'telegram'
WHERE channel = 'telegram' OR platform = 'telegram';

UPDATE conversations
SET channel = 'instagram'
WHERE channel = 'instagram_dm' OR platform = 'instagram';

UPDATE conversations
SET channel = 'messenger'
WHERE channel IN ('facebook_messenger', 'fb_messenger') OR platform = 'messenger';

-- 3. Sincronizar platform con channel (platform queda como alias legible)
UPDATE conversations
SET platform = channel
WHERE platform != channel AND platform IS NOT NULL;

-- 4. Crear índice para búsquedas frecuentes por canal
CREATE INDEX IF NOT EXISTS idx_conversations_channel ON conversations(merchant_id, channel, status);

-- 5. Crear índice para búsquedas por customer_id (usado por webhooks)
CREATE INDEX IF NOT EXISTS idx_conversations_customer ON conversations(merchant_id, customer_id, status);

-- 6. Crear índice para búsquedas de clientes por phone (usado por webhook WhatsApp)
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(merchant_id, phone);

-- 7. Crear índice para búsquedas de clientes por telegram_user_id
CREATE INDEX IF NOT EXISTS idx_customers_telegram ON customers(merchant_id, telegram_user_id);
