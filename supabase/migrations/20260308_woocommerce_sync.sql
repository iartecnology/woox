-- Migration: Add WooCommerce integration columns to merchants
ALTER TABLE merchants 
ADD COLUMN IF NOT EXISTS woocommerce_url TEXT,
ADD COLUMN IF NOT EXISTS woocommerce_consumer_key TEXT,
ADD COLUMN IF NOT EXISTS woocommerce_consumer_secret TEXT;

-- Enhance products table for Stage 1 (WooCommerce items, modifiers, etc.)
ALTER TABLE products
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS remote_id TEXT, -- Para mapear con el ID de WooCommerce
ADD COLUMN IF NOT EXISTS tags TEXT[]; -- Para etiquetas de dieta (vegan, etc)

-- Index for faster lookup during sync
CREATE INDEX IF NOT EXISTS idx_products_remote_id ON products(remote_id);
CREATE INDEX IF NOT EXISTS idx_products_merchant_id ON products(merchant_id);
