import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function sanitizeMarkdown(text: string): string {
    let sanitized = text;
    sanitized = sanitized.replace(/\(INTERNO:.*?\)/gi, "");
    sanitized = sanitized.replace(/\(DESCRIPCIÓN REAL:.*?\)/gi, "");
    sanitized = sanitized.replace(/\[DISPONIBLE\]/gi, "");
    sanitized = sanitized.replace(/\[AGOTADO\]/gi, "");
    sanitized = sanitized.replace(/\[UPDATE_CART:.*?\]/gi, "");
    sanitized = sanitized.replace(/^\s*[}\]]+\s*$/gm, "");
    return sanitized.trim();
}

Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    try {
        const url = new URL(req.url);
        const merchantId = url.searchParams.get("merchant_id");
        if (!merchantId) throw new Error("merchant_id missing");

        const body = await req.json();
        const data = body.data;
        if (!data || !data.message || !data.message.conversation) return new Response("ok", { headers: corsHeaders });
        if (data.fromMe) return new Response("ok", { headers: corsHeaders });

        const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

        // Buscar comercio
        let { data: m } = await supabase.from("merchants").select("*").eq("id", merchantId).maybeSingle();
        if (!m) {
            const { data: mc } = await supabase.from("merchants").select("*").eq("merchant_code", merchantId).maybeSingle();
            m = mc;
        }
        if (!m) throw new Error("Merchant not found");

        const evolutionMessageId = data.key.id;
        const customerPhone = data.key.remoteJid.split('@')[0];
        const customerName = data.pushName || "Cliente Evolution";
        const messageText = data.message.conversation;

        // Deduplicación
        const { data: existing } = await supabase.from("messages").select("id").eq("metadata->>evolution_message_id", evolutionMessageId).maybeSingle();
        if (existing) return new Response("ok", { headers: corsHeaders });

        // Obtener o crear cliente
        let { data: customer } = await supabase.from("customers").select("*").eq("merchant_id", m.id).eq("phone", customerPhone).maybeSingle();
        if (!customer) {
            const { data: nc } = await supabase.from("customers").insert({
                merchant_id: m.id,
                full_name: customerName,
                phone: customerPhone
            }).select().single();
            customer = nc;
        }

        // Obtener o crear conversación
        let { data: conversation } = await supabase.from("conversations").select("*").eq("merchant_id", m.id).eq("customer_id", customer!.id).eq("status", "active").maybeSingle();
        if (!conversation) {
            const { data: nconv } = await supabase.from("conversations").insert({
                merchant_id: m.id,
                customer_id: customer!.id,
                channel: "whatsapp_evolution",
                status: "active"
            }).select().single();
            conversation = nconv;
        }

        // Guardar mensaje del cliente
        await supabase.from("messages").insert({
            conversation_id: conversation!.id,
            sender_type: "customer",
            content: messageText,
            metadata: { evolution_message_id: evolutionMessageId }
        });

        // Actualizar conversación
        await supabase.from("conversations").update({
            last_message: messageText,
            last_message_at: new Date().toISOString(),
            unread_count: (conversation!.unread_count || 0) + 1
        }).eq("id", conversation!.id);

        // --- LLAMADA AL MOTOR DE IA (PYTHON) ---
        let aiResponse = "";
        try {
            const engineUrl = Deno.env.get("PYTHON_ENGINE_URL") || "https://woox-ai-engine.onrender.com";
            const engineSecret = Deno.env.get("PYTHON_ENGINE_AUTH");

            const pyRes = await fetch(`${engineUrl}/process-message`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Auth-Token": engineSecret || ""
                },
                body: JSON.stringify({
                    merchant_id: m.id,
                    conversation_id: conversation!.id,
                    customer_id: customer!.id,
                    message_text: messageText,
                    platform: "evolution"
                })
            });

            if (!pyRes.ok) throw new Error(`Engine Error: ${pyRes.status}`);
            const pyData = await pyRes.json();
            aiResponse = pyData.response || "Lo siento, no pude procesar tu mensaje.";

        } catch (e: any) {
            aiResponse = "Lo siento, mis circuitos están cansados. 🤖✨ Intenta de nuevo pronto.";
        }

        const cleanResponse = sanitizeMarkdown(aiResponse);

        // Enviar a Evolution
        const evolutionUrl = `${m.evolution_api_url}/message/sendText/${m.evolution_instance_name}`;
        await fetch(evolutionUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "apikey": m.evolution_api_key
            },
            body: JSON.stringify({
                number: customerPhone,
                text: cleanResponse,
                delay: 1200
            })
        });

        // Guardar mensaje de la IA
        await supabase.from("messages").insert({
            conversation_id: conversation!.id,
            sender_type: "ai",
            content: cleanResponse
        });

        // Actualizar conversación
        await supabase.from("conversations").update({
            last_message: cleanResponse,
            last_message_at: new Date().toISOString()
        }).eq("id", conversation!.id);

        return new Response("ok", { headers: corsHeaders });

    } catch (error: any) {
        return new Response("ok", { headers: corsHeaders });
    }
});
