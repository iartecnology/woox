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
    sanitized = sanitized.replace(/\(DESCRIPCION REAL:.*?\)/gi, "");
    sanitized = sanitized.replace(/\[DISPONIBLE\]/gi, "");
    sanitized = sanitized.replace(/\[AGOTADO\]/gi, "");
    sanitized = sanitized.replace(/\[CHECK_AVAILABILITY:.*?\]/gi, "");
    sanitized = sanitized.replace(/\[CREATE_BOOKING:.*?\]/gi, "");
    sanitized = sanitized.replace(/\[IMAGE_URL:.*?\]/gi, "");
    sanitized = sanitized.replace(/\[ORDER_CONFIRMED:\s*\{[\s\S]*\}\s*\]/g, "");
    sanitized = sanitized.replace(/\[UPDATE[_ ]CART:\s*\{[\s\S]*?\}\s*\]/g, "");
    
    // 2. Telegram Markdown V1 es muy estricto con los caracteres especiales sin cerrar.
    // Aseguramos que los asteriscos esten balanceados para negrita
    const asterisks = (sanitized.match(/\*/g) || []).length;
    if (asterisks % 2 !== 0) sanitized = sanitized.replace(/\*/g, "");

    // 3. Guiones bajos (_) causan muchos problemas en Telegram si no están balanceados (Markdown V1)
    const underscores = (sanitized.match(/_/g) || []).length;
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
        let { data: conversation } = await supabase.from("conversations")
            .select("*")
            .eq("merchant_id", merchantId)
            .eq("customer_id", customer!.id)
            .eq("platform", "telegram")
            .maybeSingle();

        if (!conversation) {
            const { data: nconv, error: convErr } = await supabase.from("conversations").insert({
                merchant_id: merchantId,
                customer_id: customer!.id,
                platform: "telegram",
                channel: "telegram",
                status: "open",
                ai_active: true
            }).select().single();
            if (convErr) throw convErr;
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

        // --- NUEVA LÓGICA: BOT FLOW ENGINE (SUPABASE NATIVO) ---
        let aiResponse = "";
        try {
            // Solo procesar si la IA está activa para esta conversación
            if (conversation!.ai_active) {
                const engineRes = await processBotFlow(supabase, merchantId, conversation!.id, messageText, customer!.id);
                if (engineRes) {
                    aiResponse = engineRes;
                    console.log("[BOT-ENGINE] Respuesta procesada desde Flujo Visual");
                }
            }
            
            if (!aiResponse) {
                // Si la IA no está activa o no hay respuesta del flujo, no respondemos automáticamente
                // NOTIFICAR A LOS AGENTES
                await notifyMerchantAgents(supabase, merchantId, "Nuevo mensaje (TG)", `De: ${customer!.full_name || 'Cliente'}\nMensaje: ${messageText.slice(0, 50)}...`);
                return new Response("ok", { headers: corsHeaders });
            }
        } catch (e: any) {
            console.error("[BOT-ENGINE ERROR]", e);
            aiResponse = "Ups! Tuve un pequeño error procesando eso. 🤖⚙️";
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
