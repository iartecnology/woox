
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HELPERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function resolveVariables(text: string, variables: any, flowName?: string): string {
    if (!text) return '';

    // Resolver {{cartSummary}}
    if (text.includes('{{cartSummary}}')) {
        const cart = variables['cart'] || [];
        if (cart.length === 0) {
            text = text.replace(/{{cartSummary}}/g, '_El carrito está vacío_');
        } else {
            const summary = cart.map((it: any) => `- ${it.name} x${it.qty} ($${it.price * it.qty})`).join('\n');
            const total = cart.reduce((acc: number, it: any) => acc + (Number(it.price) * it.qty), 0);
            text = text.replace(/{{cartSummary}}/g, `${summary}\n\n💰 *Total: $${total}*`);
        }
    }

    return text.replace(/{{(.*?)}}/g, (match: string, key: string) => {
        const k = key.trim();
        if (k.toLowerCase() === 'merchantname') return flowName || 'Comercio';
        const varKey = Object.keys(variables).find(v => v.toLowerCase() === k.toLowerCase());
        if (varKey && variables[varKey] !== undefined && variables[varKey] !== null) {
            return String(variables[varKey]);
        }
        return match;
    });
}

function evaluateCondition(operator: string, varValue: string, targetValue: string): boolean {
    const a = (varValue || '').toLowerCase().trim();
    const b = (targetValue || '').toLowerCase().trim();
    switch (operator) {
        case '==': return a === b;
        case '!=': return a !== b;
        case 'contains': return a.includes(b);
        case '>': return Number(varValue) > Number(targetValue);
        case '<': return Number(varValue) < Number(targetValue);
        case 'exists': return varValue !== undefined && varValue !== null && varValue !== '';
        default: return false;
    }
}

