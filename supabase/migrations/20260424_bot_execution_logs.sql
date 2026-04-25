-- ============================================
-- SQL MIGRATION: BOT EXECUTION LOGS (DEBUG MODE)
-- ============================================
-- Esta tabla registra cada paso que da el bot para permitir auditoría y debug.

CREATE TABLE IF NOT EXISTS public.bot_execution_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID REFERENCES public.merchants(id) ON DELETE CASCADE,
    session_id UUID REFERENCES public.bot_flow_sessions(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
    node_id TEXT NOT NULL,
    node_type TEXT NOT NULL,
    input_received TEXT,
    output_sent TEXT,
    variables_snapshot JSONB DEFAULT '{}'::jsonb,
    error_message TEXT,
    execution_time_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Índices para búsqueda rápida de logs de una sesión específica
CREATE INDEX IF NOT EXISTS idx_bot_logs_session ON bot_execution_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_bot_logs_conversation ON bot_execution_logs(conversation_id);
CREATE INDEX IF NOT EXISTS idx_bot_logs_created_at ON bot_execution_logs(created_at);

-- Comentario para documentación
COMMENT ON TABLE public.bot_execution_logs IS 'Logs detallados de la ejecución de nodos del bot para debug y auditoría.';
