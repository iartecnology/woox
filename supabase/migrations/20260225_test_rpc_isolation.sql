-- WOOX - Test RPC Isolation
CREATE OR REPLACE FUNCTION public.get_compiled_prompt(p_merchant_id UUID)
RETURNS TEXT AS $$
BEGIN
    RETURN 'Test OK';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
