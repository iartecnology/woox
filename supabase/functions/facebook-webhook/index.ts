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
        if (!merchantId) throw new Error("merchant_id missing");
        const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
        let { data: m } = await supabase.from("merchants").select("*").eq("id", merchantId).maybeSingle();
        if (!m) {
            const { data: mc } = await supabase.from("merchants").select("*").eq("merchant_code", merchantId).maybeSingle();
            m = mc;
        }
        if (!m) throw new Error("Merchant not found");
        const body = await req.json();
        const entry = body.entry?.[0];
        const isInstagram = body.object === "instagram";
        const channelType = isInstagram ? "instagram" : "facebook";
        const messaging = entry?.messaging?.[0];
        if (!messaging) return new Response("ok", { headers: corsHeaders });
        const senderId = messaging.sender.id;
        const message = messaging.message;
        const postback = messaging.postback;
        if (message?.is_echo) return new Response("ok", { headers: corsHeaders });
        const messageText = message?.text || postback?.payload || "";
        if (!messageText) return new Response("ok", { headers: corsHeaders });
        const fbMessageId = message?.mid || `pb_${Date.now()}`;
        const { data: existing } = await supabase.from("messages").select("id").eq("metadata->>fb_message_id", fbMessageId).maybeSingle();
        if (existing) return new Response("ok", { headers: corsHeaders });
        let { data: customer } = await supabase.from("customers").select("*").eq("merchant_id", m.id).eq(isInstagram ? "instagram_user_id" : "facebook_user_id", senderId).maybeSingle();
        if (!customer) {
            const { data: nc } = await supabase.from("customers").insert({ merchant_id: m.id, full_name: isInstagram ? "Usuario Instagram" : "Usuario Messenger", [isInstagram ? "instagram_user_id" : "facebook_user_id"]: senderId }).select().single();
            customer = nc;
        }
        let { data: conversation } = await supabase.from("conversations").select("*").eq("merchant_id", m.id).eq("customer_id", customer!.id).eq("status", "open").maybeSingle();
        if (!conversation) {
            const { data: nconv } = await supabase.from("conversations").insert({ merchant_id: m.id, customer_id: customer!.id, channel: channelType, status: "open" }).select().single();
            conversation = nconv;
        }
        await supabase.from("messages").insert({ conversation_id: conversation!.id, sender_type: "customer", content: messageText, metadata: { fb_message_id: fbMessageId } });
        await supabase.from("conversations").update({ last_message: messageText, last_message_at: new Date().toISOString(), unread_count: (conversation!.unread_count || 0) + 1 }).eq("id", conversation!.id);
        let aiResponse = "";
        try {
            if (conversation!.ai_active) {
                const engineRes = await processBotFlow(supabase, m.id, conversation!.id, messageText, customer!.id);
                if (engineRes) aiResponse = engineRes;
            }
            if (!aiResponse) return new Response("ok", { headers: corsHeaders });
        } catch (e: any) { aiResponse = "Ups! Tuve un problema procesándolo. 🤖⚙️"; }
        const cleanResponse = sanitizeMarkdown(aiResponse);
        const fbUrl = `https://graph.facebook.com/v22.0/me/messages?access_token=${m.facebook_page_access_token}`;
        await fetch(fbUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recipient: { id: senderId }, message: { text: cleanResponse } }) });
        await supabase.from("messages").insert({ conversation_id: conversation!.id, sender_type: "ai", content: cleanResponse });
        await supabase.from("conversations").update({ last_message: cleanResponse, last_message_at: new Date().toISOString() }).eq("id", conversation!.id);
        return new Response("ok", { headers: corsHeaders });
    } catch (error: any) { return new Response("ok", { headers: corsHeaders }); }
});
