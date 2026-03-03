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
        let merchantId = url.searchParams.get("merchant_id");

        const body = await req.json();
        const data = body.data;
        const instanceName = body.instance; // Importante para fallback

        if (!data || !data.message) {
            console.log("[EVOLUTION] Payload sin mensaje ignorado.");
            return new Response("ok", { headers: corsHeaders });
        }
        if (data.fromMe) return new Response("ok", { headers: corsHeaders });

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
            // 1. Obtener la URL del motor desde los ajustes globales de la base de datos
            const { data: ps } = await supabase.from("platform_settings").select("ai_engine_url").eq("id", "global").maybeSingle();

            const engineUrl = ps?.ai_engine_url || Deno.env.get("PYTHON_ENGINE_URL") || "http://167.86.73.89:8000";
            const engineSecret = Deno.env.get("PYTHON_ENGINE_AUTH");

            console.log(`[GATEWAY] Usando Engine URL: ${engineUrl}`);

            const pyRes = await fetch(`${engineUrl.replace(/\/$/, '')}/process-message`, {
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
            console.error("[EVOLUTION-WEBHOOK ERROR]", e);
            aiResponse = "Lo siento, mis circuitos están un poco cansados. 🤖✨ Por favor, intenta de nuevo en un momento.";
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
