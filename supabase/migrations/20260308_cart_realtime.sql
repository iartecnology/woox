-- Paso 1: Habilitar almacenamiento de carritos en formación y sentimientos detectados
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS typing_data JSONB DEFAULT '{}'::jsonb;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS sentiment VARCHAR(50) DEFAULT 'neutral';

-- Comentario para el log de migraciones
COMMENT ON COLUMN conversations.typing_data IS 'Almacena items temporales, totales y metadatos del carrito mientras la IA interactúa.';
