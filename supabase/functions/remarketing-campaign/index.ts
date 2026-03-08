import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================
// Woox CRM - Remarketing Campaign Runner
// Edge Function para enviar campañas masivas de WhatsApp
// ============================================================

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    try {
        const supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );

        const { merchant_id, campaign_name, message, segment } = await req.json();

        if (!merchant_id || !message || !segment) {
            return new Response(JSON.stringify({ error: "merchant_id, message y segment son requeridos." }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // 1. Obtener configuración de WhatsApp del comercio
        const { data: merchant, error: mErr } = await supabase
            .from("merchants")
            .select("name, wa_session_id, evolution_instance_name, merchant_code")
            .eq("id", merchant_id)
            .single();

        if (mErr || !merchant) {
            return new Response(JSON.stringify({ error: "Comercio no encontrado." }), {
                status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // 2. Obtener configuración global de Evolution API
        const { data: ps } = await supabase
            .from("platform_settings")
            .select("evolution_api_url, evolution_api_key")
            .eq("id", "global")
            .maybeSingle();

        const evoUrl = ps?.evolution_api_url || "";
        const evoKey = ps?.evolution_api_key || "";
        const evoInstance = merchant.wa_session_id || merchant.evolution_instance_name || merchant.merchant_code || "";

        if (!evoUrl || !evoKey || !evoInstance) {
            return new Response(JSON.stringify({
                error: "WhatsApp no configurado. Verifica evolution_api_url, evolution_api_key y wa_session_id."
            }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // 3. Seleccionar clientes según segmento
        let query = supabase
            .from("customers")
            .select("id, full_name, phone")
            .eq("merchant_id", merchant_id)
            .not("phone", "is", null);

        if (segment === "vip") {
            query = query.in("loyalty_level", ["gold", "platinum"]);
        } else if (segment === "churn") {
            query = query.eq("churn_risk", "high");
        } else if (segment === "happy") {
            query = query.eq("sentiment", "happy");
        } else if (segment === "inactive") {
            // Sin compras en los últimos 15 días
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - 15);
            query = query.lt("last_purchase_at", cutoff.toISOString());
        }
        // segment === "all" no tiene filtro adicional

        const { data: customers, error: cErr } = await query;

        if (cErr) {
            return new Response(JSON.stringify({ error: cErr.message }), {
                status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        if (!customers || customers.length === 0) {
            return new Response(JSON.stringify({ sent: 0, failed: 0, message: "No hay clientes en este segmento." }), {
                status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // 4. Enviar mensaje con delay progresivo para evitar spam
        const sendUrl = `${evoUrl.replace(/\/$/, "")}/message/sendText/${evoInstance}`;
        let sent = 0;
        let failed = 0;
        const results: any[] = [];

        for (const customer of customers) {
            if (!customer.phone) { failed++; continue; }

            // Personalizar mensaje con nombre del cliente
            const personalizedMsg = message
                .replace("{{nombre}}", customer.full_name || "estimado cliente")
                .replace("{{comercio}}", merchant.name);

            try {
                const res = await fetch(sendUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "apikey": evoKey },
                    body: JSON.stringify({
                        number: customer.phone,
                        text: personalizedMsg,
                        delay: 1500
                    })
                });

                if (res.ok) {
                    sent++;
                    results.push({ phone: customer.phone, status: "sent" });
                } else {
                    failed++;
                    results.push({ phone: customer.phone, status: "failed", error: res.status });
                }
            } catch (err: any) {
                failed++;
                results.push({ phone: customer.phone, status: "error", error: err.message });
            }

            // Delay de 800ms entre mensajes para no ser bloqueado
            await new Promise(r => setTimeout(r, 800));
        }

        // 5. Guardar log de la campaña
        await supabase.from("campaign_logs").insert({
            merchant_id,
            campaign_name,
            segment,
            message,
            total_recipients: customers.length,
            sent_count: sent,
            failed_count: failed,
            status: "completed",
            sent_at: new Date().toISOString()
        });

        return new Response(
            JSON.stringify({ success: true, sent, failed, total: customers.length }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (err: any) {
        console.error("[REMARKETING ERROR]", err);
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
