-- ==========================================================================================
-- CRM 2.0: Tabla de logs de campañas de Remarketing
-- ==========================================================================================

CREATE TABLE IF NOT EXISTS public.campaign_logs (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
    campaign_name TEXT NOT NULL,
    segment TEXT NOT NULL,
    message TEXT NOT NULL,
    total_recipients INTEGER DEFAULT 0,
    sent_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.campaign_logs ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Permitir todo a autenticados campaign_logs') THEN
        CREATE POLICY "Permitir todo a autenticados campaign_logs" ON public.campaign_logs FOR ALL USING (true);
    END IF;
END $$;

-- Vista de resumen de campañas por comercio
CREATE OR REPLACE VIEW public.campaign_summary AS
SELECT
    merchant_id,
    COUNT(*) as total_campaigns,
    SUM(sent_count) as total_messages_sent,
    SUM(failed_count) as total_failed,
    MAX(sent_at) as last_campaign_at
FROM public.campaign_logs
GROUP BY merchant_id;

COMMENT ON TABLE public.campaign_logs IS 'Audit log de todas las campañas de remarketing enviadas desde el CRM.';
