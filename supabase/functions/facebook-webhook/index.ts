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
    const url = new URL(req.url);
    const merchantId = url.searchParams.get("merchant_id");

    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    // 1. Verificación de Webhook (Messenger Handshake)
    if (req.method === "GET") {
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");

        if (mode === "subscribe" && token) {
            const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

            let { data: m } = await supabase.from("merchants").select("whatsapp_verify_token").eq("id", merchantId).maybeSingle();
            if (!m) {
                const { data: mc } = await supabase.from("merchants").select("whatsapp_verify_token").eq("merchant_code", merchantId).maybeSingle();
                m = mc;
            }

            if (m && m.whatsapp_verify_token === token) {
                return new Response(challenge, { status: 200 });
            }
        }
        return new Response("Forbidden", { status: 403 });
    }

    // 2. Procesamiento de Mensajes (POST)
    try {
        if (!merchantId) throw new Error("merchant_id missing");
        const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

        let { data: m } = await supabase.from("merchants").select("*").eq("id", merchantId).maybeSingle();
        if (!m) {
            const { data: mc } = await supabase.from("merchants").select("*").eq("merchant_code", merchantId).maybeSingle();
            m = mc;
        }

        if (!m) throw new Error("Merchant not found");
        const merchantIdInternal = m.id;

        const body = await req.json();
        const entry = body.entry?.[0];
        const messaging = entry?.messaging?.[0];

        if (!messaging) return new Response("ok", { headers: corsHeaders });

        const senderId = messaging.sender.id;
        const message = messaging.message;
        const postback = messaging.postback;

        if (message?.is_echo) return new Response("ok", { headers: corsHeaders });

        const messageText = message?.text || postback?.payload || "";
        if (!messageText) return new Response("ok", { headers: corsHeaders });

        const fbMessageId = message?.mid || `pb_${Date.now()}`;

        // Deduplicación
        const { data: existing } = await supabase.from("messages").select("id").eq("metadata->>fb_message_id", fbMessageId).maybeSingle();
        if (existing) return new Response("ok", { headers: corsHeaders });

        // Obtener o crear cliente
        let { data: customer } = await supabase.from("customers").select("*").eq("merchant_id", merchantIdInternal).eq("facebook_user_id", senderId).maybeSingle();
        if (!customer) {
            const { data: nc } = await supabase.from("customers").insert({
                merchant_id: merchantIdInternal,
                full_name: "Usuario Messenger",
                facebook_user_id: senderId
            }).select().single();
            customer = nc;
        }

        // Obtener o crear conversación
        let { data: conversation } = await supabase.from("conversations").select("*").eq("merchant_id", merchantIdInternal).eq("customer_id", customer!.id).eq("status", "active").maybeSingle();
        if (!conversation) {
            const { data: nconv } = await supabase.from("conversations").insert({
                merchant_id: merchantIdInternal,
                customer_id: customer!.id,
                channel: "facebook",
                status: "active"
            }).select().single();
            conversation = nconv;
        }

        // Guardar mensaje del cliente
        await supabase.from("messages").insert({
            conversation_id: conversation!.id,
            sender_type: "customer",
            content: messageText,
            metadata: { fb_message_id: fbMessageId }
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
                    merchant_id: merchantIdInternal,
                    conversation_id: conversation!.id,
                    customer_id: customer!.id,
                    message_text: messageText,
                    platform: "facebook"
                })
            });

            if (!pyRes.ok) throw new Error(`Engine Error: ${pyRes.status}`);
            const pyData = await pyRes.json();
            aiResponse = pyData.response || "Lo siento, no pude procesar tu mensaje.";

        } catch (e: any) {
            aiResponse = "Lo siento, mis circuitos están ocupados. 🤖✨ Intenta de nuevo pronto.";
        }

        const cleanResponse = sanitizeMarkdown(aiResponse);

        // Enviar a Facebook Messenger
        const fbUrl = `https://graph.facebook.com/v22.0/me/messages?access_token=${m.facebook_page_access_token}`;
        await fetch(fbUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                recipient: { id: senderId },
                message: { text: cleanResponse }
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
