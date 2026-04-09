-- Agregar columna de orden a categorías
ALTER TABLE categories
ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0;

-- Inicializar el sort_order basado en el orden alfabético actual
-- para que la migración no rompa el orden visual existente.
WITH ranked AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY merchant_id, COALESCE(parent_id::text, '')
            ORDER BY name
        ) - 1 AS rn
    FROM categories
)
UPDATE categories
SET sort_order = ranked.rn
FROM ranked
WHERE categories.id = ranked.id;
