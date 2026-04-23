-- ============================================
-- SQL MIGRATION: BOT FLOW VERSIONING
-- ============================================

-- 1. Agregar columna de versión si no existe
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'bot_flows' AND COLUMN_NAME = 'version') THEN
        ALTER TABLE bot_flows ADD COLUMN version INTEGER DEFAULT 1;
    END IF;
END $$;

-- 2. Eliminar restricción de unicidad antigua (merchant_id, name)
-- Primero encontramos el nombre de la restricción (suele ser bot_flows_merchant_id_name_key)
DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    SELECT conname INTO constraint_name
    FROM pg_constraint
    WHERE conrelid = 'bot_flows'::regclass AND contype = 'u';
    
    IF constraint_name IS NOT NULL THEN
        EXECUTE 'ALTER TABLE bot_flows DROP CONSTRAINT ' || constraint_name;
    END IF;
END $$;

-- 3. Agregar nueva restricción de unicidad incluyendo versión
ALTER TABLE bot_flows ADD CONSTRAINT bot_flows_merchant_name_version_key UNIQUE (merchant_id, name, version);

-- 4. RPC para desactivar todos los flujos antes de activar uno nuevo
CREATE OR REPLACE FUNCTION deactivate_all_bot_flows(p_merchant_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE bot_flows 
    SET is_active = false 
    WHERE merchant_id = p_merchant_id;
END;
$$ LANGUAGE plpgsql;

-- 5. Actualizar los flujos existentes para que tengan versión 1
UPDATE bot_flows SET version = 1 WHERE version IS NULL;
