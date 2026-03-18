-- Agrega campos de Instagram a la tabla customers
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS instagram_user_id TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS instagram_username TEXT;

-- Ajuste de Constraint si lo hubiera (opcional)
-- ALTER TABLE public.conversations DROP CONSTRAINT IF EXISTS conversations_channel_check;
-- ALTER TABLE public.conversations ADD CONSTRAINT conversations_channel_check CHECK (channel IN ('whatsapp', 'telegram', 'messenger', 'instagram', 'web', 'whatsapp_evolution', 'facebook'));
