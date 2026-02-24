-- Removes the 1536 dimension restriction from embedding columns to support models like text-embedding-3-large (3072) or Gemini (768).
ALTER TABLE agent_context_blocks ALTER COLUMN embedding TYPE vector;
ALTER TABLE merchant_context_blocks ALTER COLUMN embedding TYPE vector;
