import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// --- HELPERS ---
function sanitizeMarkdown(text: string): string {
    let sanitized = text;
    sanitized = sanitized.replace(/\(INTERNO:.*?\)/gi, "");
    sanitized = sanitized.replace(/\(DESCRIPCIÓN REAL:.*?\)/gi, "");
    sanitized = sanitized.replace(/\[DISPONIBLE\]/gi, "");
    sanitized = sanitized.replace(/\[AGOTADO\]/gi, "");

    // Limpiar etiquetas de carrito y restos de JSON que a veces la IA escupe por error
    sanitized = sanitized.replace(/\[UPDATE_CART:.*?\]/gi, "");
    sanitized = sanitized.replace(/^\s*[}\]]+\s*$/gm, "");

    return sanitized.trim();
}

async function getAIResponse(supabase: any, merchant: any, conversation: any, messageText: string, customerPhone: string) {
    console.log(`[AI] Procesando para: ${merchant.name} (${merchant.id})`);

    // 1. Validar configuración del comercio antes de intentar nada
    const provider = merchant.ai_provider;
    const modelName = merchant.ai_model;
    const apiKey = merchant.ai_api_key;

    const isLocalProvider = provider === 'ollama' || provider === 'lmstudio';
    if (!apiKey && !isLocalProvider) {
        console.warn(`[AI Warning] El comercio ${merchant.name} no tiene API Key configurada.`);
        return "⚠️ Configuración pendiente: Por favor, configura la API Key y el modelo de IA para este comercio en el panel de Woox.";
    }

    // 2. Catálogo básico para el prompt
    const { data: products } = await supabase.from("products")
        .select("name, price, is_available, category:categories(name)")
        .eq("merchant_id", merchant.id)
        .eq("is_available", true)
        .limit(40);

    const categoriesList = [...new Set(products?.map((p: any) => p.category?.name || "Otros"))].join(", ");

    // 3. Historial de conversación
    const { data: history } = await supabase.from("messages")
        .select("sender_type, content")
        .eq("conversation_id", conversation.id)
        .order("created_at", { ascending: false })
        .limit(10);

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

    // 4. Prompt Centralizado
    const { data: compiledPrompt } = await supabase.rpc('get_compiled_prompt', { p_merchant_id: merchant.id });

    // 🔴 REFUERZO OBLIGATORIO: Recordatorio técnico de comandos para todos los LLMs
    const reinforcement = `🚨 INSTRUCCIÓN TÉCNICA CRÍTICA (MÁXIMA PRIORIDAD):
Cuando el cliente CONFIRME sus datos (diga "Si", "Correcto", "Ok", etc.) o te proporcione Nombre/Dirección/Teléfono, DEBES incluir en ese mismo mensaje el siguiente comando JSON exacto:

[ORDER_CONFIRMED: {"customer_name": "NOMBRE", "address": "DIRECCIÓN", "phone": "TELÉFONO", "total": TOTAL_NUMERO, "items": [{"name": "PRODUCTO", "price": PRECIO, "qty": CANTIDAD}]}]

REGLAS DE ORO:
1. El comando va dentro del mensaje de texto, nunca solo.
2. "total" es solo el número.
3. SIEMPRE incluye los "items" con nombre, precio y qty.
4. NUNCA uses "..." como valor.`;

    const systemPrompt = reinforcement + "\n\n" + (compiledPrompt || `Eres el asistente virtual de ${merchant.name}. Ayuda al cliente de forma natural. Categorías: ${categoriesList}.`) + "\n\n" + reinforcement;

    chatMessages.push({ role: "user", parts: [{ text: messageText }] });

    // 5. Llamada a la IA (Solo con la Key del comercio)
    let aiResponse = "";
    try {
        if (provider === 'google_gemini') {
            // Limpiar el nombre del modelo y corregir posibles typos como 'gemini-2.5-flash'
            let cleanModelName = modelName?.includes('/') ? modelName.split('/').pop() : (modelName || 'gemini-1.5-flash');

            // Validación básica de modelos conocidos (fallback si viene algo como 'gemini-2.5-flash')
            const validModels = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash', 'gemini-2.0-flash-lite-preview', 'gemini-2.0-pro-exp-02-05'];
            if (!validModels.includes(cleanModelName) && !cleanModelName.includes('gemini-')) {
                cleanModelName = 'gemini-1.5-flash';
            } else if (cleanModelName === 'gemini-2.5-flash') {
                cleanModelName = 'gemini-1.5-flash'; // Corrección de typo común
            }

            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${cleanModelName}:generateContent?key=${apiKey}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    system_instruction: { parts: [{ text: systemPrompt }] },
                    contents: chatMessages,
                    generationConfig: { temperature: 0.3, maxOutputTokens: 2048 }
                })
            });

            if (!res.ok) {
                const errBody = await res.text();
                if (res.status === 429) {
                    throw new Error("QUOTA_EXCEEDED: Se ha agotado la cuota gratuita de tu IA Gemini. Por favor, verifica tu plan en Google AI Studio.");
                }
                throw new Error(`Gemini Error (${res.status}): ${errBody}`);
            }

            const data = await res.json();
            aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || "Sin respuesta de Gemini.";
        } else if (provider === 'openai') {
            const res = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: modelName || 'gpt-4o-mini',
                    messages: [
                        { role: "system", content: systemPrompt },
                        ...chatMessages.map(m => ({
                            role: m.role === "model" ? "assistant" : "user",
                            content: m.parts[0].text
                        }))
                    ]
                })
            });

            if (!res.ok) {
                const errBody = await res.text();
                throw new Error(`OpenAI Error (${res.status}): ${errBody}`);
            }

            const data = await res.json();
            aiResponse = data.choices?.[0]?.message?.content || "Sin respuesta de OpenAI.";
        } else if (provider === 'ollama') {
            const ollamaUrl = merchant.ollama_base_url || 'http://localhost:11434';
            const res = await fetch(`${ollamaUrl}/api/chat`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "ngrok-skip-browser-warning": "true",
                    "Authorization": apiKey ? `Bearer ${apiKey}` : ""
                },
                body: JSON.stringify({
                    model: modelName || 'llama3.2',
                    messages: [
                        { role: "system", content: systemPrompt },
                        ...chatMessages.map(m => ({
                            role: m.role === "model" ? "assistant" : "user",
                            content: m.parts[0].text
                        }))
                    ],
                    stream: false
                })
            });

            if (!res.ok) {
                const errBody = await res.text();
                throw new Error(`Ollama Error (${res.status}): ${errBody}`);
            }

            const data = await res.json();
            aiResponse = data.message?.content || "Sin respuesta de Ollama.";
        } else if (provider === 'lmstudio') {
            const lmUrl = merchant.lmstudio_base_url || 'http://localhost:1234/v1';
            const res = await fetch(`${lmUrl}/chat/completions`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "ngrok-skip-browser-warning": "true",
                    "Authorization": apiKey ? `Bearer ${apiKey}` : ""
                },
                body: JSON.stringify({
                    model: modelName,
                    messages: [
                        { role: "system", content: systemPrompt },
                        ...chatMessages.map(m => ({
                            role: m.role === "model" ? "assistant" : "user",
                            content: m.parts[0].text
                        }))
                    ],
                    temperature: 0.5,
                    max_tokens: 2048
                })
            });

            if (!res.ok) {
                const errBody = await res.text();
                throw new Error(`LM Studio Error (${res.status}): ${errBody}`);
            }

            const data = await res.json();
            aiResponse = data.choices?.[0]?.message?.content || "Sin respuesta de LM Studio.";
        }
    } catch (e: any) {
        console.error("[AI Error] Catch:", e.message);

        // 1. Mensaje bonito (cool) para el cliente
        if (e.message.startsWith("QUOTA_EXCEEDED")) {
            aiResponse = "Oops! 😅 Mi cuota diaria de energía se ha agotado. Por favor, avisa al administrador para que verifique el plan de IA o intenta de nuevo más tarde. 🔋✨";
        } else {
            aiResponse = "Lo siento, mis circuitos están un poco cansados en este momento y tengo problemas técnicos. 🤖✨ Por favor, intenta de nuevo en un ratito o espera a que uno de nuestros asesores te atienda.";
        }

        // 2. Guardar el error técnico silenciosamente para que el ADMIN lo vea en el visor
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

    return sanitizeMarkdown(aiResponse);
}

