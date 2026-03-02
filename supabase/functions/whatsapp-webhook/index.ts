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

    // Limpiar etiquetas de carrito y restos de JSON que a veces la IA escupe por error
    sanitized = sanitized.replace(/\[UPDATE_CART:.*?\]/gi, "");
    sanitized = sanitized.replace(/^\s*[}\]]+\s*$/gm, "");

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

        // Actualizar conversación (último mensaje y contador de no leídos)
        await supabase.from("conversations").update({
            last_message: messageText,
            last_message_at: new Date().toISOString(),
            unread_count: (conversation.unread_count || 0) + 1
        }).eq("id", conversation.id);

        // VERIFICAR ESTADO DE IA (GLOBAL O POR CONVERSACIÓN)
        const isGlobalDisabled = m.ai_enabled === false || String(m.ai_enabled) === 'false';
        const isConvDisabled = conversation.ai_active === false || String(conversation.ai_active) === 'false';

        if (isGlobalDisabled || isConvDisabled) {
            console.log(`[Webhook] IA Silenciada para ${conversation.id} (Global disabled: ${isGlobalDisabled}, Conv disabled: ${isConvDisabled})`);
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
                const waUrl = `https://graph.facebook.com/v22.0/${m.whatsapp_phone_number_id}/messages`;

                // Enviar mensaje de fuera de horario a WhatsApp
                await fetch(waUrl, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${m.whatsapp_token}`
                    },
                    body: JSON.stringify({
                        messaging_product: "whatsapp",
                        to: customerPhone,
                        text: { body: sanitizeMarkdown(scheduleMessage) }
                    })
                });

                // Guardar el mensaje en la base de datos
                await supabase.from("messages").insert({
                    conversation_id: conversation.id,
                    sender_type: "ai",
                    content: scheduleMessage,
                    metadata: { type: 'out_of_schedule' }
                });

                console.log(`[Webhook WA] Fuera de horario para ${conversation.id}. Enviando mensaje alternativo.`);
                return new Response("ok", { headers: corsHeaders });
            }
        }

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

        // Obtener categorías únicas (para referencia local si el RPC falla)
        const categoriesList = [...new Set(products?.map((p: any) => p.category?.name || "Otros"))].join(", ");

        // 3. === PROMPT CENTRALIZADO (Single Source of Truth) ===
        const { data: compiledPrompt } = await supabase.rpc('get_compiled_prompt', { p_merchant_id: merchantIdInternal });

        // 🔴 REFUERZO OBLIGATORIO: Recordatorio técnico de comandos para todos los LLMs
        const reinforcement = `🚨 INSTRUCCIÓN TÉCNICA CRÍTICA (MÁXIMA PRIORIDAD):
Cuando el cliente CONFIRME sus datos (diga "Si", "Correcto", "Ok", etc.) o te proporcione Nombre/Dirección/Teléfono, DEBES incluir en ese mismo mensaje el siguiente comando JSON exacto:

[ORDER_CONFIRMED: {"customer_name": "NOMBRE", "address": "DIRECCIÓN", "phone": "TELÉFONO", "total": TOTAL_NUMERO, "items": [{"name": "PRODUCTO", "price": PRECIO, "qty": CANTIDAD}]}]

REGLAS DE ORO:
1. El comando va dentro del mensaje de texto, nunca solo.
2. "total" es solo el número.
3. SIEMPRE incluye los "items" con nombre, precio y qty.
4. NUNCA uses "..." como valor.`;

        const systemPrompt = reinforcement + "\n\n" + (compiledPrompt || `Eres el asistente virtual de ${m.name}. Ayuda al cliente a realizar su pedido de forma natural. Categorías disponibles: ${categoriesList}.`) + "\n\n" + reinforcement;

        chatMessages.push({ role: "user", parts: [{ text: messageText }] });

        // 4. Llamar a la IA (Gemini o OpenAI) - Lógica Robusta
        let aiResponse = "";

        // VERIFICAR API KEY (Excepto para Ollama/LMStudio que pueden ser locales)
        const isOllama = m.ai_provider === 'ollama';
        const isLMStudio = m.ai_provider === 'lmstudio';
        if (!m.ai_api_key && !isOllama && !isLMStudio) {
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
                        temperature: 0.5,
                        max_tokens: 2048
                    })
                });

                if (!openaiRes.ok) throw new Error(`OpenAI error: ${openaiRes.status}`);
                const openaiData = await openaiRes.json();
                aiResponse = openaiData.choices?.[0]?.message?.content || "Lo siento, no pude procesar tu mensaje.";

            } else if (isOllama) {
                // Ollama API logic
                const ollamaUrl = m.ollama_base_url || 'http://localhost:11434';
                console.log("[DEBUG] Using Ollama API at:", ollamaUrl);

                const ollamaRes = await fetch(`${m.ollama_base_url || 'http://localhost:11434'}/api/chat`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "ngrok-skip-browser-warning": "true",
                        "Authorization": m.ai_api_key ? `Bearer ${m.ai_api_key}` : ""
                    },
                    body: JSON.stringify({
                        model: modelName,
                        messages: [
                            { role: "system", content: systemPrompt },
                            ...chatMessages.map(msg => ({
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
                        "ngrok-skip-browser-warning": "true",
                        "Authorization": m.ai_api_key ? `Bearer ${m.ai_api_key}` : ""
                    },
                    body: JSON.stringify({
                        model: modelName,
                        messages: [
                            { role: "system", content: systemPrompt },
                            ...chatMessages.map(msg => ({
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
                // Google AI Studio (Gemini / Gemma)
                let cleanModelName = modelName?.includes('/') ? modelName.split('/').pop() : (modelName || 'gemini-1.5-flash');

                // Corrección de typos comunes (ej: gemini-2.5-flash)
                if (cleanModelName === 'gemini-2.5-flash' || cleanModelName === 'gemini-2.1-flash') {
                    cleanModelName = 'gemini-1.5-flash';
                }

                // Intentar primero con system_instruction
                let geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${cleanModelName}:generateContent?key=${m.ai_api_key}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        system_instruction: { parts: [{ text: systemPrompt }] },
                        contents: chatMessages,
                        generationConfig: { temperature: 0.3, maxOutputTokens: 2048 }
                    })
                });

                if (!geminiRes.ok) {
                    const errText = await geminiRes.text();
                    if (geminiRes.status === 429) {
                        throw new Error("QUOTA_EXCEEDED: Se ha agotado la cuota de tu IA Gemini. Verifica tu plan en Google AI Studio.");
                    }
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
                            generationConfig: { temperature: 0.3, maxOutputTokens: 2048 }
                        })
                    });
                }

                if (!geminiRes.ok) {
                    const errText = await geminiRes.text();
                    if (geminiRes.status === 429) {
                        throw new Error("QUOTA_EXCEEDED: Se ha agotado la cuota de tu IA Gemini. Verifica tu plan en Google AI Studio.");
                    }
                    console.error("[GEMINI FINAL ERROR]", geminiRes.status, errText);
                    throw new Error(`Gemini error: ${geminiRes.status} - ${errText}`);
                }

                const geminiData = await geminiRes.json();
                aiResponse = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "Lo siento, no pude procesar tu mensaje.";
            }

        } catch (e: any) {
            console.error("[AI Exception]", e);

            if (e.message.startsWith("QUOTA_EXCEEDED")) {
                aiResponse = "Oops! 😅 Mi cuota diaria de energía se ha agotado. Por favor, avisa al administrador para que verifique el plan de IA o intenta de nuevo más tarde. 🔋✨";
            } else {
                aiResponse = "Lo siento, mis circuitos están un poco cansados en este momento y tengo problemas técnicos. 🤖✨ Por favor, intenta de nuevo en un ratito o espera a que uno de nuestros asesores te atienda.";
            }

            if (conversation?.id) {
                try {
                    await supabase.from("messages").insert({
                        conversation_id: conversation.id,
                        sender_type: "ai",
                        content: `🔧 *Error Técnico Interno (No visible para el cliente):*\n\n${e.message}`
                    });
                } catch (dbErr) {
                    console.error("Error saving crash log to DB:", dbErr);
                }
            }
        }

        // Procesar Pedidos
        const orderMatch = aiResponse.match(/\[ORDER_CONFIRMED:\s*(\{[\s\S]*\})\s*\]/);
        if (orderMatch) {
            try {
                const info = JSON.parse(orderMatch[1].trim());
                aiResponse = aiResponse.replace(/\[ORDER_CONFIRMED:\s*\{[\s\S]*\}\s*\]/, "").trim();

                // 1. Actualizar datos del cliente
                const customerUpdates: any = {};
                if (info.customer_name) customerUpdates.full_name = info.customer_name;
                if (info.phone) customerUpdates.phone = info.phone;

                if (Object.keys(customerUpdates).length > 0) {
                    await supabase.from("customers").update(customerUpdates).eq("id", customer.id);
                }

                // 2. Crear la orden
                const { data: order, error: orderErr } = await supabase.from("orders").insert({
                    merchant_id: merchantIdInternal,
                    customer_id: customer.id,
                    conversation_id: conversation.id,
                    total: Number(info.total) || 0,
                    delivery_address: info.address || 'WhatsApp Address',
                    status: 'pending',
                    channel: 'whatsapp',
                    closing_agent_type: 'ai'
                }).select('id, order_number').single();

                if (!orderErr && order) {
                    aiResponse += `\n\n🚀 *¡Pedido registrado!*\n🆔 *Orden #${order.order_number}*`;

                    // 3. Insertar Detalle
                    if (info.items && Array.isArray(info.items)) {
                        const { data: products } = await supabase.from("products").select("id, name").eq("merchant_id", merchantIdInternal);

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
                } else if (orderErr) {
                    console.error("Error creating order:", orderErr);
                }
            } catch (e) {
                console.error("Error parsing order JSON:", e);
                aiResponse = aiResponse.replace(/\[ORDER_CONFIRMED:\s*\{[\s\S]*\}\s*\]/, "").trim();
            }
        }

        // Limpiar etiqueta residual por seguridad si hubo formato erróneo
        aiResponse = aiResponse.replace(/\[ORDER_CONFIRMED[^\]]*\]/g, "").trim();
        aiResponse = aiResponse.replace(/^\s*[}\]]+\s*$/gm, "").trim();

        // 🛡️ GUARDIA: fallback si la IA solo envió el comando técnico y nada más
        if (!aiResponse || aiResponse.length < 5) {
            aiResponse = "✅ ¡Listo! Tu pedido ha sido registrado con éxito. En breve nuestro equipo lo preparará. ¡Gracias! 🍔👑";
        }

        const cleanResponse = sanitizeMarkdown(aiResponse);

        // No enviar mensajes vacíos
        if (!cleanResponse.trim()) return new Response("ok", { headers: corsHeaders });

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
