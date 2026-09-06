-- ==============================================================================
-- MIGRATION: 20260906_saas_metering_and_indexes.sql
-- TABLA DE GOBERNANZA Y CONSUMO DE RECURSOS POR COMERCIO (SaaS Metering)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS merchant_usage (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID REFERENCES merchants(id) ON DELETE CASCADE,
    period_month VARCHAR(7) NOT NULL, -- 'YYYY-MM'
    messages_inbound INTEGER DEFAULT 0,
    messages_outbound INTEGER DEFAULT 0,
    ai_messages_count INTEGER DEFAULT 0,
    tokens_consumed INTEGER DEFAULT 0,
    orders_closed_count INTEGER DEFAULT 0,
    orders_closed_value NUMERIC(12,2) DEFAULT 0.00,
    last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(merchant_id, period_month)
);

-- Habilitar RLS
ALTER TABLE merchant_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmin and Merchants view own usage"
ON merchant_usage FOR SELECT
USING (
    auth.role() = 'service_role' OR
    EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid() AND (p.role = 'superadmin' OR p.merchant_id = merchant_usage.merchant_id)
    )
);

-- Función RPC atómica para registrar incremento de uso (segura para llamadas concurrentes)
CREATE OR REPLACE FUNCTION track_merchant_usage(
    p_merchant_id UUID,
    p_tokens INTEGER DEFAULT 0,
    p_is_ai_message BOOLEAN DEFAULT true,
    p_is_inbound BOOLEAN DEFAULT false,
    p_is_outbound BOOLEAN DEFAULT false,
    p_order_closed BOOLEAN DEFAULT false,
    p_order_value NUMERIC DEFAULT 0.00
)
RETURNS VOID AS $$
DECLARE
    v_period VARCHAR(7);
BEGIN
    v_period := to_char(NOW(), 'YYYY-MM');

    INSERT INTO merchant_usage (
        merchant_id, period_month, messages_inbound, messages_outbound,
        ai_messages_count, tokens_consumed, orders_closed_count,
        orders_closed_value, last_activity_at
    )
    VALUES (
        p_merchant_id,
        v_period,
        CASE WHEN p_is_inbound THEN 1 ELSE 0 END,
        CASE WHEN p_is_outbound THEN 1 ELSE 0 END,
        CASE WHEN p_is_ai_message THEN 1 ELSE 0 END,
        COALESCE(p_tokens, 0),
        CASE WHEN p_order_closed THEN 1 ELSE 0 END,
        COALESCE(p_order_value, 0.00),
        NOW()
    )
    ON CONFLICT (merchant_id, period_month)
    DO UPDATE SET
        messages_inbound = merchant_usage.messages_inbound + (CASE WHEN p_is_inbound THEN 1 ELSE 0 END),
        messages_outbound = merchant_usage.messages_outbound + (CASE WHEN p_is_outbound THEN 1 ELSE 0 END),
        ai_messages_count = merchant_usage.ai_messages_count + (CASE WHEN p_is_ai_message THEN 1 ELSE 0 END),
        tokens_consumed = merchant_usage.tokens_consumed + COALESCE(p_tokens, 0),
        orders_closed_count = merchant_usage.orders_closed_count + (CASE WHEN p_order_closed THEN 1 ELSE 0 END),
        orders_closed_value = merchant_usage.orders_closed_value + COALESCE(p_order_value, 0.00),
        last_activity_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Índices de alto rendimiento para SaaS multi-tenant
CREATE INDEX IF NOT EXISTS idx_messages_conv_created ON messages (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_merchant_status ON conversations (merchant_id, status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_merchant_available ON products (merchant_id, is_available);
CREATE INDEX IF NOT EXISTS idx_orders_merchant_status ON orders (merchant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_merchant_usage_period ON merchant_usage (merchant_id, period_month);
