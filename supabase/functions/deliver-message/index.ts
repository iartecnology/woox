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
        const { data: conv, error: convErr } = await supabase
            .from('conversations')
            .select(`
        id,
        channel,
        merchant_id,
        customers (
          telegram_chat_id
        ),
        merchants (
          telegram_bot_token
        )
      `)
            .eq('id', conversation_id)
            .single();

        if (convErr || !conv) {
            throw new Error("Conversation not found");
        }

        const channel = conv.channel;
        const botToken = conv.merchants?.telegram_bot_token;
        const chatId = conv.customers?.telegram_chat_id;

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
