import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function sanitizeMarkdown(text: string): string {
    let sanitized = text;
    // WhatsApp no soporta Markdown completo, solo negrita (*), cursiva (_), tachado (~) y monoespaciado (```)
    sanitized = sanitized.replace(/\(INTERNO:.*?\)/gi, "");
    sanitized = sanitized.replace(/\(DESCRIPCIÓN REAL:.*?\)/gi, "");
    sanitized = sanitized.replace(/\[DISPONIBLE\]/gi, "");
    sanitized = sanitized.replace(/\[AGOTADO\]/gi, "");
    sanitized = sanitized.replace(/\[ORDER_CONFIRMED:.*?\]/gi, "");

    return sanitized.trim();
}

Deno.serve(async (req: Request) => {
    const url = new URL(req.url);
    const merchantId = url.searchParams.get("merchant_id");

    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    // 1. Verificación de Webhook (Facebook Messenger handshake)
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
                console.log("[Handshake Success] Facebook verified for merchant:", merchantId);
                return new Response(challenge, { status: 200 });
            }
        }
        return new Response("Forbidden", { status: 403 });
    }

    // 2. Procesamiento de Mensajes (Messenger POST)
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

        if (m.ai_enabled === false) return new Response("ok", { headers: corsHeaders });

        // Obtener o crear cliente
        let { data: customer } = await supabase.from("customers")
            .select("*")
            .eq("merchant_id", merchantIdInternal)
            .eq("facebook_user_id", senderId)
            .maybeSingle();

        if (!customer) {
            const { data: nc, error: custErr } = await supabase.from("customers").insert({
                merchant_id: merchantIdInternal,
                full_name: "Usuario Messenger",
                facebook_user_id: senderId
            }).select().single();
            if (custErr) throw custErr;
            customer = nc;
        }

        // Obtener o crear conversación
        let { data: conversation } = await supabase.from("conversations")
            .select("*")
            .eq("merchant_id", merchantIdInternal)
            .eq("customer_id", customer.id)
            .eq("status", "active")
            .maybeSingle();

        if (!conversation) {
            const { data: nconv, error: convErr } = await supabase.from("conversations").insert({
                merchant_id: merchantIdInternal,
                customer_id: customer.id,
                channel: "facebook",
                status: "active",
                customer_identifier: senderId
            }).select().single();
            if (convErr) throw convErr;
            conversation = nconv;
        }

        // Guardar mensaje
        await supabase.from("messages").insert({
            conversation_id: conversation.id,
            sender_type: "customer",
            content: messageText,
            metadata: { fb_message_id: fbMessageId }
        });

        // 1. Catálogo
        const { data: products } = await supabase.from("products").select("name, price, is_available, category:categories(name)").eq("merchant_id", merchantIdInternal).eq("is_available", true).limit(40);
        let menu = "";
        if (products?.length) {
            const groups: any = {};
            products.forEach((p: any) => {
                const catName = p.category?.name || "Otros";
                if (!groups[catName]) groups[catName] = [];
                groups[catName].push(`• ${p.name} $${p.price}`);
            });
            menu = Object.entries(groups).map(([cat, items]: [any, any]) => `*${cat}*\n${items.join('\n')}`).join('\n\n');
        }

        // 2. Historial
        const { data: history } = await supabase.from("messages").select("sender_type, content").eq("conversation_id", conversation.id).order("created_at", { ascending: false }).limit(10);
        const chatMessages: any[] = [];
        if (history) {
            [...history].reverse().forEach(msg => {
                chatMessages.push({
                    role: msg.sender_type === "customer" ? "user" : "model",
                    parts: [{ text: msg.content }]
                });
            });
        }
        if (chatMessages.length > 0 && chatMessages[0].role === "model") chatMessages.shift();

        // 3. IA Logic
        const systemPrompt = `Eres el asistente de ${m.name}. Personalidad: ${m.ai_personality || 'profesional'}.
Catálogo:
${menu}
Protocolo de Cierre:
1. Muestra Ticket.
2. Pide Nombre, Dirección y Teléfono.
3. Finalizar: [ORDER_CONFIRMED: {"customer_name":"...","address":"...","phone":"...","total":0}]`;

        chatMessages.push({ role: "user", parts: [{ text: messageText }] });

        let aiResponse = "";
        const modelName = m.ai_model || 'gemini-1.5-flash';

        try {
            const cleanModel = modelName.split('/').pop();
            let geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent?key=${m.ai_api_key}`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    system_instruction: { parts: [{ text: systemPrompt }] },
                    contents: chatMessages,
                    generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
                })
            });

            if (!geminiRes.ok) {
                const blended = JSON.parse(JSON.stringify(chatMessages));
                blended[0].parts[0].text = systemPrompt + "\n\n" + blended[0].parts[0].text;
                geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent?key=${m.ai_api_key}`, {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ contents: blended, generationConfig: { temperature: 0.7, maxOutputTokens: 1024 } })
                });
            }
            const data = await geminiRes.json();
            aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || "Lo siento, tuve un error.";
        } catch (e) {
            aiResponse = "Error conectando con la IA.";
        }

        // 4. Procesar Pedido
        if (aiResponse.includes("[ORDER_CONFIRMED:")) {
            const match = aiResponse.match(/\[ORDER_CONFIRMED:\s*({.*?})\]/s);
            if (match) {
                try {
                    const info = JSON.parse(match[1]);
                    aiResponse = aiResponse.replace(/\[ORDER_CONFIRMED:.*?\]/s, "").trim();
                    await supabase.from("orders").insert({
                        merchant_id: merchantIdInternal, customer_id: customer.id, conversation_id: conversation.id,
                        total: Number(info.total) || 0, delivery_address: info.address, channel: 'facebook'
                    });
                } catch (e) { }
            }
        }

        // 5. Enviar Messenger
        const cleanResponse = sanitizeMarkdown(aiResponse);
        const fbRes = await fetch(`https://graph.facebook.com/v22.0/me/messages?access_token=${m.facebook_page_token}`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ recipient: { id: senderId }, message: { text: cleanResponse } })
        });

        if (fbRes.ok) {
            await supabase.from("messages").insert({ conversation_id: conversation.id, sender_type: "ai", content: cleanResponse });
            await supabase.from("conversations").update({ last_message: cleanResponse, last_message_at: new Date().toISOString() }).eq("id", conversation.id);
        }

        return new Response("ok", { headers: corsHeaders });

    } catch (error: any) {
        console.error(`[FATAL ERROR]`, error.message);
        return new Response("ok", { headers: corsHeaders });
    }
});
