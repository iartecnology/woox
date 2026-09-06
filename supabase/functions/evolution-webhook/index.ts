import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { processBotFlow } from "../_shared/bot-engine.ts";
import { notifyMerchantAgents } from "../_shared/notifications.ts";
// Force Deploy: 2026-04-24 11:36


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
    sanitized = sanitized.replace(/\[ORDER_CONFIRMED:\s*\{[\s\S]*?\}\s*\]/gi, "");
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
            // Verificar si el merchantId es un UUID válido
            const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(merchantId);
            
            if (isUUID) {
                const { data: mById } = await supabase.from("merchants").select("*").eq("id", merchantId).maybeSingle();
                m = mById;
            }
            
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
        const { data: existingMsgs } = await supabase.from("messages").select("id").eq("metadata->>evolution_message_id", evolutionMessageId).limit(1);
        if (existingMsgs && existingMsgs.length > 0) return new Response("ok", { headers: corsHeaders });

        let { data: customers } = await supabase.from("customers").select("*").eq("merchant_id", m.id).eq("phone", customerPhone).order('created_at', { ascending: false }).limit(1);
        let customer = customers && customers.length > 0 ? customers[0] : null;

        if (!customer) {
            const { data: nc } = await supabase.from("customers").insert({ merchant_id: m.id, full_name: customerName, phone: customerPhone }).select().single();
            customer = nc;
        } else if ((customer.full_name === "Cliente Evolution" || !customer.full_name) && data.pushName && data.pushName !== "Cliente Evolution") {
            const { data: uc } = await supabase.from("customers").update({ full_name: data.pushName }).eq("id", customer.id).select().single();
            customer = uc;
        }

        let { data: convs } = await supabase.from("conversations")
            .select("*")
            .eq("merchant_id", m.id)
            .eq("customer_id", customer!.id)
            .eq("channel", "whatsapp_evolution")
            .eq("status", "open")
            .order('created_at', { ascending: false })
            .limit(1);
        
        let conversation = convs && convs.length > 0 ? convs[0] : null;

        if (!conversation) {
            const { data: nconv } = await supabase.from("conversations").insert({ 
                merchant_id: m.id, 
                customer_id: customer!.id, 
                channel: "whatsapp_evolution", 
                status: "open",
                ai_active: true
            }).select().single();
            conversation = nconv;
        }
        await supabase.from("messages").insert({ conversation_id: conversation!.id, sender_type: "customer", content: messageText, metadata: { evolution_message_id: evolutionMessageId } });
        await supabase.from("conversations").update({ last_message: messageText, last_message_at: new Date().toISOString(), unread_count: (conversation!.unread_count || 0) + 1 }).eq("id", conversation!.id);
        const { data: ps2 } = await supabase.from("platform_settings").select("evolution_api_url, evolution_api_key").eq("id", "global").maybeSingle();
        const evoUrl = ps2?.evolution_api_url || (m as any).evolution_api_url || Deno.env.get("EVOLUTION_API_URL") || "";
        const evoKey = ps2?.evolution_api_key || (m as any).evolution_api_key || Deno.env.get("EVOLUTION_API_KEY") || "";
        const evoInstance = m.wa_session_id || instanceName || m.merchant_code || "";

        let aiResponse = "";
        let typingInterval: any;

        if (evoUrl && evoKey && evoInstance) {
            const baseUrl = evoUrl.replace(/\/$/, '');
            const sendTyping = () => fetch(`${baseUrl}/chat/sendPresence/${evoInstance}`, {
                method: "POST", headers: { "Content-Type": "application/json", "apikey": evoKey },
                body: JSON.stringify({ number: customerPhone, presence: "composing", delay: 4000 })
            }).catch(() => {});
            
            sendTyping();
            typingInterval = setInterval(sendTyping, 4000);
        }

        try {
            console.log(`[Evolution] Processing message from ${customerPhone} for merchant ${m.name}`);
            if (conversation!.ai_active) {
                const engineRes = await processBotFlow(supabase, m.id, conversation!.id, messageText, customer!.id);
                if (engineRes) aiResponse = engineRes;
            }
            if (!aiResponse) {
                console.log(`[Evolution] No AI response generated or AI disabled. Notifying agents.`);
                await notifyMerchantAgents(supabase, m.id, "Nuevo mensaje (WA)", `De: ${customer!.full_name || 'Cliente'}\nMensaje: ${messageText.slice(0, 50)}...`);
                if (typingInterval) clearInterval(typingInterval);
                return new Response("ok", { headers: corsHeaders });
            }
        } catch (e: any) { 
            console.error(`[Evolution] Error in bot engine:`, e);
            aiResponse = "Ups! Tuve un problema procesándolo. 🤖⚙️"; 
        } finally {
            if (typingInterval) clearInterval(typingInterval);
        }

        const cleanResponse = sanitizeMarkdown(aiResponse);
        const parts = cleanResponse.split('\n\n');
        
        try {
            if (evoUrl && evoKey && evoInstance) {
                const baseUrl = evoUrl.replace(/\/$/, '');
                console.log(`[Evolution] Sending response to WhatsApp via ${baseUrl} (Instance: ${evoInstance})`);
                
                for (const part of parts) {
                    if (part.startsWith('[PDF:') && part.endsWith(']')) {
                        const pdfData = part.slice(5, -1).split(':');
                        const url = pdfData[0];
                        const caption = pdfData.slice(1).join(':');
                        
                        const sendMediaUrl = `${baseUrl}/message/sendMedia/${evoInstance}`;
                        console.log(`[Evolution] Sending PDF: ${url}`);
                        const res = await fetch(sendMediaUrl, { 
                            method: "POST", 
                            headers: { "Content-Type": "application/json", "apikey": evoKey }, 
                            body: JSON.stringify({ 
                                number: customerPhone, 
                                media: url,
                                mediatype: "document",
                                caption: caption || "Menú",
                                fileName: "Menu.pdf",
                                delay: 400 
                            }) 
                        });
                        if (!res.ok) console.error(`[Evolution] Failed to send PDF: ${res.status} ${await res.text()}`);
                    } else if (part.trim()) {
                        const sendTextUrl = `${baseUrl}/message/sendText/${evoInstance}`;
                        const res = await fetch(sendTextUrl, { 
                            method: "POST", 
                            headers: { "Content-Type": "application/json", "apikey": evoKey }, 
                            body: JSON.stringify({ 
                                number: customerPhone, 
                                text: part, 
                                delay: 400 
                            }) 
                        });
                        if (!res.ok) console.error(`[Evolution] Failed to send text: ${res.status} ${await res.text()}`);
                    }
                }
            } else {
                console.error(`[Evolution] Missing configuration for sending. Url: ${!!evoUrl}, Key: ${!!evoKey}, Instance: ${!!evoInstance}`);
            }
        } catch (sendErr: any) {
            console.error(`[Evolution] Error sending message via Evolution API:`, sendErr);
        }

        await supabase.from("messages").insert({ 
            conversation_id: conversation!.id, 
            sender_type: "ai", 
            content: cleanResponse 
        });
        
        await supabase.from("conversations").update({ 
            last_message: cleanResponse, 
            last_message_at: new Date().toISOString() 
        }).eq("id", conversation!.id);

        return new Response("ok", { headers: corsHeaders });
    } catch (error: any) { 
        console.error(`[Evolution Webhook CRITICAL ERROR]:`, error);
        return new Response("ok", { headers: corsHeaders }); 
    }
});
