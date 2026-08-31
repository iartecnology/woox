import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { processBotFlow } from "../_shared/bot-engine.ts";
import { notifyMerchantAgents } from "../_shared/notifications.ts";

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
    sanitized = sanitized.replace(/\[ORDER_CONFIRMED:\s*\{[\s\S]*?\}\s*\]/gi, "");
    sanitized = sanitized.replace(/^\s*[}\]]+\s*$/gm, "");
    return sanitized.trim();
}

Deno.serve(async (req: Request) => {
    const url = new URL(req.url);
    const merchantId = url.searchParams.get("merchant_id");
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
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
            if (m && m.whatsapp_verify_token === token) return new Response(challenge, { status: 200 });
        }
        return new Response("Forbidden", { status: 403 });
    }
    try {
        const body = await req.json();
        let messageData: any = null;
        let platform = "whatsapp";
        let waMessageId = "";
        let customerPhone = "";
        let customerName = "Cliente";
        let messageText = "";
        if (body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
            const value = body.entry[0].changes[0].value;
            const message = value.messages[0];
            waMessageId = message.id;
            customerPhone = message.from;
            customerName = value.contacts?.[0]?.profile?.name || "Cliente WhatsApp";
            messageText = message.text?.body || "";
        }
        if (!messageText) return new Response("ok", { headers: corsHeaders });
        const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
        let m: any = null;
        if (merchantId) {
            const { data: mById } = await supabase.from("merchants").select("*").eq("id", merchantId).maybeSingle();
            m = mById;
            if (!m) {
                const { data: mByCode } = await supabase.from("merchants").select("*").eq("merchant_code", merchantId).maybeSingle();
                m = mByCode;
            }
        }
        if (!m) throw new Error(`Merchant not found (ID: ${merchantId})`);
        const { data: existing } = await supabase.from("messages").select("id").eq("metadata->>wa_message_id", waMessageId).maybeSingle();
        if (existing) return new Response("ok", { headers: corsHeaders });
        let { data: customer } = await supabase.from("customers").select("*").eq("merchant_id", m.id).eq("phone", customerPhone).maybeSingle();
        if (!customer) {
            const { data: nc } = await supabase.from("customers").insert({ merchant_id: m.id, full_name: customerName, phone: customerPhone, whatsapp_phone: customerPhone }).select().single();
            customer = nc;
        }
        let { data: conversation } = await supabase.from("conversations").select("*").eq("merchant_id", m.id).eq("customer_id", customer!.id).eq("status", "open").maybeSingle();
        if (!conversation) {
            const { data: nconv } = await supabase.from("conversations").insert({ merchant_id: m.id, customer_id: customer!.id, channel: "whatsapp", status: "open" }).select().single();
            conversation = nconv;
        }
        await supabase.from("messages").insert({ conversation_id: conversation!.id, sender_type: "customer", content: messageText, metadata: { wa_message_id: waMessageId } });
        await supabase.from("conversations").update({ last_message: messageText, last_message_at: new Date().toISOString(), unread_count: (conversation!.unread_count || 0) + 1 }).eq("id", conversation!.id);
        let aiResponse = "";
        try {
            if (conversation!.ai_active) {
                const engineRes = await processBotFlow(supabase, m.id, conversation!.id, messageText, customer!.id);
                if (engineRes) aiResponse = engineRes;
            }
            if (!aiResponse) {
                await notifyMerchantAgents(supabase, m.id, "Nuevo mensaje (WA Meta)", `De: ${customer!.full_name || 'Cliente'}\nMensaje: ${messageText.slice(0, 50)}...`);
                return new Response("ok", { headers: corsHeaders });
            }
        } catch (e: any) { aiResponse = "Lo siento, tuve un problema procesándolo. 🤖⚙️"; }
        const cleanResponse = sanitizeMarkdown(aiResponse);
        const parts = cleanResponse.split('\n\n');
        const waUrl = `https://graph.facebook.com/v22.0/${m.whatsapp_phone_number_id}/messages`;

        for (const part of parts) {
            if (part.startsWith('[PDF:') && part.endsWith(']')) {
                const pdfData = part.slice(5, -1).split(':');
                const url = pdfData[0];
                const caption = pdfData.slice(1).join(':'); // Rejoin in case caption has colons
                
                await fetch(waUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${m.whatsapp_token}` },
                    body: JSON.stringify({
                        messaging_product: "whatsapp",
                        to: customerPhone,
                        type: "document",
                        document: {
                            link: url,
                            caption: caption || "Menú",
                            filename: "Menu.pdf"
                        }
                    })
                });
            } else if (part.trim()) {
                await fetch(waUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${m.whatsapp_token}` },
                    body: JSON.stringify({ messaging_product: "whatsapp", to: customerPhone, text: { body: part } })
                });
            }
        }

        await supabase.from("messages").insert({ conversation_id: conversation!.id, sender_type: "ai", content: cleanResponse });
        await supabase.from("conversations").update({ last_message: cleanResponse, last_message_at: new Date().toISOString() }).eq("id", conversation!.id);
        return new Response("ok", { headers: corsHeaders });
    } catch (error: any) { return new Response("ok", { headers: corsHeaders }); }
});
