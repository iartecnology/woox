-- Add updated_at to context blocks
ALTER TABLE agent_context_blocks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE merchant_context_blocks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- Create a helper function if not exists to update trigger
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for agent_context_blocks
DROP TRIGGER IF EXISTS update_agent_context_blocks_updated_at ON agent_context_blocks;
CREATE TRIGGER update_agent_context_blocks_updated_at
BEFORE UPDATE ON agent_context_blocks
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- Trigger for merchant_context_blocks 
DROP TRIGGER IF EXISTS update_merchant_context_blocks_updated_at ON merchant_context_blocks;
CREATE TRIGGER update_merchant_context_blocks_updated_at
BEFORE UPDATE ON merchant_context_blocks
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

NOTIFY pgrst, 'reload schema';
