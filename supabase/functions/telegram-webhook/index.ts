import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function sanitizeMarkdown(text: string): string {
    let sanitized = text;
    // Borrar bloques técnicos conocidos
    sanitized = sanitized.replace(/\(INTERNO:.*?\)/gi, "");
    sanitized = sanitized.replace(/\(DESCRIPCION REAL:.*?\)/gi, "");
    sanitized = sanitized.replace(/\[DISPONIBLE\]/gi, "");
    sanitized = sanitized.replace(/\[AGOTADO\]/gi, "");
    sanitized = sanitized.replace(/\[CHECK_AVAILABILITY:.*?\]/gi, "");
    sanitized = sanitized.replace(/\[CREATE_BOOKING:.*?\]/gi, "");

    // Limpiar comandos internos de la IA (con regex GREEDY para manejar JSON anidado)
    sanitized = sanitized.replace(/\[ORDER_CONFIRMED:\s*\{[\s\S]*\}\s*\]/g, "");
    sanitized = sanitized.replace(/\[UPDATE[_ ]CART:\s*\{[\s\S]*?\}\s*\]/g, "");
    // Eliminar cualquier }] residual que pueda quedar
    sanitized = sanitized.replace(/^\s*[}\]]+\s*$/gm, "");

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

        // Enviar acción 'typing' inmediatamente para mejorar la percepción de velocidad
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

        // Todas las operaciones restantes en paralelo (guardar mensaje + leer datos)
        const [
            _savedMsg,
            _updatedConv,
            { data: products },
            { data: categories },
            { data: history },
            { data: compiledPrompt },
            { data: resources }
        ] = await Promise.all([
            supabase.from("messages").insert({
                conversation_id: conversation!.id,
                sender_type: "customer",
                content: messageText,
                metadata: { telegram_message_id: messageId }
            }),
            supabase.from("conversations").update({
                last_message: messageText,
                last_message_at: new Date().toISOString(),
                unread_count: (conversation!.unread_count || 0) + 1
            }).eq("id", conversation!.id),
            supabase.from("products").select("id, name, price, category_id").eq("merchant_id", merchantId).eq("is_available", true).limit(50),
            supabase.from("categories").select("id, name").eq("merchant_id", merchantId),
            supabase.from("messages").select("sender_type, content").eq("conversation_id", conversation!.id).order("created_at", { ascending: false }).limit(10),
            supabase.rpc('get_compiled_prompt', { p_merchant_id: merchantId }),
            supabase.from("reservable_resources").select("*").eq("merchant_id", merchantId).eq("is_active", true)
        ]);

        // Construir menú local (para ORDER_CONFIRMED item matching)
        let menu = "";
        if (products && products.length > 0) {
            const groups: any = {};
            products.forEach((p: any) => {
                const cat = categories?.find((c: any) => c.id === p.category_id);
                const catName = cat?.name || "Otros";
                if (!groups[catName]) groups[catName] = [];
                groups[catName].push(`• ${p.name} $${p.price}`);
            });
            menu = Object.entries(groups)
                .map(([cat, items]: [string, any]) => `*${cat}*\n${items.join('\n')}`)
                .join('\n\n');
        }

        // Construir historial para el modelo
        const messages: any[] = [];
        if (history) {
            [...history].reverse().forEach(msg => {
                messages.push({
                    role: msg.sender_type === "customer" ? "user" : "model",
                    parts: [{ text: msg.content }]
                });
            });
        }
        if (messages.length > 0 && messages[0].role === "model") messages.shift();

        // System prompt desde la DB (fuente única)
        const systemPrompt = compiledPrompt || `Eres el asistente de ${m.name}. Ayuda al cliente con su pedido.`;



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

        // --- NUEVA LÓGICA DE HORARIOS (Scheduling) ---
        if (m.ai_schedule_enabled) {
            const now = new Date();
            const formatter = new Intl.DateTimeFormat('en-US', {
                timeZone: 'America/Bogota',
                hour: 'numeric',
                minute: 'numeric',
                hour12: false
            });
            const parts = formatter.formatToParts(now);
            const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
            const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0');
            const currentTimeMinutes = hour * 60 + minute;

            const [startH, startM] = (m.ai_schedule_start || '09:00').split(':').map(Number);
            const [endH, endM] = (m.ai_schedule_end || '18:00').split(':').map(Number);
            const startTimeMinutes = startH * 60 + startM;
            const endTimeMinutes = endH * 60 + endM;

            let isWithinSchedule = false;
            if (startTimeMinutes <= endTimeMinutes) {
                isWithinSchedule = currentTimeMinutes >= startTimeMinutes && currentTimeMinutes <= endTimeMinutes;
            } else {
                // Caso horario nocturno (ej: 22:00 a 06:00)
                isWithinSchedule = currentTimeMinutes >= startTimeMinutes || currentTimeMinutes <= endTimeMinutes;
            }

            if (!isWithinSchedule) {
                const scheduleMessage = m.ai_schedule_message || "Lo siento, en este momento no estamos disponibles. Por favor, escríbenos más tarde.";

                // Enviar mensaje de fuera de horario
                await fetch(`https://api.telegram.org/bot${m.telegram_bot_token}/sendMessage`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        chat_id: chatId,
                        text: sanitizeMarkdown(scheduleMessage),
                        parse_mode: "Markdown"
                    })
                });

                // Guardar el mensaje en la base de datos
                await supabase.from("messages").insert({
                    conversation_id: conversation!.id,
                    sender_type: "ai",
                    content: scheduleMessage,
                    metadata: { type: 'out_of_schedule' }
                });

                console.log(`[Webhook] Fuera de horario para ${conversation!.id}. Enviando mensaje alternativo.`);
                return new Response("ok", { headers: corsHeaders });
            }
        }

        // VERIFICAR API KEY (Excepto para Ollama/LMStudio que pueden ser locales)
        const isOllama = m.ai_provider === 'ollama';
        const isLMStudio = m.ai_provider === 'lmstudio';
        if (!m.ai_api_key && !isOllama && !isLMStudio) {
            console.error("[AI Error] Missing AI API Key for merchant:", merchantId);
            return new Response("ok", { headers: corsHeaders });
        }

        // Llamar a la IA (Gemini o OpenAI o Ollama)
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

            } else if (isOllama) {
                // Ollama API
                const ollamaUrl = m.ollama_base_url || 'http://localhost:11434';
                console.log("[DEBUG] Using Ollama API at:", ollamaUrl);

                const ollamaRes = await fetch(`${ollamaUrl}/api/chat`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "ngrok-skip-browser-warning": "true"
                    },
                    body: JSON.stringify({
                        model: modelName,
                        messages: [
                            { role: "system", content: systemPrompt },
                            ...messages.map(msg => ({
                                role: msg.role === "model" ? "assistant" : "user",
                                content: msg.parts[0].text
                            }))
                        ],
                        stream: false
                    })
                });

                if (!ollamaRes.ok) throw new Error(`Ollama error: ${ollamaRes.status}`);
                const ollamaData = await ollamaRes.json();
                aiResponse = ollamaData.message?.content || "Lo siento, no pude procesar tu mensaje.";

            } else if (isLMStudio) {
                // LM Studio API (OpenAI Compatible)
                const lmUrl = m.lmstudio_base_url || 'http://localhost:1234/v1';
                console.log("[DEBUG] Using LM Studio API at:", lmUrl);

                const lmRes = await fetch(`${lmUrl}/chat/completions`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "ngrok-skip-browser-warning": "true"
                    },
                    body: JSON.stringify({
                        model: modelName,
                        messages: [
                            { role: "system", content: systemPrompt },
                            ...messages.map(msg => ({
                                role: msg.role === "model" ? "assistant" : "user",
                                content: msg.parts[0].text
                            }))
                        ],
                        temperature: 0.5,
                        max_tokens: 2048
                    })
                });

                if (!lmRes.ok) throw new Error(`LM Studio error: ${lmRes.status}`);
                const lmData = await lmRes.json();
                aiResponse = lmData.choices?.[0]?.message?.content || "Lo siento, no pude procesar tu mensaje.";

            } else {
                const cleanModelName = modelName.includes('/') ? modelName.split('/').pop() : modelName;
                const isGemmaModel = cleanModelName!.toLowerCase().startsWith('gemma');

                // Asegurar alternancia de roles
                const finalContents: any[] = [];
                for (const msg of messages) {
                    if (finalContents.length > 0 && finalContents[finalContents.length - 1].role === msg.role) {
                        finalContents[finalContents.length - 1].parts[0].text += "\n" + msg.parts[0].text;
                    } else {
                        finalContents.push(msg);
                    }
                }
                if (finalContents.length > 0 && finalContents[0].role === "model") finalContents.shift();

                let geminiRes;

                if (!isGemmaModel) {
                    // Gemini (y otros modelos Google): soporta system_instruction
                    geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${cleanModelName}:generateContent?key=${m.ai_api_key}`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            system_instruction: { parts: [{ text: systemPrompt }] },
                            contents: finalContents,
                            generationConfig: { temperature: 0.3, maxOutputTokens: 2048 }
                        })
                    });
                } else {
                    // Gemma: NO soporta system_instruction → inyectamos el prompt en el primer mensaje
                    console.log("[DEBUG] Gemma model detected — injecting system prompt into first message");
                    const gemmaContents = JSON.parse(JSON.stringify(finalContents));
                    if (gemmaContents.length > 0) {
                        gemmaContents[0].parts[0].text = `${systemPrompt}\n\n---\n\n${gemmaContents[0].parts[0].text}`;
                    } else {
                        gemmaContents.push({ role: "user", parts: [{ text: systemPrompt }] });
                    }
                    geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${cleanModelName}:generateContent?key=${m.ai_api_key}`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            contents: gemmaContents,
                            generationConfig: { temperature: 0.3, maxOutputTokens: 1024 }
                        })
                    });
                }

                if (!geminiRes || !geminiRes.ok) {
                    const errorText = await geminiRes?.text() || "Unknown error";
                    console.error("[GEMINI ERROR]", geminiRes?.status, errorText);
                    throw new Error(`Gemini error: ${geminiRes?.status} - ${errorText}`);
                }


                const geminiData = await geminiRes.json();
                aiResponse = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "Lo siento, no pude procesar tu mensaje.";
            }
            console.log("[DEBUG] AI response success, length:", aiResponse.length);
        } catch (err: any) {
            console.error("[AI GLOBAL ERROR]:", err.message);
            aiResponse = "Disculpa, hay un problema con el modelo de IA seleccionado. Por favor verifica tu configuración.";
        }

        // === PROCESAR RESPUESTA DE IA ===

        // 1. Extraer ORDER_CONFIRMED ANTES de limpiar (regex GREEDY para manejar JSON anidado con items[])
        const orderMatch = aiResponse.match(/\[ORDER_CONFIRMED:\s*(\{[\s\S]*\})\s*\]/);
        let orderConfirmationText = "";

        if (orderMatch) {
            try {
                const info = JSON.parse(orderMatch[1].trim());
                // Remover el comando completo del texto visible (greedy para no dejar }])
                aiResponse = aiResponse.replace(/\[ORDER_CONFIRMED:\s*\{[\s\S]*\}\s*\]/, "").trim();

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

                    if (info.items && Array.isArray(info.items)) {
                        const itemsToInsert = info.items.map((it: any) => {
                            const matchedProduct = products?.find((p: any) => p.name.toLowerCase() === String(it.name).toLowerCase());
                            return {
                                order_id: order.id,
                                product_id: matchedProduct?.id || null,
                                product_name: String(it.name),
                                quantity: Number(it.qty || 1),
                                unit_price: Number(it.price || 0),
                                subtotal: Number((it.qty || 1) * (it.price || 0))
                            };
                        });
                        await supabase.from("order_items").insert(itemsToInsert);
                    }
                }
            } catch (e) {
                console.error("Order JSON Error", e);
            }
        }

        // 2. Procesar CHECK_AVAILABILITY
        const availabilityMatch = aiResponse.match(/\[CHECK_AVAILABILITY:\s*(\{[\s\S]*\})\s*\]/);
        if (availabilityMatch) {
            try {
                const info = JSON.parse(availabilityMatch[1].trim());
                const resourceId = info.resource_id;
                const startStr = info.start;
                const pax = Number(info.pax || 1);

                if (resourceId && startStr) {
                    const start = new Date(startStr);
                    // Calcular fin basado en la duración del recurso o default 60min
                    const resInfo = resources?.find((r: any) => r.id === resourceId);
                    const duration = resInfo?.duration_minutes || 60;
                    const end = new Date(start.getTime() + duration * 60000);

                    const { data: availResult, error: availError } = await supabase.rpc('check_availability', {
                        p_resource_id: resourceId,
                        p_start_datetime: start.toISOString(),
                        p_end_datetime: end.toISOString(),
                        p_requested_pax: pax
                    });

                    if (availError) throw availError;

                    const statusIcon = availResult.available ? "✅" : "❌";
                    const statusText = availResult.available ? "DISPONIBLE" : `NO DISPONIBLE (${availResult.reason})`;

                    // Inyectar el resultado en la respuesta para que el usuario lo vea
                    aiResponse = aiResponse.replace(/\[CHECK_AVAILABILITY:.*?\]/, `\n\n${statusIcon} *Consulta de disponibilidad:* ${statusText}`).trim();
                }
            } catch (e) {
                console.error("Availability Error", e);
                aiResponse = aiResponse.replace(/\[CHECK_AVAILABILITY:.*?\]/, "\n\n⚠️ Error técnico consultando disponibilidad.");
            }
        }

        // 3. Procesar CREATE_BOOKING
        const bookingMatch = aiResponse.match(/\[CREATE_BOOKING:\s*(\{[\s\S]*\})\s*\]/);
        if (bookingMatch) {
            try {
                const info = JSON.parse(bookingMatch[1].trim());
                const resourceId = info.resource_id;
                const startStr = info.start;
                const pax = Number(info.pax || 1);

                if (resourceId && startStr) {
                    const start = new Date(startStr);
                    const resInfo = resources?.find((r: any) => r.id === resourceId);
                    const duration = resInfo?.duration_minutes || 60;
                    const end = new Date(start.getTime() + duration * 60000);

                    // 1. Actualizar cliente si vienen datos
                    if (info.name || info.phone) {
                        const updates: any = {};
                        if (info.name) updates.full_name = info.name;
                        if (info.phone) updates.phone = info.phone;
                        await supabase.from("customers").update(updates).eq("id", customer!.id);
                    }

                    // 2. Crear reserva
                    const { data: booking, error: bError } = await supabase.from("bookings").insert({
                        merchant_id: merchantId,
                        customer_id: customer!.id,
                        conversation_id: conversation!.id,
                        resource_id: resourceId,
                        start_time: start.toISOString(),
                        end_time: end.toISOString(),
                        pax: pax,
                        status: 'confirmed',
                        channel: 'telegram'
                    }).select('id').single();

                    if (bError) throw bError;

                    aiResponse = aiResponse.replace(/\[CREATE_BOOKING:.*?\]/, "").trim();
                    orderConfirmationText += `\n\n📅 *¡Reserva Confirmada!*\n🆔 *ID: ${booking.id.split('-')[0].toUpperCase()}*\n📍 *Recurso:* ${resInfo?.name || 'Agendado'}\n⏰ *Inicio:* ${start.toLocaleString('es-CO')}`;
                }
            } catch (e) {
                console.error("Booking Creation Error", e);
                aiResponse = aiResponse.replace(/\[CREATE_BOOKING:.*?\]/, "\n\n⚠️ No pudimos procesar la reserva automáticamente.");
            }
        }

        // Enviar respuesta
        const finalMessage = sanitizeMarkdown(aiResponse) + orderConfirmationText;
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

        if (!tgRes.ok) {
            const tgData = await tgRes.json();
            if (tgData.description?.includes("can't parse entities")) {
                await fetch(`https://api.telegram.org/bot${m.telegram_bot_token}/sendMessage`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ chat_id: chatId, text: finalMessage })
                });
            }
        }

        // Guardar y actualizar
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
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
