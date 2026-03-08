-- ==========================================================================================
-- Módulo: CRM Inteligente (Woox CRM 2.0)
-- ==========================================================================================
-- Este script evoluciona la tabla de clientes para soportar segmentación por IA,
-- niveles de lealtad automáticos y analíticas proactivas.
-- ==========================================================================================

-- 1. Añadir campos de Inteligencia y Segmentación
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS loyalty_level TEXT DEFAULT 'bronze' CHECK (loyalty_level IN ('bronze', 'silver', 'gold', 'platinum'));
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS churn_risk TEXT DEFAULT 'low' CHECK (churn_risk IN ('low', 'medium', 'high'));
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS clv NUMERIC(12,2) DEFAULT 0; -- Customer Lifetime Value
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS avg_ticket NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS total_orders INTEGER DEFAULT 0;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS sentiment TEXT DEFAULT 'neutral';
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- 2. Función para actualizar métricas de cliente en tiempo real
-- Se dispara cuando un pedido cambia a estado 'completed'
CREATE OR REPLACE FUNCTION public.update_customer_metrics()
RETURNS TRIGGER AS $$
DECLARE
    v_total_spent NUMERIC;
    v_order_count INTEGER;
BEGIN
    -- Solo actuar si el pedido fue entregado (estado terminal exitoso)
    -- Los estados válidos del ENUM son: pending, confirmed, preparing, ready, delivered, cancelled
    IF (NEW.status::TEXT = 'delivered') THEN
        SELECT COALESCE(SUM(total), 0), COUNT(id) INTO v_total_spent, v_order_count
        FROM public.orders
        WHERE customer_id = NEW.customer_id AND status::TEXT = 'delivered';

        UPDATE public.customers
        SET 
            clv = v_total_spent,
            total_orders = v_order_count,
            avg_ticket = CASE WHEN v_order_count > 0 THEN v_total_spent / v_order_count ELSE 0 END,
            last_purchase_at = NEW.created_at,
            -- Lógica de niveles de lealtad (en moneda local)
            loyalty_level = CASE 
                WHEN v_total_spent >= 1000000 THEN 'platinum'
                WHEN v_total_spent >= 500000 THEN 'gold'
                WHEN v_total_spent >= 200000 THEN 'silver'
                ELSE 'bronze'
            END,
            status = 'active',
            updated_at = now()
        WHERE id = NEW.customer_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Trigger de actualización automática
DROP TRIGGER IF EXISTS tr_update_customer_metrics ON public.orders;
CREATE TRIGGER tr_update_customer_metrics
AFTER UPDATE OF status ON public.orders
FOR EACH ROW
WHEN (NEW.status::TEXT = 'delivered')
EXECUTE FUNCTION public.update_customer_metrics();

-- 4. Comentarios para documentación
COMMENT ON COLUMN public.customers.clv IS 'Valor total acumulado de compras finalizadas.';
COMMENT ON COLUMN public.customers.churn_risk IS 'Nivel de riesgo de que el cliente no vuelva a comprar (Calculado por IA).';
COMMENT ON COLUMN public.customers.preferences IS 'Preferencias, alergias e intereses detectados por la IA en las conversaciones.';
