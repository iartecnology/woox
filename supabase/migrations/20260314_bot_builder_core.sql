-- ============================================
-- BOT BUILDER: ESQUEMA CORE (ANGULAR + SUPABASE)
-- ============================================

-- 1. Flujos del Bot (uno o más por merchant)
CREATE TABLE IF NOT EXISTS bot_flows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'Mi Bot',
    description TEXT,
    is_active BOOLEAN DEFAULT false,
    trigger_type TEXT DEFAULT 'always',        -- 'always' | 'greeting' | 'keyword'
    trigger_keywords TEXT[] DEFAULT '{}',       -- si trigger_type = 'keyword'
    flow_data JSONB NOT NULL DEFAULT '{
        "nodes": [],
        "connections": []
    }',
    variables JSONB DEFAULT '[]',              -- definición de variables del flujo
    stats JSONB DEFAULT '{"sessions": 0, "completed": 0, "abandoned": 0}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(merchant_id, name)
);

-- 2. Sesiones activas de cada conversación
CREATE TABLE IF NOT EXISTS bot_flow_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL,
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    flow_id UUID NOT NULL REFERENCES bot_flows(id) ON DELETE CASCADE,
    current_node_id TEXT NOT NULL,              -- ID del nodo en el que está el usuario
    variables JSONB DEFAULT '{}',              -- variables capturadas: {"nombre":"Juan"}
    waiting_for TEXT,                           -- 'input' | 'menu_selection' | null
    status TEXT DEFAULT 'active',              -- 'active' | 'completed' | 'abandoned' | 'transferred'
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bot_flows_merchant ON bot_flows(merchant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_bot_sessions_conv ON bot_flow_sessions(conversation_id, status);
CREATE INDEX IF NOT EXISTS idx_bot_sessions_merchant ON bot_flow_sessions(merchant_id, status);

-- 3. Agregar campo bot_mode al merchant si no existe
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'merchants' AND COLUMN_NAME = 'bot_mode') THEN
        ALTER TABLE merchants ADD COLUMN bot_mode BOOLEAN DEFAULT false;
    END IF;
END $$;

-- 4. RPC: Obtener flujo activo de un merchant
CREATE OR REPLACE FUNCTION get_active_bot_flow(p_merchant_id UUID)
RETURNS JSONB AS $$
    SELECT row_to_json(bf.*)::JSONB
    FROM bot_flows bf
    WHERE bf.merchant_id = p_merchant_id
      AND bf.is_active = true
    LIMIT 1;
$$ LANGUAGE sql STABLE;

-- 5. RPC: Obtener o crear sesión de bot
CREATE OR REPLACE FUNCTION get_or_create_bot_session(
    p_conversation_id UUID,
    p_merchant_id UUID,
    p_flow_id UUID,
    p_start_node_id TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_session RECORD;
    v_session_json JSONB;
BEGIN
    -- Buscar sesión activa existente
    SELECT * INTO v_session
    FROM bot_flow_sessions
    WHERE conversation_id = p_conversation_id
      AND status = 'active'
    LIMIT 1;

    IF v_session.id IS NOT NULL THEN
        RETURN row_to_json(v_session)::JSONB;
    END IF;

    -- Crear nueva sesión
    INSERT INTO bot_flow_sessions (conversation_id, merchant_id, flow_id, current_node_id, waiting_for)
    VALUES (p_conversation_id, p_merchant_id, p_flow_id, p_start_node_id, null)
    RETURNING * INTO v_session;

    -- Incrementar contador de sesiones del flujo
    UPDATE bot_flows SET stats = jsonb_set(
        COALESCE(stats, '{}'::jsonb),
        '{sessions}',
        to_jsonb(COALESCE((stats->>'sessions')::int, 0) + 1)
    ) WHERE id = p_flow_id;

    RETURN row_to_json(v_session)::JSONB;
END;
$$ LANGUAGE plpgsql;
