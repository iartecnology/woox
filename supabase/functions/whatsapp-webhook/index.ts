import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function sanitizeMarkdown(text: string): string {
    let sanitized = text;
    // WhatsApp no soporta Markdown completo, solo negrita (*), cursiva (_), tachado (~) y monoespaciado (```)
    sanitized = sanitized.replace(/\(INTERNO:.*?\)/gi, "");
    sanitized = sanitized.replace(/\(DESCRIPCIÓN REAL:.*?\)/gi, "");
    sanitized = sanitized.replace(/\[DISPONIBLE\]/gi, "");
    sanitized = sanitized.replace(/\[AGOTADO\]/gi, "");
    sanitized = sanitized.replace(/\[ORDER_CONFIRMED:.*?\]/gi, "");

    return sanitized.trim();
}

Deno.serve(async (req: Request) => {
    const url = new URL(req.url);
    const merchantId = url.searchParams.get("merchant_id");

    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    // 1. Verificación de Webhook (Meta handshake)
    if (req.method === "GET") {
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");

        console.log(`[Handshake] Intentando verificar merchant: ${merchantId}. Mode: ${mode}, Token: ${token}`);

        if (mode === "subscribe" && token) {
            const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

            // Buscar por ID o por Código
            let { data: m, error: err1 } = await supabase.from("merchants").select("whatsapp_verify_token").eq("id", merchantId).maybeSingle();
            if (!m) {
                const { data: mc, error: err2 } = await supabase.from("merchants").select("whatsapp_verify_token").eq("merchant_code", merchantId).maybeSingle();
                m = mc;
            }

            if (!m) {
                console.error(`[Handshake Error] Comercio no encontrado con ID/Código: ${merchantId}`);
                return new Response("Merchant Not Found", { status: 404 });
            }

            if (m.whatsapp_verify_token === token) {
                console.log("[Handshake Success] WhatsApp verified successfully for merchant:", merchantId);
                return new Response(challenge, { status: 200 });
            } else {
                console.error(`[Handshake Error] Token no coincide. Esperado: ${m.whatsapp_verify_token}, Recibido: ${token}`);
            }
        }
        return new Response("Forbidden", { status: 403 });
    }

    // 2. Procesamiento de Mensajes (POST)
    try {
        if (!merchantId) throw new Error("merchant_id missing");

        const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

        // Buscar comercio por ID (UUID) o por merchant_code (Amigable)
        let { data: m } = await supabase.from("merchants").select("*").eq("id", merchantId).maybeSingle();

        if (!m) {
            // Intentar por merchant_code
            const { data: mc } = await supabase.from("merchants").select("*").eq("merchant_code", merchantId).maybeSingle();
            m = mc;
        }

        if (!m) throw new Error("Merchant not found");
        const merchantIdInternal = m.id; // Siempre usar el UUID para relaciones internas

        const body = await req.json();

        // Validar que sea un mensaje de WhatsApp
        const entry = body.entry?.[0];
        const changes = entry?.changes?.[0];
        const value = changes?.value;
        const message = value?.messages?.[0];

        if (!message || message.type !== "text") {
            return new Response("ok", { headers: corsHeaders });
        }

        const waMessageId = message.id;
        const customerPhone = message.from;
        const customerName = value.contacts?.[0]?.profile?.name || "Cliente WhatsApp";
        const messageText = message.text.body;

        // Deduplicación
        const { data: existing } = await supabase.from("messages").select("id").eq("metadata->>wa_message_id", waMessageId).maybeSingle();
        if (existing) return new Response("ok", { headers: corsHeaders });

        if (m.ai_enabled === false) return new Response("ok", { headers: corsHeaders });

        // Obtener o crear cliente
        // IMPORTANTE: Usar merchantIdInternal (UUID) para las consultas y relaciones
        let { data: customer, error: findCustErr } = await supabase.from("customers")
            .select("*")
            .eq("merchant_id", merchantIdInternal)
            .eq("whatsapp_phone", customerPhone) // OJO: Asegurarse de tener la columna correcta, a veces es 'phone'
            .maybeSingle();

        if (!customer) {
            // Crear cliente si no existe
            const { data: nc, error: createCustErr } = await supabase.from("customers").insert({
                merchant_id: merchantIdInternal, // USAR UUID
                full_name: customerName,
                phone: customerPhone, // Estandarizar a 'phone' si es lo que usa la tabla
                whatsapp_phone: customerPhone // Mantener ambos por si acaso el esquema varía
            }).select().single();

            if (createCustErr) {
                console.error("[Fatal] Error creating customer:", createCustErr);
                throw createCustErr;
            }
            customer = nc;
        }

        if (!customer) throw new Error("Failed to resolve customer");

        // Obtener o crear conversación
        let { data: conversation, error: findConvErr } = await supabase.from("conversations")
            .select("*")
            .eq("merchant_id", merchantIdInternal)
            .eq("customer_id", customer.id)
            .eq("status", "active")
            .maybeSingle();

        if (!conversation) {
            const { data: nconv, error: createConvErr } = await supabase.from("conversations").insert({
                merchant_id: merchantIdInternal,
                customer_id: customer.id,
                channel: "whatsapp",
                status: "active"
            }).select().single();

            if (createConvErr) {
                console.error("[Fatal] Error creating conversation:", createConvErr);
                throw createConvErr;
            }
            conversation = nconv;
        }

        if (!conversation) throw new Error("Failed to resolve conversation");

        // Guardar mensaje del cliente
        const { error: msgErr } = await supabase.from("messages").insert({
            conversation_id: conversation.id,
            sender_type: "customer",
            content: messageText,
            metadata: { wa_message_id: waMessageId }
        });

        if (msgErr) console.error("[Error] Failed to save message:", msgErr);

        // Lógica de IA...
        const { data: products } = await supabase.from("products").select("name, price, is_available, category:categories(name)").eq("merchant_id", merchantIdInternal).eq("is_available", true).limit(40);
        let menu = "";
        if (products?.length) {
            const groups: any = {};
            products.forEach((p: any) => {
                const catName = p.category?.name || "Otros";
                if (!groups[catName]) groups[catName] = [];
                groups[catName].push(`• ${p.name} $${p.price}`);
            });
            menu = Object.entries(groups).map(([cat, items]: [any, any]) => `*${cat}*\n${items.join('\n')}`).join('\n\n');
        }

        // 2. Obtener historial
        const { data: history } = await supabase.from("messages").select("sender_type, content").eq("conversation_id", conversation!.id).order("created_at", { ascending: false }).limit(10);
        const chatMessages: any[] = [];
        if (history) {
            [...history].reverse().forEach(msg => {
                chatMessages.push({
                    role: msg.sender_type === "customer" ? "user" : "model",
                    parts: [{ text: msg.content }]
                });
            });
        }
        if (chatMessages.length > 0 && chatMessages[0].role === "model") chatMessages.shift();

        // 3. Prompt de Sistema (Unificado con Telegram)
        const systemPrompt = `Eres el asistente de ${m.name}. Personalidad: ${m.ai_personality || 'profesional'}.

Reglas:
- Usa precios exactos del catálogo
- Haz sumas paso a paso
- Usa **negrita** en nombres de productos

Catálogo:
${menu}

Protocolo de Cierre (ESTRICTO):
1. **Ticket**: Muestra el total y pregunta si es correcto.
2. **Datos**: Pide Nombre, Dirección completa y Teléfono. (Obligatorios los 3).
3. **Validación**: Repite los datos al cliente y pregunta "¿Esta información de envío es correcta?".
4. **Finalizar**: SOLO tras el "Sí" del cliente, genera: [ORDER_CONFIRMED: {"customer_name":"...","address":"...","phone":"...","total":0}]`;

        chatMessages.push({ role: "user", parts: [{ text: messageText }] });

        // 4. Llamar a la IA (Gemini o OpenAI) - Lógica Robusta
        let aiResponse = "";

        // VERIFICAR API KEY
        if (!m.ai_api_key) {
            console.error("[AI Error] Missing AI API Key for merchant:", merchantIdInternal);
            return new Response("ok", { headers: corsHeaders });
        }

        try {
            const modelName = m.ai_model || 'gemini-1.5-flash';
            console.log("[DEBUG] AI Model:", modelName);

            // Detección Estricta de Proveedor
            const isOpenAI = modelName.toLowerCase().startsWith('gpt-') || modelName.toLowerCase().startsWith('o1-') || modelName.toLowerCase().startsWith('o3-');

            if (isOpenAI) {
                // OpenAI API logic
                const openaiMessages = [
                    { role: "system", content: systemPrompt },
                    ...chatMessages.map(msg => ({
                        role: msg.role === "model" ? "assistant" : msg.role,
                        content: msg.parts[0].text
                    }))
                ];

                const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${m.ai_api_key}`
                    },
                    body: JSON.stringify({
                        model: modelName,
                        messages: openaiMessages,
                        temperature: 0.7,
                        max_tokens: 1024
                    })
                });

                if (!openaiRes.ok) throw new Error(`OpenAI error: ${openaiRes.status}`);
                const openaiData = await openaiRes.json();
                aiResponse = openaiData.choices?.[0]?.message?.content || "Lo siento, no pude procesar tu mensaje.";

            } else {
                // Google AI Studio (Gemini / Gemma)
                const cleanModelName = modelName.includes('/') ? modelName.split('/').pop() : modelName;

                // Intentar primero con system_instruction
                let geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${cleanModelName}:generateContent?key=${m.ai_api_key}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        system_instruction: { parts: [{ text: systemPrompt }] },
                        contents: chatMessages,
                        generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
                    })
                });

                if (!geminiRes.ok) {
                    console.log("[DEBUG] Fallback: Merging system prompt due to API error (maybe model doesn't support system_instruction)...");

                    // Fallback: Fusionar system prompt en el primer mensaje
                    const blendedContents = JSON.parse(JSON.stringify(chatMessages));
                    if (blendedContents.length > 0 && blendedContents[0].role === "user") {
                        blendedContents[0].parts[0].text = systemPrompt + "\n\n" + blendedContents[0].parts[0].text;
                    } else {
                        blendedContents.unshift({ role: "user", parts: [{ text: systemPrompt }] });
                    }

                    geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${cleanModelName}:generateContent?key=${m.ai_api_key}`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            contents: blendedContents,
                            generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
                        })
                    });
                }

                if (!geminiRes.ok) {
                    const errText = await geminiRes.text();
                    console.error("[GEMINI FINAL ERROR]", geminiRes.status, errText);
                    throw new Error(`Gemini error: ${geminiRes.status} - ${errText}`);
                }

                const geminiData = await geminiRes.json();
                aiResponse = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "Lo siento, no pude procesar tu mensaje.";
            }

        } catch (e: any) {
            console.error("[AI Exception]", e);
            aiResponse = "Lo siento, estoy teniendo problemas técnicos con mi cerebro digital. (" + e.message + ")";
        }

        // Procesar Pedidos
        if (aiResponse.includes("[ORDER_CONFIRMED:")) {
            // ... (Lógica de pedidos existente)
            const orderMatch = aiResponse.match(/\[ORDER_CONFIRMED:\s*({.*?})\]/s);
            if (orderMatch) {
                try {
                    const info = JSON.parse(orderMatch[1]);
                    aiResponse = aiResponse.replace(/\[ORDER_CONFIRMED:.*?\]/s, "").trim();

                    const { data: order, error: orderErr } = await supabase.from("orders").insert({
                        merchant_id: merchantIdInternal,
                        customer_id: customer.id,
                        conversation_id: conversation.id,
                        total: Number(info.total) || 0,
                        delivery_address: info.address || 'WhatsApp Address',
                        status: 'pending',
                        channel: 'whatsapp'
                    }).select('id').single();

                    if (orderErr) console.error("Error creating order:", orderErr);
                    if (order) aiResponse += `\n\n✅ *Pedido #${order.id.split('-')[0].toUpperCase()} registrado.*`;
                } catch (e) {
                    console.error("Error parsing order JSON:", e);
                }
            }
        }

        const cleanResponse = sanitizeMarkdown(aiResponse);

        // 5. Enviar a WhatsApp
        if (!m.whatsapp_phone_number_id || !m.whatsapp_token) {
            console.error("[WhatsApp Error] Missing Phone ID or Token for merchant:", merchantIdInternal);
            return new Response("ok", { headers: corsHeaders });
        }

        const waUrl = `https://graph.facebook.com/v22.0/${m.whatsapp_phone_number_id}/messages`;
        const waRes = await fetch(waUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${m.whatsapp_token}`
            },
            body: JSON.stringify({
                messaging_product: "whatsapp",
                to: customerPhone,
                text: { body: cleanResponse }
            })
        });

        const waData = await waRes.json();
        if (!waRes.ok) {
            console.error("[WhatsApp Send Error]", waRes.status, JSON.stringify(waData));
        } else {
            // Guardar mensaje del bot
            await supabase.from("messages").insert({
                conversation_id: conversation.id,
                sender_type: "ai",
                content: cleanResponse
            });
            await supabase.from("conversations").update({
                last_message: cleanResponse,
                last_message_at: new Date().toISOString()
            }).eq("id", conversation!.id);
        }
        return new Response("ok", { headers: corsHeaders });

    } catch (error: any) {
        console.error(`[FATAL ERROR]`, error.message);
        return new Response("ok", { headers: corsHeaders });
    }
});