// --- MAIN SERVE ---
Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    try {
        const body = await req.json();
        const event = body.event;
        const instanceName = body.instance;

        console.log(`[Evolution] Evento: ${event}, Instancia: ${instanceName}`);

        if (event?.toLowerCase() !== "messages.upsert") {
            return new Response(JSON.stringify({ ok: true, status: "ignored_event" }), { headers: corsHeaders });
        }

        const data = body.data;
        if (!data || data.key?.fromMe) {
            return new Response(JSON.stringify({ ok: true, status: "self_message" }), { headers: corsHeaders });
        }

        const remoteJid = data.key.remoteJid;
        if (remoteJid?.includes('@g.us')) return new Response("ok", { headers: corsHeaders });

        const customerPhone = remoteJid.split('@')[0];
        const waMessageId = data.key.id;
        const customerName = data.pushName || "Cliente";

        let messageText = data.message?.conversation ||
            data.message?.extendedTextMessage?.text ||
            data.message?.imageMessage?.caption || "";

        if (!messageText) return new Response("ok", { headers: corsHeaders });

        const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

        // Resolver Comercio
        const { data: m } = await supabase.from("merchants")
            .select("*")
            .or(`merchant_code.eq.${instanceName},id.eq.${instanceName},slug.eq.${instanceName}`)
            .maybeSingle();

        let merchant = m;
        if (!merchant) {
            const { data: all } = await supabase.from("merchants").select("*");
            merchant = all?.find((x: any) =>
                (x.merchant_code || x.slug || x.id).replace(/[^a-zA-Z0-9]/g, '_') === instanceName
            );
        }

        if (!merchant) return new Response("Merchant Not Found", { status: 404 });

        // Deduplicación
        const { data: exist } = await supabase.from("messages").select("id").eq("metadata->>wa_message_id", waMessageId).maybeSingle();
        if (exist) return new Response("ok", { headers: corsHeaders });

        // Resolve Customer & Conversation
        let { data: customer } = await supabase.from("customers").select("id").eq("merchant_id", merchant.id).eq("whatsapp_phone", customerPhone).maybeSingle();
        if (!customer) {
            const { data: nc } = await supabase.from("customers").insert({
                merchant_id: merchant.id, full_name: customerName, phone: customerPhone, whatsapp_phone: customerPhone
            }).select().single();
            customer = nc;
        }

        // Buscar conversación activa (status 'active' u 'open')
        let { data: conversation } = await supabase.from("conversations").select("*")
            .eq("merchant_id", merchant.id).eq("customer_id", customer!.id)
            .in("status", ["active", "open"])
            .order("last_message_at", { ascending: false })
            .limit(1).maybeSingle();
        if (!conversation) {
            const { data: nconv } = await supabase.from("conversations").insert({
                merchant_id: merchant.id, customer_id: customer!.id, channel: "whatsapp", status: "active"
            }).select().single();
            conversation = nconv;
        }

        // Cargar platform settings ANTES de procesar la IA (falla temprano si falta config)
        const { data: platform } = await supabase.from("platform_settings").select("evolution_api_url, evolution_api_key").single();
        if (!platform?.evolution_api_url || !platform?.evolution_api_key) {
            console.error("[Evolution] CRITICAL: Faltan evolution_api_url o evolution_api_key en platform_settings");
            return new Response("ok", { headers: corsHeaders });
        }

        // Guardar mensaje entrante
        await supabase.from("messages").insert({
            conversation_id: conversation!.id, sender_type: "customer", content: messageText, metadata: { wa_message_id: waMessageId }
        });

        // 1. Verificar Intervención Humana (Regla Anti-Ban: No interrumpir a los agentes)
        const { data: lastHumanMsg } = await supabase.from("messages")
            .select("created_at")
            .eq("conversation_id", conversation!.id)
            .eq("sender_type", "user") // 'user' = humano del equipo
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

        // Si un humano escribió en los últimos 30 minutos, silenciar la IA para este cliente temporalmente
        let aiMutedDueToHuman = false;
        if (lastHumanMsg) {
            const lastHumanTime = new Date(lastHumanMsg.created_at).getTime();
            const nowTime = new Date().getTime();
            if ((nowTime - lastHumanTime) < 30 * 60 * 1000) { // 30 mins
                aiMutedDueToHuman = true;
                console.log(`[Anti-Ban] IA silenciada en conv ${conversation!.id}, un agente humano está actuando.`);
            }
        }

        // Respuesta IA (Sin fallback a plataforma)
        if (merchant.ai_enabled !== false && !aiMutedDueToHuman) {

            // A. Procesar y enviar respuesta en memoria PRIMERO
            let aiText = await getAIResponse(supabase, merchant, conversation, messageText, customerPhone);

            // 🚨 EXTRAER Y GUARDAR PEDIDO SI EXISTE
            const orderMatch = aiText.match(/\[ORDER_CONFIRMED:\s*(\{[\s\S]*\})\s*\]/);
            if (orderMatch) {
                try {
                    const info = JSON.parse(orderMatch[1].trim());
                    // Remover el comando completo del texto visible
                    aiText = aiText.replace(/\[ORDER_CONFIRMED:\s*\{[\s\S]*\}\s*\]/, "").trim();

                    // 1. Actualizar datos del cliente si vienen en el JSON
                    const customerUpdates: any = {};
                    if (info.customer_name) customerUpdates.full_name = info.customer_name;
                    if (info.phone) customerUpdates.phone = info.phone;

                    if (Object.keys(customerUpdates).length > 0) {
                        await supabase.from("customers").update(customerUpdates).eq("id", customer!.id);
                    }

                    // 2. Crear la orden
                    const { data: order, error: orderErr } = await supabase.from("orders").insert({
                        merchant_id: merchant.id,
                        customer_id: customer!.id,
                        conversation_id: conversation!.id,
                        total: Number(info.total) || 0,
                        delivery_address: info.address || 'WhatsApp Address',
                        status: 'pending',
                        closing_agent_type: 'ai'
                    }).select('id, order_number').single();

                    if (!orderErr && order) {
                        aiText += `\n\n🚀 *¡Pedido registrado!*\n🆔 *Orden #${order.order_number}*`;
                        console.log(`[Order Captured] Orden #${order.order_number} guardada.`);

                        // 3. Insertar Detalle de Productos
                        if (info.items && Array.isArray(info.items)) {
                            // Obtener productos para vincular IDs si es posible
                            const { data: products } = await supabase.from("products")
                                .select("id, name")
                                .eq("merchant_id", merchant.id);

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
                    } else {
                        console.error("[Order Error]", orderErr);
                    }
                } catch (e) {
                    console.error("[Order Parse Error]:", e);
                    aiText = aiText.replace(/\[ORDER_CONFIRMED:\s*\{[\s\S]*\}\s*\]/, "").trim();
                }
            }

            // Limpiar etiqueta residual por seguridad si hubo formato erróneo
            aiText = aiText.replace(/\[ORDER_CONFIRMED[^\]]*\]/g, "").trim();
            // Limpieza extrema de brackets residuales por fallos de la IA
            aiText = aiText.replace(/^\s*[}\]]+\s*$/gm, "").trim();

            // 🛡️ GUARDIA: Si la IA solo envió el comando y nada más, dar un mensaje de confirmación de fallback
            if (!aiText || aiText.length < 5) {
                aiText = "✅ ¡Listo! Tu pedido ha sido registrado con éxito. En breve uno de nuestros agentes lo estará preparando. ¡Gracias por elegir Burger King Pro! 🍔👑";
            }

            // B. Calcular un tiempo dinámico más ágil
            const charsCount = aiText.length;
            const typingPaceMs = 12; // Reducido a la mitad (antes 25)
            let calculatedDelayMs = Math.floor(charsCount * typingPaceMs);
            if (calculatedDelayMs < 750) calculatedDelayMs = 750; // Mínimo 0.75s
            if (calculatedDelayMs > 3750) calculatedDelayMs = 3750; // Máximo 3.75s

            // Indicador de escritura
            await fetch(`${platform.evolution_api_url}/chat/sendPresence/${instanceName}`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "apikey": platform.evolution_api_key },
                body: JSON.stringify({ number: customerPhone, presence: "composing", delay: calculatedDelayMs + 1500 })
            });

            // SIMULACIÓN HUMANA: Esperar
            await new Promise(resolve => setTimeout(resolve, calculatedDelayMs));

            const sendRes = await fetch(`${platform.evolution_api_url}/message/sendText/${instanceName}`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "apikey": platform.evolution_api_key },
                body: JSON.stringify({ number: customerPhone, text: aiText, linkPreview: true })
            });

            console.log(`[Evolution] Mensaje enviado. Status: ${sendRes.status}`);

            if (sendRes.ok && aiText.trim()) {
                await supabase.from("messages").insert({
                    conversation_id: conversation!.id, sender_type: "ai", content: aiText
                });
                await supabase.from("conversations").update({
                    last_message: aiText, last_message_at: new Date().toISOString(), unread_count: 0
                }).eq("id", conversation!.id);
            }
        }

        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });

    } catch (e: any) {
        console.error("Fatal Webhook Error:", e.message);
        return new Response("ok", { headers: corsHeaders });
    }
});
