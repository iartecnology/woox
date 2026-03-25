-- 🚀 Migración de Índices de Producción para Woox SaaS
-- Optimización para concurrencia y búsquedas rápidas en chats y bot flow sessions.

-- 1. Índices para la tabla 'conversations'
-- Necesario para filtrar chats por comercio de forma eficiente en el panel de gestión.
CREATE INDEX IF NOT EXISTS idx_conversations_merchant_status ON public.conversations(merchant_id, status);
-- Optimización de búsqueda por cliente
CREATE INDEX IF NOT EXISTS idx_conversations_customer_id ON public.conversations(customer_id);

-- 2. Índices para la tabla 'messages'
-- El panel de chats carga mensajes por conversación ordenados por tiempo.
CREATE INDEX IF NOT EXISTS idx_messages_conversation_time ON public.messages(conversation_id, created_at DESC);
-- Búsqueda de mensajes duplicados por ID de Evolution (muy importante para webhooks)
CREATE INDEX IF NOT EXISTS idx_messages_evolution_id ON public.messages((metadata->>'evolution_message_id')) WHERE (metadata->>'evolution_message_id') IS NOT NULL;

-- 3. Índices para la tabla 'bot_flow_sessions'
-- El Bot Engine consulta la sesión activa por conversación constantemente.
CREATE INDEX IF NOT EXISTS idx_bot_flow_sessions_conv_active ON public.bot_flow_sessions(conversation_id, status) WHERE status = 'active';

-- 4. Índices para la tabla 'merchants'
CREATE INDEX IF NOT EXISTS idx_merchants_slug ON public.merchants(slug);

-- 5. Índices para 'bookings' y 'orders'
CREATE INDEX IF NOT EXISTS idx_orders_merchant_id ON public.orders(merchant_id);
CREATE INDEX IF NOT EXISTS idx_bookings_merchant_date ON public.bookings(merchant_id, start_time);

-- 🔔 Nota: Estos índices reducen la carga de CPU en Supabase y previenen timeouts 
-- en el Dashboard de Métricas y el Bot Engine.
