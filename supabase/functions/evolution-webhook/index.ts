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
    sanitized = sanitized.replace(/\(INTERNO:.*?\)/gi, "");
    sanitized = sanitized.replace(/\(DESCRIPCIÓN REAL:.*?\)/gi, "");
    sanitized = sanitized.replace(/\[DISPONIBLE\]/gi, "");
    sanitized = sanitized.replace(/\[AGOTADO\]/gi, "");
    sanitized = sanitized.replace(/\[UPDATE_CART:.*?\]/gi, "");
    sanitized = sanitized.replace(/\[IMAGE_URL:.*?\]/gi, "");
    sanitized = sanitized.replace(/^\s*[}\]]+\s*$/gm, "");
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
        const instanceName = body.instance;
        if (!data || !data.message) return new Response("ok", { headers: corsHeaders });
        if (data.key?.fromMe === true) return new Response("ok", { headers: corsHeaders });
        const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
        let m: any = null;
        if (merchantId) {
            const { data: mById } = await supabase.from("merchants").select("*").eq("id", merchantId).maybeSingle();
            m = mById;
            if (!m) {
                const { data: mByCode } = await supabase.from("merchants").select("*").eq("merchant_code", merchantId).maybeSingle();
                m = mByCode;
            }
            if (!m) {
                const { data: mBySlug } = await supabase.from("merchants").select("*").eq("slug", merchantId).maybeSingle();
                m = mBySlug;
            }
        }
        if (!m && instanceName) {
            const { data: mByCode } = await supabase.from("merchants").select("*").eq("merchant_code", instanceName).maybeSingle();
            m = mByCode;
            if (!m) {
                 const { data: mBySlug } = await supabase.from("merchants").select("*").eq("slug", instanceName).maybeSingle();
                 m = mBySlug;
            }
        }
        if (!m) return new Response("ok", { headers: corsHeaders });
        const evolutionMessageId = data.key.id;
        const customerPhone = data.key.remoteJid.split('@')[0];
        const customerName = data.pushName || "Cliente Evolution";
        let messageText = data.message.conversation || data.message.extendedTextMessage?.text || data.message.imageMessage?.caption || data.message.videoMessage?.caption || "";
        if (!messageText) return new Response("ok", { headers: corsHeaders });
        const { data: existing } = await supabase.from("messages").select("id").eq("metadata->>evolution_message_id", evolutionMessageId).maybeSingle();
        if (existing) return new Response("ok", { headers: corsHeaders });
        let { data: customer } = await supabase.from("customers").select("*").eq("merchant_id", m.id).eq("phone", customerPhone).maybeSingle();
        if (!customer) {
            const { data: nc } = await supabase.from("customers").insert({ merchant_id: m.id, full_name: customerName, phone: customerPhone }).select().single();
            customer = nc;
        }
        let { data: conversation } = await supabase.from("conversations").select("*").eq("merchant_id", m.id).eq("customer_id", customer!.id).eq("status", "open").maybeSingle();
        if (!conversation) {
            const { data: nconv } = await supabase.from("conversations").insert({ merchant_id: m.id, customer_id: customer!.id, channel: "whatsapp_evolution", status: "open" }).select().single();
            conversation = nconv;
        }
        await supabase.from("messages").insert({ conversation_id: conversation!.id, sender_type: "customer", content: messageText, metadata: { evolution_message_id: evolutionMessageId } });
        await supabase.from("conversations").update({ last_message: messageText, last_message_at: new Date().toISOString(), unread_count: (conversation!.unread_count || 0) + 1 }).eq("id", conversation!.id);
        let aiResponse = "";
        try {
            if (conversation!.ai_active) {
                const engineRes = await processBotFlow(supabase, m.id, conversation!.id, messageText, customer!.id);
                if (engineRes) aiResponse = engineRes;
            }
            if (!aiResponse) {
                await notifyMerchantAgents(supabase, m.id, "Nuevo mensaje (WA)", `De: ${customer!.full_name || 'Cliente'}\nMensaje: ${messageText.slice(0, 50)}...`);
                return new Response("ok", { headers: corsHeaders });
            }
        } catch (e: any) { aiResponse = "Ups! Tuve un problema procesándolo. 🤖⚙️"; }
        const cleanResponse = sanitizeMarkdown(aiResponse);
        try {
            const { data: ps2 } = await supabase.from("platform_settings").select("evolution_api_url, evolution_api_key").eq("id", "global").maybeSingle();
            const evoUrl = ps2?.evolution_api_url || m.evolution_api_url || "";
            const evoKey = ps2?.evolution_api_key || m.evolution_api_key || "";
            const evoInstance = m.wa_session_id || instanceName || m.merchant_code || "";
            if (evoUrl && evoKey && evoInstance) {
                const sendUrl = `${evoUrl.replace(/\/$/, '')}/message/sendText/${evoInstance}`;
                await fetch(sendUrl, { method: "POST", headers: { "Content-Type": "application/json", "apikey": evoKey }, body: JSON.stringify({ number: customerPhone, text: cleanResponse, delay: 1200 }) });
            }
        } catch (sendErr: any) {}
        await supabase.from("messages").insert({ conversation_id: conversation!.id, sender_type: "ai", content: cleanResponse });
        await supabase.from("conversations").update({ last_message: cleanResponse, last_message_at: new Date().toISOString() }).eq("id", conversation!.id);
        return new Response("ok", { headers: corsHeaders });
    } catch (error: any) { return new Response("ok", { headers: corsHeaders }); }
});
