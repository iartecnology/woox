import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { processBotFlow } from "../_shared/bot-engine.ts";

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

    // 1. Verificación de Webhook (Meta handshake)
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
        const body = await req.json();
        const instanceName = body.instance; // Solo Evolution

        let messageData: any = null;
        let platform = "whatsapp"; // Default Meta
        let waMessageId = "";
        let customerPhone = "";
        let customerName = "Cliente";
        let messageText = "";

        // --- DETECTAR PROVEEDOR (META vs EVOLUTION) ---
        if (body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
            // META API ORIGINAL
            const value = body.entry[0].changes[0].value;
            const message = value.messages[0];
            waMessageId = message.id;
            customerPhone = message.from;
            customerName = value.contacts?.[0]?.profile?.name || "Cliente WhatsApp";
            messageText = message.text?.body || "";
            platform = "whatsapp";
        } else if (body.data?.message) {
            // EVOLUTION FALLBACK
            const data = body.data;
            if (data.key?.fromMe === true) return new Response("ok", { headers: corsHeaders });
            waMessageId = data.key.id;
            customerPhone = data.key.remoteJid.split('@')[0];
            customerName = data.pushName || "Cliente Evolution";
            messageText = data.message.conversation || data.message.extendedTextMessage?.text || data.message.imageMessage?.caption || "";
            platform = "evolution";
        }

        if (!messageText) {
            console.log("[GATEWAY] Mensaje sin texto o tipo no soportado ignorado.");
            return new Response("ok", { headers: corsHeaders });
        }

        const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

        // Buscar comercio (por merchant_id de URL o instanceName de Evolution)
        let m: any = null;
        if (merchantId) {
            const { data: mById } = await supabase.from("merchants").select("*").eq("id", merchantId).maybeSingle();
            m = mById;
            if (!m) {
                // Por merchant_code (ej: BURGERKING05)
                const { data: mByCode } = await supabase.from("merchants").select("*").eq("merchant_code", merchantId).maybeSingle();
                m = mByCode;
            }
            if (!m) {
                // Último fallback: por slug (ej: burger-king-pro)
                const { data: mBySlug } = await supabase.from("merchants").select("*").eq("slug", merchantId).maybeSingle();
                m = mBySlug;
            }
        }
        if (!m && instanceName) {
            const { data: mByCode } = await supabase.from("merchants").select("*").eq("merchant_code", instanceName).maybeSingle();
            m = mByCode;
            if (!m) {
                const { data: mBySlugName } = await supabase.from("merchants").select("*").eq("slug", instanceName).maybeSingle();
                m = mBySlugName;
            }
        }

        if (!m) throw new Error(`Merchant not found (ID: ${merchantId}, Instance: ${instanceName})`);
        const merchantIdInternal = m.id;

        // Deduplicación
        const metaKey = platform === "whatsapp" ? "wa_message_id" : "evolution_message_id";
        const { data: existing } = await supabase.from("messages").select("id").eq(`metadata->>${metaKey}`, waMessageId).maybeSingle();
        if (existing) return new Response("ok", { headers: corsHeaders });

        // Obtener o crear cliente
        let { data: customer } = await supabase.from("customers").select("*").eq("merchant_id", merchantIdInternal).eq("phone", customerPhone).maybeSingle();
        if (!customer) {
            const { data: nc } = await supabase.from("customers").insert({
                merchant_id: merchantIdInternal,
                full_name: customerName,
                phone: customerPhone,
                whatsapp_phone: customerPhone
            }).select().single();
            customer = nc;
        }

        // Obtener o crear conversación
        let { data: conversation } = await supabase.from("conversations").select("*").eq("merchant_id", merchantIdInternal).eq("customer_id", customer!.id).eq("status", "active").maybeSingle();
        if (!conversation) {
            const { data: nconv } = await supabase.from("conversations").insert({
                merchant_id: merchantIdInternal,
                customer_id: customer!.id,
                channel: platform === "whatsapp" ? "whatsapp" : "whatsapp_evolution",
                status: "active"
            }).select().single();
            conversation = nconv;
        }

        // Guardar mensaje del cliente
        await supabase.from("messages").insert({
            conversation_id: conversation!.id,
            sender_type: "customer",
            content: messageText,
            metadata: { [metaKey]: waMessageId }
        });

        // Actualizar conversación
        await supabase.from("conversations").update({
            last_message: messageText,
            last_message_at: new Date().toISOString(),
            unread_count: (conversation!.unread_count || 0) + 1
        }).eq("id", conversation!.id);

        // --- NUEVA LÓGICA: BOT FLOW ENGINE (SUPABASE NATIVO) ---
        let aiResponse = "";
        try {
            // Solo procesar si la IA está activa para esta conversación
            if (conversation!.ai_active) {
                const engineRes = await processBotFlow(supabase, merchantIdInternal, conversation!.id, messageText, customer!.id);
                if (engineRes) {
                    aiResponse = engineRes;
                    console.log("[BOT-ENGINE] Respuesta procesada desde Flujo Visual (WhatsApp)");
                }
            }
            
            if (!aiResponse) {
                // Si la IA no está activa o no hay respuesta del flujo, no respondemos automáticamente
                return new Response("ok", { headers: corsHeaders });
            }
        } catch (e: any) {
            console.error("[BOT-ENGINE ERROR]", e);
            aiResponse = "Lo siento, tuve un problema procesándolo. 🤖⚙️";
        }

        const cleanResponse = sanitizeMarkdown(aiResponse);

        // --- ENTREGAR RESPUESTA (META vs EVOLUTION) ---
        if (platform === "evolution") {
            try {
                const { data: ps2 } = await supabase.from("platform_settings").select("evolution_api_url, evolution_api_key").eq("id", "global").maybeSingle();
                const evoUrl = ps2?.evolution_api_url || m.evolution_api_url || "";
                const evoKey = ps2?.evolution_api_key || m.evolution_api_key || "";
                const evoInstance = m.wa_session_id || instanceName || m.merchant_code || "";

                if (evoUrl && evoKey && evoInstance) {
                    const sendUrl = `${evoUrl.replace(/\/$/, '')}/message/sendText/${evoInstance}`;
                    await fetch(sendUrl, {
                        method: "POST",
                        headers: { "Content-Type": "application/json", "apikey": evoKey },
                        body: JSON.stringify({ number: customerPhone, text: cleanResponse, delay: 1200 })
                    });
                    console.log(`[WH-EVO-SEND] Respuesta enviada a ${customerPhone}`);
                }
            } catch (sendErr) {
                console.error("[WH-EVO-SEND ERROR]", sendErr);
            }
        } else {
            // META API
            const waUrl = `https://graph.facebook.com/v22.0/${m.whatsapp_phone_number_id}/messages`;
            await fetch(waUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${m.whatsapp_token}`
                },
                body: JSON.stringify({
                    messaging_product: "whatsapp",
                    to: customerPhone,
                    text: { body: cleanResponse }
                })
            });
        }

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
