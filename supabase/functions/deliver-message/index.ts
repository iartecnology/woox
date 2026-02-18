import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    try {
        const { conversation_id, content } = await req.json();
        if (!conversation_id || !content) {
            throw new Error("conversation_id and content are required");
        }

        const supabase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        );

        // 1. Obtener detalles de la conversación, el cliente y el comercio
        const { data: rawConv, error: convErr } = await supabase
            .from('conversations')
            .select(`
                id,
                channel,
                merchant_id,
                customer:customers (
                    telegram_chat_id,
                    whatsapp_phone,
                    facebook_user_id
                ),
                merchant:merchants (
                    telegram_bot_token,
                    whatsapp_token,
                    whatsapp_phone_number_id,
                    facebook_page_token
                )
            `)
            .eq('id', conversation_id)
            .single();

        if (convErr || !rawConv) {
            console.error("[Deliver Error] Conversation not found or error:", convErr);
            throw new Error(`Conversation not found: ${conversation_id}`);
        }

        // Supabase sometimes returns joins as an object or as a single-item array
        const conv: any = rawConv;
        const merchant = Array.isArray(conv.merchant) ? conv.merchant[0] : conv.merchant;
        const customer = Array.isArray(conv.customer) ? conv.customer[0] : conv.customer;

        const channel = conv.channel;
        const botToken = merchant?.telegram_bot_token;
        const chatId = customer?.telegram_chat_id;
        const waToken = merchant?.whatsapp_token;
        const waPhoneId = merchant?.whatsapp_phone_number_id;
        const waCustomerPhone = customer?.whatsapp_phone;
        const fbToken = merchant?.facebook_page_token;
        const fbUserId = customer?.facebook_user_id;

        console.log(`[Deliver] Channel: ${channel}, WA_Phone: ${waCustomerPhone}, Has_Token: ${!!waToken}, Has_PhoneID: ${!!waPhoneId}`);

        if (channel === 'telegram') {
            if (!botToken || !chatId) {
                throw new Error("Telegram configuration missing (bot token or chat id)");
            }

            console.log(`[Deliver] Enviando a Telegram (${chatId}): ${content}`);

            const telRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: content,
                    parse_mode: "Markdown"
                })
            });

            const telData = await telRes.json();
            if (!telData.ok) {
                throw new Error(`Telegram API Error: ${JSON.stringify(telData)}`);
            }

            return new Response(JSON.stringify({ ok: true, provider_response: telData }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }

        if (channel === 'whatsapp') {
            if (!waToken || !waPhoneId || !waCustomerPhone) {
                throw new Error("WhatsApp configuration missing (token, phone id or customer phone)");
            }

            console.log(`[Deliver] Enviando a WhatsApp (${waCustomerPhone}): ${content}`);

            const waRes = await fetch(`https://graph.facebook.com/v22.0/${waPhoneId}/messages`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${waToken}`
                },
                body: JSON.stringify({
                    messaging_product: "whatsapp",
                    to: waCustomerPhone,
                    type: "text",
                    text: { body: content }
                })
            });

            const waData = await waRes.json();
            if (!waRes.ok) {
                const errMsg = waData.error?.message || JSON.stringify(waData);
                console.error(`[Deliver] WhatsApp API Error: ${errMsg}`);
                throw new Error(`WhatsApp: ${errMsg}`);
            }

            return new Response(JSON.stringify({ ok: true, provider_response: waData }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }

        if (channel === 'facebook') {
            if (!fbToken || !fbUserId) {
                throw new Error("Facebook configuration missing (page token or user id)");
            }

            console.log(`[Deliver] Enviando a Facebook Messenger (${fbUserId})`);

            const fbRes = await fetch(`https://graph.facebook.com/v22.0/me/messages?access_token=${fbToken}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    recipient: { id: fbUserId },
                    message: { text: content }
                })
            });

            const fbData = await fbRes.json();
            if (!fbRes.ok) {
                const errMsg = fbData.error?.message || JSON.stringify(fbData);
                console.error(`[Deliver] Facebook API Error: ${errMsg}`);
                throw new Error(`Facebook: ${errMsg}`);
            }

            return new Response(JSON.stringify({ ok: true, provider_response: fbData }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }

        // Si es simulador u otro canal no implementado aún, simplemente retornamos ok
        return new Response(JSON.stringify({ ok: true, message: "Channel not supported for external delivery yet" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });

    } catch (error: any) {
        console.error("[Deliver Error]:", error.message);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
    }
});