async function createOrderSafe(supabase: any, orderData: any) {
    const fullData = { ...orderData, source: 'bot_flow', closing_agent_type: 'bot' };
    let { data, error } = await supabase.from('orders').insert(fullData).select('*').single();

    // Fallback si la DB tiene esquema antiguo
    if (error && (error.message.includes('column') || error.message.includes('cache'))) {
        console.log('[BOT-ENGINE] Fallback a esquema básico de orders...');
        const basicData = {
            merchant_id: orderData.merchant_id,
            customer_id: orderData.customer_id,
            total: orderData.total,
            delivery_address: orderData.delivery_address,
            status: orderData.status
        };
        const res = await supabase.from('orders').insert(basicData).select('*').single();
        data = res.data;
        error = res.error;
    }
    return { data, error };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// EXECUTOR DE ACCIONES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function executeAction(supabase: any, node: any, variables: any, merchantId: string, conversationId: string, customerId: string) {
    const actionType = node.data.actionType;
    console.log(`[BOT-ENGINE] Ejecutando acción: ${actionType}`);

    if (actionType === 'register_order') {
        const cart = variables['cart'] || [];
        const total = cart.reduce((acc: number, it: any) => acc + (Number(it.price) * it.qty), 0);

        const { data: order, error: orderErr } = await createOrderSafe(supabase, {
            merchant_id: merchantId,
            customer_id: customerId,
            total,
            delivery_address: variables['direccion_entrega'] || 'No proporcionada',
            status: 'pending',
            conversation_id: conversationId
        });

        if (!orderErr && order) {
            variables['orderNumber'] = `#${order.order_number || order.id.substring(0, 8)}`;
            variables['order_number'] = variables['orderNumber'];
            if (cart.length > 0) {
                const items = cart.map((it: any) => ({
                    order_id: order.id,
                    product_id: it.id,
                    product_name: it.name,
                    quantity: it.qty,
                    unit_price: it.price,
                    subtotal: it.price * it.qty
                }));
                await supabase.from('order_items').insert(items);
            }
        } else {
            console.error('[BOT-ENGINE] Error registrando pedido:', orderErr);
        }

    } else if (actionType === 'empty_cart') {
        variables['cart'] = [];
        variables['orderNumber'] = '';
        variables['order_number'] = '';

    } else if (actionType === 'transfer_human') {
        // Desactivar IA para que tome el control un agente humano
        await supabase.from('conversations').update({ ai_active: false }).eq('id', conversationId);
        variables['transferred_to_human'] = true;

    } else if (actionType === 'tag_customer') {
        // Etiquetar cliente si existe el parámetro tag
        const tagName = node.data.params?.tag;
        if (tagName && customerId) {
            const { data: tag } = await supabase
                .from('tags').select('id').eq('merchant_id', merchantId).eq('name', tagName).maybeSingle();
            if (tag) {
                // Buscar conversación para obtener conversation_tags
                await supabase.from('conversation_tags').upsert({ conversation_id: conversationId, tag_id: tag.id });
            }
        }

    } else if (actionType === 'add_to_cart') {
        // Agregar producto al carrito desde parámetros del nodo
        const productId = node.data.params?.product_id || variables['last_selected_product_id'];
        const qty = parseInt(variables['cantidad_actual'] || '1') || 1;
        if (productId) {
            const { data: product } = await supabase
                .from('products').select('id, name, price').eq('id', productId).single();
            if (product) {
                const cart = variables['cart'] || [];
                const existing = cart.find((i: any) => i.id === productId);
                if (existing) {
                    existing.qty += qty;
                } else {
                    cart.push({ id: product.id, name: product.name, price: product.price, qty });
                }
                variables['cart'] = cart;
            }
        }
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FUNCIÓN PRINCIPAL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export async function processBotFlow(supabase: any, merchantId: string, conversationId: string, messageText: string, customerId: string) {
    console.log(`[BOT-ENGINE] Procesando: "${messageText}" | conv: ${conversationId}`);

    // 1. Obtener flujo activo
    const { data: flow, error: flowErr } = await supabase.rpc('get_active_bot_flow', { p_merchant_id: merchantId });
    if (flowErr || !flow) {
        console.log("[BOT-ENGINE] No hay flujo activo para merchant:", merchantId);
        return null;
    }

    const nodes = flow.flow_data?.nodes || [];
    const connections = flow.flow_data?.connections || [];

    // 2. Obtener o crear sesión
    const startNode = nodes.find((n: any) => n.type === 'start');
    if (!startNode) return "Error: El flujo no tiene nodo de inicio.";

    const { data: session, error: sessionErr } = await supabase.rpc('get_or_create_bot_session', {
        p_conversation_id: conversationId,
        p_merchant_id: merchantId,
        p_flow_id: flow.id,
        p_start_node_id: startNode.id
    });
    if (sessionErr || !session) return "Error al gestionar la sesión del bot.";

    let currentNodeId: string | null = session.current_node_id;
    let variables: any = session.variables || {};
    let waitingFor: string | null = session.waiting_for;

    // 3. Procesar la respuesta del usuario según el estado anterior
    if (waitingFor === 'menu_selection') {
        const currentNode = nodes.find((n: any) => n.id === currentNodeId);
        if (currentNode?.type === 'menu') {
            const options = currentNode.data.options || [];
            const choice = messageText.trim();
            const numIdx = parseInt(choice) - 1;
            const matchedOpt = (numIdx >= 0 && numIdx < options.length)
                ? options[numIdx]
                : options.find((o: any) => o.text.toLowerCase().includes(choice.toLowerCase()) || choice.toLowerCase().includes(o.text.toLowerCase()));

            if (matchedOpt) {
                // Guardar en carrito si es un producto
                if (matchedOpt.id?.startsWith('prod_')) {
                    const [valId, valPrice] = String(matchedOpt.value || '').split('|');
                    variables['last_selected_product_id'] = valId || matchedOpt.value;
                    variables['last_selected_product_name'] = matchedOpt.text.split(' ($')[0];
                    
                    if (valPrice) {
                        variables['last_selected_product_price'] = parseFloat(valPrice);
                    } else {
                        const pMatch = matchedOpt.text.match(/\$?\s*([\d.]+)/);
                        const priceStr = pMatch ? pMatch[1] : '0';
                        const parts = priceStr.split('.');
                        if (parts.length > 2 || (parts.length === 2 && parts[1].length !== 2)) {
                            variables['last_selected_product_price'] = parseFloat(priceStr.replace(/\./g, ''));
                        } else {
                            variables['last_selected_product_price'] = parseFloat(priceStr);
                        }
                    }
                }
                const conn = connections.find((c: any) => c.from === currentNodeId && c.fromPort === matchedOpt.id);
                if (conn) { currentNodeId = conn.to; waitingFor = null; }
                else return "Lo siento, esa opción no tiene una acción configurada.";
            } else {
                return "Opción no reconocida. Por favor elige una de las opciones del menú numeradas.";
            }
        }
    } else if (waitingFor === 'input') {
        const currentNode = nodes.find((n: any) => n.id === currentNodeId);
        if (currentNode?.type === 'question') {
            const varName = currentNode.data.variable || 'last_input';
            variables[varName] = messageText.trim();

            // Lógica especial para carrito
            if (varName === 'cantidad_actual' && variables['last_selected_product_id']) {
                const qty = parseInt(messageText) || 1;
                const pid = variables['last_selected_product_id'];
                const pname = variables['last_selected_product_name'] || 'Producto';
                const pprice = variables['last_selected_product_price'] || 0;
                const cart = variables['cart'] || [];
                const existing = cart.find((i: any) => i.id === pid);
                if (existing) { existing.qty += qty; } 
                else { cart.push({ id: pid, name: pname, price: pprice, qty }); }
                variables['cart'] = cart;
            }

            const conn = connections.find((c: any) => c.from === currentNodeId && c.fromPort === 'output');
            if (conn) { currentNodeId = conn.to; waitingFor = null; }
        }
    } else if (waitingFor === 'condition') {
        // Estado especial — no aplica para condiciones (se resuelven automáticamente)
        waitingFor = null;
    }

    // 4. Recorrer el flujo hasta pausar o terminar
    const messagesToReturn: string[] = [];
    let loopCount = 0;
    const MAX_LOOPS = 15;

    while (currentNodeId && loopCount < MAX_LOOPS) {
        loopCount++;
        const node = nodes.find((n: any) => n.id === currentNodeId);
        if (!node) break;

        // ── ACCIÓN ──────────────────────────────────
        if (node.type === 'action') {
            await executeAction(supabase, node, variables, merchantId, conversationId, customerId);
        }

        // ── AGENTE IA (CON FUNCTION CALLING) ──────
        if (node.type === 'ai_agent') {
            const systemPrompt = node.data.prompt || "Eres un asistente útil.";
            const userTemplate = node.data.user_prompt || "{{message}}";
            const model = node.data.model || "gemini-1.5-flash";
            const temp = node.data.temperature || 0.7;
            const memoryLimit = node.data.memory_limit || 4;

            // 1. Obtener API Key
            const { data: merchant } = await supabase.from('merchants').select('ai_api_key, ai_provider').eq('id', merchantId).single();
            const { data: platform } = await supabase.from('platform_settings').select('ai_api_key').eq('id', 'global').maybeSingle();
            const apiKey = merchant?.ai_api_key || platform?.ai_api_key;
            
            if (!apiKey) {
                messagesToReturn.push("⚠️ Configuración de IA faltante (API Key).");
            } else {
                try {
                    // 2. Buscar herramientas conectadas (AI Skills)
                    const skillConns = connections.filter((c: any) => c.to === node.id);
                    const skills = skillConns.map((c: any) => nodes.find((n: any) => n.id === c.from)).filter((n: any) => n?.type === 'ai_skill');
                    
                    const tools: any[] = [];
                    const toolMapping: Record<string, string> = {};

                    if (skills.length > 0) {
                        const functionDeclarations = skills.map((s: any) => {
                            // Sanitizar nombre: solo alfanuméricos y guiones
                            const rawName = s.data.actionType || "tool";
                            const cleanName = rawName.replace(/[^a-zA-Z0-9_-]/g, '_');
                            toolMapping[cleanName] = rawName; // Guardar original para ejecutar

                            const desc = s.data.message || `Herramienta para ${rawName}`;
                            return {
                                name: cleanName,
                                description: desc,
                                parameters: {
                                    type: "object",
                                    properties: {
                                        query: { type: "string", description: "Búsqueda o parámetro relacionado" }
                                    }
                                }
                            };
                        });
                        tools.push({ function_declarations: functionDeclarations });
                    }

                    // 3. Recuperar Historial
                    let history: any[] = [];
                    if (memoryLimit > 0) {
                        const { data: hist } = await supabase.from("messages")
                            .select("sender_type, content")
                            .eq("conversation_id", conversationId)
                            .order("created_at", { ascending: false })
                            .limit(memoryLimit);
                        if (hist) history = hist.reverse();
                    }

                    const formattedHistory = history.map((m: any) => ({
                        role: m.sender_type === 'customer' ? 'user' : 'model',
                        parts: [{ text: m.content }]
                    }));

                    // 4. Llamada a Gemini con Tools
                    const finalUserMessage = userTemplate.replace('{{message}}', messageText);
                    const contents = [
                        ...formattedHistory,
                        { role: 'user', parts: [{ text: finalUserMessage }] }
                    ];

                    console.log(`[AI-AGENT] Call Gemini ${model} with ${tools.length > 0 ? tools[0].function_declarations.length : 0} tools.`);
                    
                    const aiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            system_instruction: { parts: [{ text: systemPrompt }] },
                            contents,
                            tools: tools.length > 0 ? tools : undefined,
                            generationConfig: { temperature: temp }
                        })
                    });

                    if (!aiRes.ok) {
                        const errBody = await aiRes.text();
                        console.error(`[AI-AGENT] Gemini API Error: ${aiRes.status}`, errBody);
                        messagesToReturn.push("⚠️ Lo siento, tuve un problema conectando con mi cerebro de IA.");
                    } else {
                        let aiData = await aiRes.json();
                        let response = aiData.candidates?.[0]?.content;
                        
                        // 5. Manejar Tool Calls (Si existen)
                        if (response?.parts?.[0]?.functionCall) {
                            const call = response.parts[0].functionCall;
                            const originalAction = toolMapping[call.name] || call.name;
                            console.log(`[AI-AGENT] Tool Call detectada: ${call.name} (Original: ${originalAction})`);
                            
                            let toolResult = "No hay información disponible.";
                            
                            // Ejecutar Skill Lógica Real
                            if (originalAction === 'catalog_search' || originalAction === 'Búsqueda Catálogo') {
                                const { data: prods } = await supabase.from('products').select('name, price, stock').ilike('name', `%${call.args.query || ''}%`).limit(3);
                                toolResult = prods?.length ? `Resultados: ${prods.map((p: any) => `${p.name} ($${p.price})`).join(', ')}` : "No encontré productos específicos con ese nombre.";
                            } else if (originalAction === 'inventory_check' || originalAction === 'Consultar Stock') {
                                const { data: prod } = await supabase.from('products').select('name, stock').ilike('name', `%${call.args.query || ''}%`).order('stock', {ascending: false}).limit(1).maybeSingle();
                                toolResult = prod ? `El stock de ${prod.name} es ${prod.stock} unidades.` : "No tengo información detallada del stock de ese producto.";
                            } else if (originalAction === 'knowledge_base') {
                                toolResult = `Sobre '${call.args.query}': Realizamos envíos a todo el país. Aceptamos tarjetas y transferencias. El horario es de 8am a 6pm.`;
                            } else if (originalAction === 'shopping_cart' || originalAction === 'Gestionar Carrito') {
                                const cart = variables['cart'] || [];
                                if (cart.length === 0) toolResult = "El carrito está actualmente vacío.";
                                else {
                                    const summary = cart.map((it: any) => `- ${it.name} x${it.qty}`).join('\n');
                                    const total = cart.reduce((acc: number, it: any) => acc + (it.price * it.qty), 0);
                                    toolResult = `El cliente tiene esto en su carrito:\n${summary}\nTotal: $${total}`;
                                }
                            }

                            // Segunda llamada para integrar el resultado (IMPORTANTE: role: 'function')
                            const secondRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    system_instruction: { parts: [{ text: systemPrompt }] },
                                    contents: [
                                        ...contents,
                                        response,
                                        {
                                            role: 'function',
                                            parts: [{
                                                functionResponse: {
                                                    name: call.name,
                                                    response: { content: toolResult }
                                                }
                                            }]
                                        }
                                    ]
                                })
                            });
                            const secondData = await secondRes.json();
                            const finalMsg = secondData.candidates?.[0]?.content?.parts?.[0]?.text || "Lo siento, tuve un problema procesando la herramienta.";
                            messagesToReturn.push(finalMsg);
                        } else {
                            messagesToReturn.push(response?.parts?.[0]?.text || "No pude generar una respuesta clara en este momento.");
                        }
                    }
                } catch (err) {
                    console.error("[AI-AGENT-ENGINE] Error Critico:", err);
                    messagesToReturn.push("Error conectando con el motor de IA.");
                }
            }
        }

        // ── CONDICIÓN (Si/No) ────────────────────────
        if (node.type === 'condition') {
            const varName = node.data.variable || '';
            const operator = node.data.operator || '==';
            const targetVal = node.data.value || '';
            const actualVal = variables[varName] ?? '';
            const result = evaluateCondition(operator, String(actualVal), targetVal);

            // Puerto 'yes' o 'no'
            const port = result ? 'yes' : 'no';
            const conn = connections.find((c: any) => c.from === currentNodeId && c.fromPort === port);
            if (conn) { currentNodeId = conn.to; }
            else { break; }
            continue; // No agregar mensaje, solo redirigir
        }

        // ── MENSAJE ──────────────────────────────────
        if (node.data.message) {
            let msg = resolveVariables(node.data.message, variables, flow.name);
            if (node.type === 'menu' && node.data.options) {
                const optsText = node.data.options.map((o: any, i: number) => `${i + 1}. ${o.text}`).join('\n');
                msg += `\n\n${optsText}`;
            }
            messagesToReturn.push(msg);
        }

        // ── PAUSAR O SEGUIR ──────────────────────────
        if (node.type === 'question') {
            waitingFor = 'input'; break;
        } else if (node.type === 'menu') {
            waitingFor = 'menu_selection'; break;
        } else if (node.type === 'end') {
            waitingFor = null; currentNodeId = null; break;
        }

        const conn = connections.find((c: any) => c.from === currentNodeId && c.fromPort === 'output');
        currentNodeId = conn ? conn.to : null;
        if (!currentNodeId) break;
    }

    // 5. Guardar estado de la sesión
    await supabase.from('bot_flow_sessions').update({
        current_node_id: currentNodeId || session.current_node_id,
        variables,
        waiting_for: waitingFor,
        updated_at: new Date().toISOString(),
        status: currentNodeId === null ? 'completed' : 'active'
    }).eq('id', session.id);

    return messagesToReturn.join('\n\n') || null;
}
