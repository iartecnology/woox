-- ============================================
-- SQL MIGRATION: WEBHOOK RATE LIMITING
-- ============================================
-- Protege contra inundación de mensajes y bucles infinitos.

CREATE TABLE IF NOT EXISTS public.webhook_rate_limits (
    key TEXT PRIMARY KEY, -- formato: merchant_id:sender_id
    request_count INTEGER DEFAULT 1,
    last_request TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    reset_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now() + interval '1 minute')
);

-- Función para verificar y actualizar el rate limit
CREATE OR REPLACE FUNCTION public.check_rate_limit(
    p_key TEXT, 
    p_limit INTEGER DEFAULT 10,
    p_window_seconds INTEGER DEFAULT 60
) RETURNS BOOLEAN AS $$
DECLARE
    v_now TIMESTAMP WITH TIME ZONE := now();
    v_record RECORD;
BEGIN
    SELECT * INTO v_record FROM public.webhook_rate_limits WHERE key = p_key;

    IF v_record IS NULL THEN
        INSERT INTO public.webhook_rate_limits (key, request_count, last_request, reset_at)
        VALUES (p_key, 1, v_now, v_now + (p_window_seconds || ' seconds')::interval);
        RETURN TRUE;
    END IF;

    -- Si la ventana ya pasó, resetear
    IF v_now > v_record.reset_at THEN
        UPDATE public.webhook_rate_limits
        SET request_count = 1, last_request = v_now, reset_at = v_now + (p_window_seconds || ' seconds')::interval
        WHERE key = p_key;
        RETURN TRUE;
    END IF;

    -- Si no ha pasado y superó el límite, rechazar
    IF v_record.request_count >= p_limit THEN
        RETURN FALSE;
    END IF;

    -- Incrementar contador
    UPDATE public.webhook_rate_limits
    SET request_count = request_count + 1, last_request = v_now
    WHERE key = p_key;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
