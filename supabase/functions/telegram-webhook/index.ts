import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function sanitizeMarkdown(text: string): string {
    let sanitized = text;
    // Borrar bloques técnicos conocidos
    sanitized = sanitized.replace(/\(INTERNO:.*?\)/gi, "");
    sanitized = sanitized.replace(/\(DESCRIPCION REAL:.*?\)/gi, "");
    sanitized = sanitized.replace(/\[DISPONIBLE\]/gi, "");
    sanitized = sanitized.replace(/\[AGOTADO\]/gi, "");
    sanitized = sanitized.replace(/\[CHECK_AVAILABILITY:.*?\]/gi, "");
    sanitized = sanitized.replace(/\[CREATE_BOOKING:.*?\]/gi, "");

    // Limpiar comandos internos de la IA
    sanitized = sanitized.replace(/\[ORDER_CONFIRMED:\s*\{[\s\S]*\}\s*\]/g, "");
    sanitized = sanitized.replace(/\[UPDATE[_ ]CART:\s*\{[\s\S]*?\}\s*\]/g, "");
    sanitized = sanitized.replace(/^\s*[}\]]+\s*$/gm, "");

    const asterisks = (sanitized.match(/\*/g) || []).length;
    const underscores = (sanitized.match(/_/g) || []).length;
    if (asterisks % 2 !== 0) sanitized = sanitized.replace(/\*/g, "");
    if (underscores % 2 !== 0) sanitized = sanitized.replace(/_/g, " ");
    return sanitized.trim();
}

Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    try {
        const url = new URL(req.url);
        const merchantId = url.searchParams.get("merchant_id");
        if (!merchantId) throw new Error("merchant_id missing");

        const update = await req.json();
        const message = update.message || update.edited_message;
        if (!message || !message.text) return new Response("ok", { headers: corsHeaders });

        const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
        const messageId = message.message_id.toString();
        const chatId = message.chat.id.toString();
        const telegramUserId = message.from.id.toString();
        const telegramUsername = message.from.username || message.from.first_name || "Cliente";
        const messageText = message.text;

        // Deduplicación
        const { data: existing } = await supabase.from("messages").select("id").eq("metadata->>telegram_message_id", messageId).maybeSingle();
        if (existing) return new Response("ok", { headers: corsHeaders });

        // Obtener merchant
        const { data: m } = await supabase.from("merchants").select("*").eq("id", merchantId).single();
        if (!m) throw new Error("Merchant not found");

        // Enviar acción 'typing'
        fetch(`https://api.telegram.org/bot${m.telegram_bot_token}/sendChatAction`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, action: "typing" })
        }).catch(e => console.error("Error sending typing action", e));

        // Obtener o crear cliente
        let { data: customer } = await supabase.from("customers").select("*").eq("merchant_id", merchantId).eq("telegram_user_id", telegramUserId).maybeSingle();
        if (!customer) {
            const { data: nc } = await supabase.from("customers").insert({
                merchant_id: merchantId,
                full_name: telegramUsername,
                telegram_user_id: telegramUserId,
                telegram_chat_id: chatId
            }).select().single();
            customer = nc;
        }

        // Obtener o crear conversación
        let { data: conversation } = await supabase.from("conversations").select("*").eq("merchant_id", merchantId).eq("customer_id", customer!.id).eq("status", "active").maybeSingle();
        if (!conversation) {
            const { data: nconv } = await supabase.from("conversations").insert({
                merchant_id: merchantId,
                customer_id: customer!.id,
                channel: "telegram",
                status: "active"
            }).select().single();
            conversation = nconv;
        }

        // Guardar mensaje del cliente
        await supabase.from("messages").insert({
            conversation_id: conversation!.id,
            sender_type: "customer",
            content: messageText,
            metadata: { telegram_message_id: messageId }
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
            // 1. Obtener URL dinámica desde DB
            const { data: ps } = await supabase.from("platform_settings").select("ai_engine_url").eq("id", "global").maybeSingle();

            const engineUrl = ps?.ai_engine_url || Deno.env.get("PYTHON_ENGINE_URL") || "http://167.86.73.89:8000";
            const engineSecret = Deno.env.get("PYTHON_ENGINE_AUTH");

            console.log(`[GATEWAY] Enviando a Python Engine (${engineUrl}): ${messageText}`);

            const pyRes = await fetch(`${engineUrl.replace(/\/$/, '')}/process-message`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Auth-Token": engineSecret || ""
                },
                body: JSON.stringify({
                    merchant_id: merchantId,
                    conversation_id: conversation!.id,
                    customer_id: customer!.id,
                    message_text: messageText,
                    platform: "telegram"
                })
            });

            if (!pyRes.ok) {
                const errText = await pyRes.text();
                throw new Error(`Engine Error: ${pyRes.status} - ${errText}`);
            }

            const pyData = await pyRes.json();
            aiResponse = pyData.response || "Lo siento, no pude procesar tu mensaje.";
            console.log("[GATEWAY] Respuesta de Python recibida correctamente");

        } catch (e: any) {
            console.error("[GATEWAY Exception]", e);
            aiResponse = "Lo siento, mis circuitos están un poco cansados. 🤖✨ Por favor, intenta de nuevo en un momento.";
        }

        // Enviar respuesta a Telegram
        const finalMessage = typeof aiResponse === 'string' ? sanitizeMarkdown(aiResponse) : "Lo siento, tuve un problema procesando tu mensaje.";
        
        try {
            const tgRes = await fetch(`https://api.telegram.org/bot${m.telegram_bot_token}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: finalMessage,
                    parse_mode: "Markdown"
                })
            });

            if (!tgRes.ok) {
                // Fallback: Si el error es de parseo de Markdown, enviar como texto plano
                const errorData = await tgRes.json();
                if (errorData.description?.includes("can't parse entities")) {
                    console.warn("[GATEWAY] Error de Markdown, reintentando como texto plano");
                    await fetch(`https://api.telegram.org/bot${m.telegram_bot_token}/sendMessage`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            chat_id: chatId,
                            text: finalMessage
                        })
                    });
                } else {
                    throw new Error(`Telegram API Error: ${tgRes.status} - ${JSON.stringify(errorData)}`);
                }
            }
        } catch (tgError) {
            console.error("[GATEWAY Telegram Send Error]", tgError);
        }

        // Guardar mensaje de la IA
        await supabase.from("messages").insert({
            conversation_id: conversation!.id,
            sender_type: "ai",
            content: finalMessage
        });

        // Actualizar conversación
        await supabase.from("conversations").update({
            last_message: finalMessage,
            last_message_at: new Date().toISOString()
        }).eq("id", conversation!.id);

        return new Response("ok", { headers: corsHeaders });

    } catch (error: any) {
        console.error(`[FATAL ERROR]`, error.message);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
