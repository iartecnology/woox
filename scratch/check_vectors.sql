-- Verificar si la tabla products tiene columna de embedding
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'products' AND column_name = 'embedding';
