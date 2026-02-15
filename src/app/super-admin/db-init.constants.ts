export const WOOX_DB_INIT_SQL = `-- ============================================
-- WOOX - MASTER DATABASE INITIALIZATION
-- ============================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. TYPES
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM ('superadmin', 'merchant_admin', 'merchant_operator');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_status') THEN
        CREATE TYPE order_status AS ENUM ('pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'message_sender_type') THEN
        CREATE TYPE message_sender_type AS ENUM ('customer', 'ai', 'human_agent');
    END IF;
END $$;

-- 3. TABLES
CREATE TABLE IF NOT EXISTS merchants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    logo_url TEXT,
    primary_color TEXT DEFAULT '#4F46E5',
    is_active BOOLEAN DEFAULT true,
    ai_enabled BOOLEAN DEFAULT true,
    subscription_plan TEXT DEFAULT 'pro',
    subscription_expires_at TIMESTAMP WITH TIME ZONE,
    ai_provider TEXT DEFAULT 'google_gemini',
    ai_model TEXT DEFAULT 'gemini-1.5-flash',
    ai_api_key TEXT,
    ai_personality TEXT DEFAULT 'friendly',
    ai_system_prompt TEXT,
    ai_welcome_message TEXT,
    ai_menu_context TEXT,
    ai_restrictions TEXT,
    ai_use_catalog BOOLEAN DEFAULT true,
    whatsapp_token TEXT,
    telegram_bot_token TEXT,
    facebook_page_token TEXT,
    remarketing_enabled BOOLEAN DEFAULT false,
    remarketing_delay_minutes INTEGER DEFAULT 30,
    remarketing_message TEXT,
    ai_schedule_enabled BOOLEAN DEFAULT false,
    ai_schedule_start TIME DEFAULT '09:00',
    ai_schedule_end TIME DEFAULT '18:00',
    ai_schedule_message TEXT,
    agent_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS agents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    system_prompt TEXT NOT NULL,
    welcome_message TEXT,
    personality TEXT DEFAULT 'friendly',
    menu_context TEXT,
    restrictions TEXT,
    skills JSONB DEFAULT '{"inventory_sales": {"enabled": true}, "order_capture": {"enabled": true}, "knowledge_base": {"enabled": true}, "security_foundation": {"enabled": true}}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role user_role NOT NULL DEFAULT 'merchant_operator',
    merchant_id UUID REFERENCES merchants(id) ON DELETE CASCADE,
    avatar_url TEXT,
    max_capacity INTEGER DEFAULT 10,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS teams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID REFERENCES merchants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS team_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(team_id, user_id)
);

CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID REFERENCES merchants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID REFERENCES merchants(id) ON DELETE CASCADE,
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    image_url TEXT,
    is_available BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID REFERENCES merchants(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    address TEXT,
    telegram_user_id TEXT,
    telegram_chat_id TEXT,
    whatsapp_phone TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID REFERENCES merchants(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    conversation_id UUID,
    status order_status DEFAULT 'pending',
    total DECIMAL(10,2) NOT NULL,
    delivery_address TEXT,
    notes TEXT,
    closing_agent_type TEXT,
    channel TEXT DEFAULT 'whatsapp',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    subtotal DECIMAL(10,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID REFERENCES merchants(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    platform TEXT DEFAULT 'whatsapp',
    channel TEXT DEFAULT 'whatsapp',
    status TEXT DEFAULT 'active',
    ai_active BOOLEAN DEFAULT true,
    unread_count INTEGER DEFAULT 0,
    last_message TEXT,
    last_message_at TIMESTAMP WITH TIME ZONE,
    assigned_agent_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
    customer_identifier TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    sender_type message_sender_type NOT NULL,
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS agent_context_blocks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS merchant_context_blocks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID REFERENCES merchants(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- MIGRACIÓN PARA WHATSAPP WEBHOOK Y AI
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS merchant_code TEXT UNIQUE;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS whatsapp_verify_token TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS whatsapp_business_id TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS whatsapp_phone_number_id TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS whatsapp_token TEXT;

-- MIGRACIÓN DE TABLAS TRANSACCIONALES
ALTER TABLE customers ADD COLUMN IF NOT EXISTS whatsapp_phone TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS facebook_user_id TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS customer_identifier TEXT;

-- MIGRACIÓN PARA OTROS CANALES
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS telegram_bot_token TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS facebook_page_token TEXT;

-- MIGRACIÓN PARA IA Y MARKETING
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS ai_provider TEXT DEFAULT 'google_gemini';
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS ai_model TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS ai_api_key TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS ai_personality TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS ai_welcome_message TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS ai_system_prompt TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS ai_menu_context TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS remarketing_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS remarketing_delay_minutes INTEGER DEFAULT 60;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS remarketing_message TEXT;

-- INITIAL SEED
INSERT INTO agents (id, name, description, system_prompt, personality) VALUES
('00000000-0000-0000-0000-000000000001', 'Woox Concierge v2', 'Agente IA avanzado para ventas y cierre', 
'Eres un asistente de ventas experto. Tu misión es guiar al cliente por el menú, sugerir adicionales y cerrar la venta capturando sus datos de envío.',
'friendly') ON CONFLICT DO NOTHING;

INSERT INTO profiles (email, password, full_name, role, merchant_id) VALUES
('admin@woox.app', 'admin123', 'Super Admin Woox', 'superadmin', NULL)
ON CONFLICT DO NOTHING;
`;
