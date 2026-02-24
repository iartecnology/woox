-- Agregar columna biolink a merchants
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS biolink JSONB DEFAULT NULL;

NOTIFY pgrst, 'reload schema';
