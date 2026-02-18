import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

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
    sanitized = sanitized.replace(/\[ORDER_CONFIRMED:.*?\]/gi, "");

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

        await supabase.from("conversations").update({
            last_message: messageText,
            last_message_at: new Date().toISOString(),
            unread_count: (conversation!.unread_count || 0) + 1
        }).eq("id", conversation!.id);

        // Obtener catálogo más detallado
        const { data: products } = await supabase.from("products").select("name, price, is_available, category:categories(name)").eq("merchant_id", merchantId).eq("is_available", true).limit(40);

        let menu = "";
        if (products && products.length > 0) {
            const groups: any = {};
            products.forEach((p: any) => {
                const catName = p.category?.name || "Otros";
                if (!groups[catName]) groups[catName] = [];
                groups[catName].push(`• ${p.name} $${p.price}`);
            });
            menu = Object.entries(groups)
                .map(([cat, items]: [string, any]) => `*${cat}*\n${items.join('\n')}`)
                .join('\n\n');
        }

        // Obtener historial
        const { data: history } = await supabase.from("messages").select("sender_type, content").eq("conversation_id", conversation!.id).order("created_at", { ascending: false }).limit(10);

        // Construir historial para Gemini
        const messages: any[] = [];
        if (history) {
            [...history].reverse().forEach(msg => {
                messages.push({
                    role: msg.sender_type === "customer" ? "user" : "model",
                    parts: [{ text: msg.content }]
                });
            });
        }

        // Asegurar que empiece con user
        if (messages.length > 0 && messages[0].role === "model") {
            messages.shift();
        }

        // Obtener categorías únicas para el saludo
        const categoriesList = [...new Set(products?.map((p: any) => p.category?.name || "Otros"))].join(", ");

        // Prompt de Sistema (Natural y Dinámico)
        const systemPrompt = `Eres el asistente virtual de ${m.name}. 
Personalidad: ${m.ai_personality || 'amable, servicial y eficiente'}.

INSTRUCCIONES DE IDENTIDAD:
${m.ai_system_prompt || 'Tu objetivo es ayudar al cliente a realizar un pedido de forma fluida.'}

RESTRICCIONES:
${m.ai_restrictions || 'No inventes productos que no estén en el catálogo.'}

REGLAS DE INTERACCIÓN:
1. **Flujo Natural**: NO uses etiquetas como "Ticket:", "Datos:" o "Validación:". Habla de forma humana y cercana.
2. **Saludo**: En el primer mensaje, saluda, menciona brevemente las categorías (${categoriesList}) y pregunta qué desea el cliente.
3. **Catálogo**: Muestra el menú completo SOLO si el cliente lo solicita:
${menu}
4. **Cálculos**: Realiza los cálculos de forma precisa. Usa **negrita** para resaltar productos.

PROTOCOLO DE CIERRE (PASO A PASO):
- PASO A: Presenta un resumen del pedido con el total y pregunta si es correcto.
- PASO B: Una vez confirmado el pedido, solicita Nombre, Dirección y Teléfono (de forma natural).
- PASO C: Repite los datos al cliente para una confirmación final.
- PASO D: Tras el "Sí" final, genera el código: [ORDER_CONFIRMED: {"customer_name":"...","address":"...","phone":"...","total":0}] e indica al cliente que su pedido ha sido registrado con éxito.`;

        // Agregar el mensaje actual
        messages.push({
            role: "user",
            parts: [{ text: messageText }]
        });

        // VERIFICAR ESTADO DE IA (GLOBAL O POR CONVERSACIÓN)
        const isGlobalDisabled = m.ai_enabled === false || String(m.ai_enabled) === 'false';
        const isConvDisabled = conversation!.ai_active === false || String(conversation!.ai_active) === 'false';

        if (isGlobalDisabled || isConvDisabled) {
            console.log(`[Webhook] IA Silenciada para ${conversation!.id} (Global disabled: ${isGlobalDisabled}, Conv disabled: ${isConvDisabled})`);
            return new Response("ok", { headers: corsHeaders });
        }

        // Llamar a la IA (Gemini o OpenAI)
        let aiResponse = "";
        try {
            const modelName = m.ai_model || 'gemini-1.5-flash';
            console.log("[DEBUG] AI Model:", modelName);
            console.log("[DEBUG] Calling AI with", messages.length, "messages");

            // Detección Estricta de Proveedor
            const isOpenAI = modelName.toLowerCase().startsWith('gpt-') || modelName.toLowerCase().startsWith('o1-') || modelName.toLowerCase().startsWith('o3-');

            if (isOpenAI) {
                // OpenAI API
                const openaiMessages = [
                    { role: "system", content: systemPrompt },
                    ...messages.map(msg => ({
                        role: msg.role === "model" ? "assistant" : msg.role,
                        content: msg.parts[0].text
                    }))
                ];

                console.log("[DEBUG] Using OpenAI API");
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

                if (!openaiRes.ok) {
                    const errorText = await openaiRes.text();
                    console.error("[OPENAI ERROR]", openaiRes.status, errorText);
                    throw new Error(`OpenAI error: ${openaiRes.status}`);
                }

                const openaiData = await openaiRes.json();
                aiResponse = openaiData.choices?.[0]?.message?.content || "Lo siento, no pude procesar tu mensaje.";
            } else {
                // Google AI Studio (Gemini / Gemma)
                console.log("[DEBUG] Using Google AI Studio API");
                const cleanModelName = modelName.includes('/') ? modelName.split('/').pop() : modelName;

                // Asegurar alternancia y empezar con USER
                const finalContents: any[] = [];
                for (const msg of messages) {
                    if (finalContents.length > 0 && finalContents[finalContents.length - 1].role === msg.role) {
                        finalContents[finalContents.length - 1].parts[0].text += "\n" + msg.parts[0].text;
                    } else {
                        finalContents.push(msg);
                    }
                }
                if (finalContents.length > 0 && finalContents[0].role === "model") finalContents.shift();

                // Proactividad: Modelos que NO soportan system_instruction (evitar error 400 y reintento lento)
                const supportsSysInstr = !cleanModelName.toLowerCase().includes('gemma-3');

                let geminiRes;
                if (supportsSysInstr) {
                    geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${cleanModelName}:generateContent?key=${m.ai_api_key}`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            system_instruction: {
                                parts: [{ text: systemPrompt }]
                            },
                            contents: finalContents,
                            generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
                        })
                    });
                } else {
                    console.log("[DEBUG] Skipping system_instruction for Gemma-3");
                    geminiRes = { ok: false, status: 400 } as any;
                }

                if (!geminiRes.ok) {
                    // Fallback: Si system_instruction falla, intentar mandarlo mezclado con el primer mensaje USER
                    console.log("[DEBUG] Fallback: Merging system prompt with first message...");
                    const blendedContents = JSON.parse(JSON.stringify(finalContents));
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
                    const errorText = await (geminiRes as any).text ? await (geminiRes as any).text() : "Unknown error";
                    console.error("[GEMINI FINAL ERROR]", geminiRes.status, errorText);
                    throw new Error(`Gemini error: ${geminiRes.status}`);
                }

                const geminiData = await geminiRes.json();
                aiResponse = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "Lo siento, no pude procesar tu mensaje.";
            }

            console.log("[DEBUG] AI response success, length:", aiResponse.length);
        } catch (err: any) {
            console.error("[AI GLOBAL ERROR]:", err.message);
            aiResponse = "Disculpa, hay un problema con el modelo de IA seleccionado (" + (m.ai_model || 'Gemma/Gemini') + "). Por favor verifica tu API Key o intenta con el modelo 'gemini-1.5-flash'.";
        }

        // Procesar ORDER_CONFIRMED (regex flexible con espacios opcionales)
        let orderConfirmationText = "";
        const orderMatch = aiResponse.match(/\[ORDER_CONFIRMED:\s*({.*?})\]/s);

        if (orderMatch) {
            try {
                const jsonContent = orderMatch[1].trim();
                const info = JSON.parse(jsonContent);
                // Limpiar el tag de la respuesta final
                aiResponse = aiResponse.replace(/\[ORDER_CONFIRMED:.*?\]/s, "").trim();

                const customerUpdates: any = {};
                if (info.customer_name) customerUpdates.full_name = info.customer_name;
                if (info.phone) customerUpdates.phone = info.phone;

                if (Object.keys(customerUpdates).length > 0) {
                    await supabase.from("customers").update(customerUpdates).eq("id", customer!.id);
                }

                const { data: order } = await supabase.from("orders").insert({
                    merchant_id: merchantId,
                    customer_id: customer!.id,
                    conversation_id: conversation!.id,
                    total: Number(info.total) || 0,
                    delivery_address: info.address,
                    status: 'pending',
                    closing_agent_type: 'ai'
                }).select('id').single();

                if (order) {
                    orderConfirmationText = `\n\n🚀 *¡Pedido registrado!*\n🆔 *Orden #${order.id.split('-')[0].toUpperCase()}*`;
                }
            } catch (e) {
                console.error("Order JSON Error", e);
            }
        }

        // Limpiar y enviar
        const cleanResponse = sanitizeMarkdown(aiResponse);
        const finalMessage = cleanResponse + orderConfirmationText;

        console.log("[DEBUG] Sending to Telegram...");
        const tgRes = await fetch(`https://api.telegram.org/bot${m.telegram_bot_token}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chat_id: chatId,
                text: finalMessage,
                parse_mode: "Markdown"
            })
        });

        const tgData = await tgRes.json();
        if (!tgRes.ok) {
            console.error("[TELEGRAM ERROR]", tgRes.status, tgData);
            // Intentar reenvío sin Markdown como último recurso
            if (tgData.description?.includes("can't parse entities")) {
                console.log("[DEBUG] Retrying Telegram without Markdown...");
                await fetch(`https://api.telegram.org/bot${m.telegram_bot_token}/sendMessage`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ chat_id: chatId, text: finalMessage })
                });
            }
        } else {
            console.log("[DEBUG] Telegram response OK");
        }

        await supabase.from("messages").insert({
            conversation_id: conversation!.id,
            sender_type: "ai",
            content: finalMessage
        });

        await supabase.from("conversations").update({
            last_message: finalMessage,
            last_message_at: new Date().toISOString()
        }).eq("id", conversation!.id);

        return new Response("ok", { headers: corsHeaders });

    } catch (error: any) {
        console.error(`[FATAL ERROR]`, error.message);
        return new Response("ok", { headers: corsHeaders });
    }
});
