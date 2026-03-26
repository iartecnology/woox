import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { processBotFlow } from "../_shared/bot-engine.ts";
import { notifyMerchantAgents } from "../_shared/notifications.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function sanitizeMarkdown(text: string): string {
    if (!text) return "";
    let sanitized = text;

    // 1. Limpieza de bloques técnicos y comandos internos
    sanitized = sanitized.replace(/\(INTERNO:.*?\)/gi, "");
    sanitized = sanitized.replace(/\(DESCRIPCIÓN REAL:.*?\)/gi, "");
    sanitized = sanitized.replace(/\[DISPONIBLE\]/gi, "");
    sanitized = sanitized.replace(/\[AGOTADO\]/gi, "");
    sanitized = sanitized.replace(/\[UPDATE_CART:.*?\]/gi, "");
    sanitized = sanitized.replace(/\[IMAGE_URL:.*?\]/gi, "");
    sanitized = sanitized.replace(/^\s*[}\]]+\s*$/gm, "");

    // 2. WhatsApp: Convertir **negrita** a *negrita*
    sanitized = sanitized.replace(/\*\*(.*?)\*\*/g, "*$1*");

    return sanitized.trim();
}

Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    try {
        const url = new URL(req.url);
        let merchantId = url.searchParams.get("merchant_id");

        const body = await req.json();
        const data = body.data;
        const instanceName = body.instance; // Importante para fallback

        if (!data || !data.message) {
            console.log("[EVOLUTION] Payload sin mensaje ignorado.");
            return new Response("ok", { headers: corsHeaders });
        }
        if (data.key?.fromMe === true) {
            console.log("[EVOLUTION] Mensaje saliente ignorado (fromMe: true)");
            return new Response("ok", { headers: corsHeaders });
        }

        const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

        // --- BUSCAR COMERCIO ---
        let m: any = null;
        if (merchantId) {
            const { data: mById } = await supabase.from("merchants").select("*").eq("id", merchantId).maybeSingle();
            m = mById;
            if (!m) {
                // Buscar por merchant_code (ej: BURGERKING05)
                const { data: mByCode } = await supabase.from("merchants").select("*").eq("merchant_code", merchantId).maybeSingle();
                m = mByCode;
            }
            if (!m) {
                // Último fallback: por slug (ej: burger-king-pro)
                const { data: mBySlug } = await supabase.from("merchants").select("*").eq("slug", merchantId).maybeSingle();
                m = mBySlug;
            }
        }

        // Fallback final: Buscar por instanceName de Evolution
        if (!m && instanceName) {
            const { data: mByCode } = await supabase.from("merchants").select("*").eq("merchant_code", instanceName).maybeSingle();
            m = mByCode;
            if (!m) {
                const { data: mBySlug } = await supabase.from("merchants").select("*").eq("slug", instanceName).maybeSingle();
                m = mBySlug;
            }
        }

        if (!m) {
            console.error(`[EVOLUTION ERROR] Comercio no encontrado (ID: ${merchantId}, Instance: ${instanceName})`);
            return new Response("ok", { headers: corsHeaders });
        }
        console.log(`[EVOLUTION] Merchant Found: ${m.name} (${m.id}) | Code: ${m.merchant_code}`);

        const evolutionMessageId = data.key.id;
        const customerPhone = data.key.remoteJid.split('@')[0];
        const customerName = data.pushName || "Cliente Evolution";

        // --- EXTRACCIÓN ROBUSTA DE TEXTO ---
        let messageText = data.message.conversation || "";
        if (!messageText && data.message.extendedTextMessage) {
            messageText = data.message.extendedTextMessage.text || "";
        }
        if (!messageText && data.message.imageMessage) {
            messageText = data.message.imageMessage.caption || "";
        }
        if (!messageText && data.message.videoMessage) {
            messageText = data.message.videoMessage.caption || "";
        }

        if (!messageText) {
            console.log("[EVOLUTION] Mensaje sin texto ignorado.");
            return new Response("ok", { headers: corsHeaders });
        }

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
        let { data: conversation } = await supabase.from("conversations").select("*").eq("merchant_id", m.id).eq("customer_id", customer!.id).eq("status", "open").maybeSingle();
        if (!conversation) {
            const { data: nconv } = await supabase.from("conversations").insert({
                merchant_id: m.id,
                customer_id: customer!.id,
                channel: "whatsapp_evolution",
                status: "open"
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

        // --- NUEVA LÓGICA: BOT FLOW ENGINE (SUPABASE NATIVO) ---
        let aiResponse = "";
        try {
            // Solo procesar si la IA está activa para esta conversación
            if (conversation!.ai_active) {
                const engineRes = await processBotFlow(supabase, m.id, conversation!.id, messageText, customer!.id);
                if (engineRes) {
                    aiResponse = engineRes;
                    console.log("[BOT-ENGINE] Respuesta procesada desde Flujo Visual (Evolution)");
                }
            }
            
            if (!aiResponse) {
                // Si la IA no está activa o no hay respuesta del flujo, no respondemos automáticamente
                // NOTIFICAR A LOS AGENTES
                await notifyMerchantAgents(supabase, m.id, "Nuevo mensaje (WA)", `De: ${customer!.full_name || 'Cliente'}\nMensaje: ${messageText.slice(0, 50)}...`);
                return new Response("ok", { headers: corsHeaders });
            }
        } catch (e: any) {
            console.error("[BOT-ENGINE ERROR]", e);
            aiResponse = "Ups! Tuve un problema procesando eso. 🤖⚙️";
        }

        const cleanResponse = sanitizeMarkdown(aiResponse);

        // Enviar respuesta vía Evolution API
        try {
            // Obtener config de platform_settings
            const { data: ps2 } = await supabase.from("platform_settings").select("evolution_api_url, evolution_api_key").eq("id", "global").maybeSingle();

            const evoUrl = ps2?.evolution_api_url || m.evolution_api_url || "";
            const evoKey = ps2?.evolution_api_key || m.evolution_api_key || "";
            // Usar wa_session_id del comercio como nombre de instancia; si no, usar merchant_code
            const evoInstance = m.wa_session_id || m.evolution_instance_name || instanceName || m.merchant_code || "";

            if (!evoUrl || !evoKey || !evoInstance) {
                console.error(`[EVOLUTION-SEND ERROR] Config incompleta: URL=${evoUrl}, Instance=${evoInstance}, KeyPresent=${!!evoKey}`);
            } else {
                const sendUrl = `${evoUrl.replace(/\/$/, '')}/message/sendText/${evoInstance}`;
                console.log(`[EVOLUTION-SEND] Enviando a ${customerPhone} via ${sendUrl}`);

                const sendRes = await fetch(sendUrl, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "apikey": evoKey
                    },
                    body: JSON.stringify({
                        number: customerPhone,
                        text: cleanResponse,
                        delay: 1200
                    })
                });

                if (!sendRes.ok) {
                    const errBody = await sendRes.text();
                    console.error(`[EVOLUTION-SEND ERROR] Status: ${sendRes.status}, Body: ${errBody}`);
                } else {
                    console.log(`[EVOLUTION-SEND] ✅ Respuesta enviada a ${customerPhone}`);
                }
            }
        } catch (sendErr: any) {
            console.error("[EVOLUTION-SEND EXCEPTION]", sendErr.message);
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
