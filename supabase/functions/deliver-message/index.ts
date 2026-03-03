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
                    facebook_page_token,
                    wa_connector_type,
                    wa_status,
                    wa_session_id
                )
            `)
            .eq('id', conversation_id)
            .single();

        // 1.5 Obtener configuración global de Evolution API
        const { data: platformSettings } = await supabase
            .from('platform_settings')
            .select('evolution_api_url, evolution_api_key')
            .single();

        if (convErr || !rawConv) {
            console.error("[Deliver Error] Conversation not found or error:", convErr);
            throw new Error(`Conversation not found: ${conversation_id}`);
        }

        const conv: any = rawConv;
        const merchant = conv.merchant;
        const customer = conv.customer;

        const channel = conv.channel;
        const waConnectorType = merchant?.wa_connector_type || 'meta';
        const waStatus = merchant?.wa_status;

        // --- MEDIDAS ANTI-BAN: HUMANIZACIÓN ---
        // 1. Simulación de Tiempo de Escritura (reducido a la mitad)
        const typingSpeedMs = Math.min(Math.max(content.length * 25, 750), 2500); // Entre 0.75s y 2.5s
        const randomDelay = Math.floor(Math.random() * 1000); // Delay extra aleatorio hasta 1s

        console.log(`[Anti-Ban] Mensaje de ${content.length} chars. Esperando ${typingSpeedMs + randomDelay}ms para simular humano...`);

        if (channel === 'telegram') {
            const botToken = merchant?.telegram_bot_token;
            const chatId = customer?.telegram_chat_id;
            if (!botToken || !chatId) throw new Error("Telegram config missing");

            // Simular "Escribiendo..." en Telegram
            await fetch(`https://api.telegram.org/bot${botToken}/sendChatAction`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chat_id: chatId, action: "typing" })
            });

            await new Promise(r => setTimeout(r, typingSpeedMs + randomDelay));

            const telRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chat_id: chatId, text: content, parse_mode: "Markdown" })
            });

            const telData = await telRes.json();
            return new Response(JSON.stringify({ ok: true, provider_response: telData }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }

        if (channel === 'whatsapp' || channel === 'whatsapp_evolution') {
            const waCustomerPhone = customer?.whatsapp_phone || customer?.phone;
            if (!waCustomerPhone) throw new Error("Customer WhatsApp phone missing");

            // --- Decidir proveedor de envío ---
            const isEvolutionChannel = channel === 'whatsapp_evolution' || waConnectorType === 'web_qr';

            if (isEvolutionChannel) {
                // --- Envío via Evolution API ---
                if (waStatus !== 'connected') {
                    console.warn("[Deliver] Evolution not connected, attempting anyway...");
                }

                const evolutionUrl = platformSettings?.evolution_api_url;
                const evolutionKey = platformSettings?.evolution_api_key;
                const instanceName = merchant?.wa_session_id;

                if (!evolutionUrl || !evolutionKey || !instanceName) {
                    throw new Error(`Evolution API config missing: URL=${evolutionUrl}, Instance=${instanceName}`);
                }

                await new Promise(r => setTimeout(r, typingSpeedMs + randomDelay));

                console.log(`[Deliver] Enviando vía EVOLUTION (${waCustomerPhone}) -> Instance: ${instanceName}`);

                const evoRes = await fetch(`${evolutionUrl.replace(/\/$/, '')}/message/sendText/${instanceName}`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "apikey": evolutionKey
                    },
                    body: JSON.stringify({
                        number: waCustomerPhone,
                        text: content,
                        delay: 1200,
                        linkPreview: true
                    })
                });

                const evoData = await evoRes.json();

                if (!evoRes.ok) {
                    throw new Error(`Evolution API Error: ${JSON.stringify(evoData)}`);
                }

                return new Response(JSON.stringify({ ok: true, method: 'evolution', status: 'delivered', provider_response: evoData }), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });

            } else {
                // --- Lógica para WhatsApp Meta API (Oficial) ---
                const waToken = merchant?.whatsapp_token;
                const waPhoneId = merchant?.whatsapp_phone_number_id;
                if (!waToken || !waPhoneId) throw new Error("WhatsApp Meta config missing");

                await new Promise(r => setTimeout(r, typingSpeedMs + randomDelay));

                const waRes = await fetch(`https://graph.facebook.com/v22.0/${waPhoneId}/messages`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${waToken}` },
                    body: JSON.stringify({
                        messaging_product: "whatsapp",
                        to: waCustomerPhone,
                        type: "text",
                        text: { body: content }
                    })
                });

                const waData = await waRes.json();
                return new Response(JSON.stringify({ ok: true, provider_response: waData }), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            }
        }

        if (channel === 'facebook') {
            const fbToken = merchant?.facebook_page_token;
            const fbUserId = customer?.facebook_user_id;
            if (!fbToken || !fbUserId) throw new Error("Facebook config missing");

            // Simular "Typing..." en Messenger
            await fetch(`https://graph.facebook.com/v22.0/me/messages?access_token=${fbToken}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ recipient: { id: fbUserId }, sender_action: "typing_on" })
            });

            await new Promise(r => setTimeout(r, typingSpeedMs + randomDelay));

            const fbRes = await fetch(`https://graph.facebook.com/v22.0/me/messages?access_token=${fbToken}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    recipient: { id: fbUserId },
                    message: { text: content }
                })
            });

            const fbData = await fbRes.json();
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
