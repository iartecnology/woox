import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { notifyMerchantAgents } from "./notifications.ts";

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
            const summary = cart.map((it: any) => {
                const notes = it.notes ? ` (${it.notes})` : '';
                return `- ${it.name} x${it.qty}${notes} ($${it.price * it.qty})`;
            }).join('\n');
            const total = cart.reduce((acc: number, it: any) => acc + (Number(it.price) * it.qty), 0);
            text = text.replace(/{{cartSummary}}/g, `${summary}\n\n💰 *Total: $${total}*`);
        }
    }

    return text.replace(/{{(.*?)}}/g, (match: string, key: string) => {
        const k = key.trim();
        if (k.toLowerCase() === 'merchantname') return variables['merchantName'] || flowName || 'Comercio';
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

    if (error && (error.message.includes('column') || error.message.includes('cache'))) {
        console.log('[BOT-ENGINE] Fallback a esquema básico de orders...');
        const basicData: any = {
            merchant_id: orderData.merchant_id,
            customer_id: orderData.customer_id,
            total: orderData.total,
            delivery_address: orderData.delivery_address,
            status: orderData.status
        };
        if (orderData.channel) basicData.channel = orderData.channel;
        const res = await supabase.from('orders').insert(basicData).select('*').single();
        data = res.data;
        error = res.error;
    }
    return { data, error };
}

async function callGemini(prompt: string, systemPrompt: string, merchantId: string, model: string = 'gemini-1.5-flash'): Promise<string> {
    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) return 'API KEY MISSING';

    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                system_instruction: { parts: [{ text: systemPrompt }] },
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.1, maxOutputTokens: 512 }
            })
        });
        const data = await res.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } catch (e) {
        console.error('[BOT-ENGINE] Error calling Gemini helper:', e);
        return '';
    }
}

async function searchKnowledgeDocuments(supabase: any, query: string, merchantId: string, docId?: string) {
    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) return [];

    try {
        // 1. Obtener embedding
        const embRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: { parts: [{ text: query }] } })
        });
        const embData = await embRes.json();
        const embedding = embData.embedding?.values;
        if (!embedding) return [];

        // 2. RPC match_knowledge_chunks (Standard en el esquema de Woox)
        const { data: chunks } = await supabase.rpc('match_knowledge_chunks', {
            query_embedding: embedding,
            match_threshold: 0.5,
            match_count: 5,
            p_merchant_id: merchantId,
            p_document_id: docId || null
        });

        return chunks || [];
    } catch (e) {
        console.error('[BOT-ENGINE] Error searching knowledge:', e);
        return [];
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// EXECUTOR DE ACCIONES (Nodos de Acción)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function executeAction(supabase: any, node: any, variables: any, merchantId: string, conversationId: string, customerId: string) {
    const actionType = node.data.actionType;
    console.log(`[BOT-ENGINE] Ejecutando acción: ${actionType}`);

    if (actionType === 'register_order') {
        const cart = variables['cart'] || [];
        const total = cart.reduce((acc: number, it: any) => acc + (Number(it.price) * it.qty), 0);
        
        // --- 1. ACTUALIZAR CLIENTE CON DATOS RECOLECTADOS DE VARIABLES ---
        const customerUpdate: any = {};
        if (variables['nombre_cliente'] || variables['nombre'] || variables['name']) {
            customerUpdate.full_name = variables['nombre_cliente'] || variables['nombre'] || variables['name'];
        }
        if (variables['telefono_cliente'] || variables['telefono'] || variables['phone']) {
            customerUpdate.phone = variables['telefono_cliente'] || variables['telefono'] || variables['phone'];
        }
        if (Object.keys(customerUpdate).length > 0 && customerId) {
            await supabase.from('customers').update(customerUpdate).eq('id', customerId);
        }

        // --- 2. EXTRAER CANAL AUTOMÁTICAMENTE ---
        const { data: conv } = await supabase.from('conversations').select('channel').eq('id', conversationId).single();
        let finalChannel = conv?.channel?.includes('whatsapp') ? 'whatsapp' : (conv?.channel || 'bot');
        if (finalChannel === 'whatsapp_evolution') finalChannel = 'whatsapp';

        const { data: order, error: orderErr } = await createOrderSafe(supabase, {
            merchant_id: merchantId, customer_id: customerId, total,
            delivery_address: variables['direccion_entrega'] || variables['direccion'] || 'No proporcionada',
            status: 'pending', conversation_id: conversationId, channel: finalChannel
        });

        if (!orderErr && order) {
            variables['orderNumber'] = `#${order.order_number || order.id.substring(0, 8)}`;
            variables['order_number'] = variables['orderNumber'];
            const currentCart = variables['cart'] || [];
            if (currentCart.length > 0) {
                const items = currentCart.map((it: any) => ({
                    order_id: order.id, product_id: it.id, product_name: it.name,
                    quantity: it.qty, unit_price: it.price, subtotal: it.price * it.qty
                }));
                await supabase.from('order_items').insert(items);
            }
            
            // --- 3. LIMPIAR EL CARRITO DE LA SESIÓN ---
            // Esto evita que enviar "hola" de nuevo duplique el mismo carrito
            variables['cart'] = [];
        } else {
            console.error('[BOT-ENGINE] Error registrando pedido:', orderErr);
        }

        // NOTIFICAR A LOS AGENTES SOBRE EL NUEVO PEDIDO
        await notifyMerchantAgents(supabase, merchantId, "¡Nuevo Pedido! 🛵", `Se ha registrado el pedido #${variables['order_number'] || 'N/A'}\nTotal: $${variables['order_total'] || '0'}`);
    } else if (actionType === 'empty_cart') {
        variables['cart'] = [];
        variables['orderNumber'] = '';
        variables['order_number'] = '';
    } else if (actionType === 'transfer_human') {
        await supabase.from('conversations').update({ ai_active: false }).eq('id', conversationId);
        variables['transferred_to_human'] = true;
    } else if (actionType === 'tag_customer') {
        const tagName = node.data.params?.tag;
        if (tagName && customerId) {
            const { data: tag } = await supabase.from('tags').select('id').eq('merchant_id', merchantId).eq('name', tagName).maybeSingle();
            if (tag) {
                await supabase.from('conversation_tags').upsert({ conversation_id: conversationId, tag_id: tag.id });
            }
        }
    } else if (actionType === 'add_to_cart') {
        const productId = node.data.params?.product_id || variables['last_selected_product_id'];
        const qty = parseInt(variables['cantidad_actual'] || '1') || 1;
        const notes = variables['last_product_notes_value'] || variables['last_product_notes'] || '';
        if (productId) {
            const { data: product } = await supabase.from('products').select('id, name, price').eq('id', productId).single();
            if (product) {
                const cart = variables['cart'] || [];
                const existing = cart.find((i: any) => i.id === productId);
                if (existing) {
                    existing.qty += qty;
                    // Añadir notas si las hay (concatenar si ya existían)
                    if (notes && notes.toLowerCase() !== 'no') {
                        existing.notes = existing.notes ? `${existing.notes}, ${notes}` : notes;
                    }
                } else {
                    const item: any = { id: product.id, name: product.name, price: product.price, qty };
                    if (notes && notes.toLowerCase() !== 'no') {
                        item.notes = notes;
                    }
                    cart.push(item);
                }
                variables['cart'] = cart;
                // Limpiar variables temporales
                variables['last_product_notes_value'] = '';
            }
        }
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// EXECUTOR DE TOOLS DEL AGENTE IA
// Cuando Gemini llama a una función, este método la ejecuta
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function executeAgentTool(
    supabase: any,
    toolName: string,
    toolArgs: any,
    variables: any,
    merchantId: string,
    conversationId: string,
    customerId: string
): Promise<string> {
    console.log(`[BOT-ENGINE] Ejecutando tool del agente: ${toolName}`, toolArgs);

    switch (toolName) {
        case 'catalog_search': {
            const queryRaw = (toolArgs?.query || '').toLowerCase().trim();
            const query = queryRaw.endsWith('s') ? queryRaw.slice(0, -1) : queryRaw; // Manejar plurales básicos
            
            // 1. Buscar categorías que coincidan (incluyendo subcategorías)
            const { data: cats } = await supabase.from('categories')
                .select('id, name, parent_id')
                .eq('merchant_id', merchantId)
                .ilike('name', `%${query}%`);
            
            let allCatIds = (cats || []).map((c: any) => c.id);
            
            // Si encontramos categorías, ver si alguna es padre para incluir sus hijos
            if (allCatIds.length > 0) {
                const { data: subCats } = await supabase.from('categories')
                    .select('id')
                    .in('parent_id', allCatIds);
                if (subCats && subCats.length > 0) {
                    allCatIds = [...allCatIds, ...subCats.map((sc: any) => sc.id)];
                }
            }

            // 2. Buscar productos (Por nombre, descripción o categoría/subcategoría)
            let q = supabase.from('products').select('name, price, description, stock').eq('merchant_id', merchantId).gt('stock', 0);
            
            if (allCatIds.length > 0) {
                q = q.or(`name.ilike.%${query}%,description.ilike.%${query}%,category_id.in.(${allCatIds.join(',')})`);
            } else {
                q = q.or(`name.ilike.%${query}%,description.ilike.%${query}%`);
            }

            const { data: prods } = await q.limit(10);

            if (!prods || prods.length === 0) {
                // Si no hay productos, ver si hay subcategorías para sugerir
                if (cats && cats.length > 0) {
                    const { data: listSub } = await supabase.from('categories').select('name').in('parent_id', cats.map((c: any) => c.id));
                    if (listSub && listSub.length > 0) {
                        return `En la categoría "${cats[0].name}" tenemos estas subcategorías:\n${listSub.map((s: any) => `• ${s.name}`).join('\n')}\n\n¿Cuál te interesa?`;
                    }
                }
                
                // Sugerencia genérica: si no hay nada, mostrar los primeros 3
                const { data: others } = await supabase.from('products').select('name, price').eq('merchant_id', merchantId).gt('stock', 0).limit(3);
                if (others && others.length > 0) {
                   return `No encontré productos exactos para "${queryRaw}", pero te sugiero estos destacados:\n${others.map((p: any) => `• ${p.name} - $${p.price}`).join('\n')}`;
                }
                return `No encontré productos que coincidan con "${queryRaw}". ¿Puedo intentar buscando otra cosa?`;
            }
            
            const results = prods.map((p: any) => `• ${p.name} - $${p.price}${p.description ? ` (${p.description.substring(0, 40)})` : ''}`).join('\n');
            return `He encontrado esto para ti:\n${results}${prods.length >= 10 ? '\n\n...y algunos más. ¿Buscas algo específico?' : ''}`;
        }

        case 'inventory_check': {
            const query = toolArgs?.query || '';
            const { data: prod } = await supabase
                .from('products')
                .select('name, stock, price')
                .eq('merchant_id', merchantId)
                .ilike('name', `%${query}%`)
                .order('stock', { ascending: false })
                .limit(1)
                .maybeSingle();
            if (!prod) return `No encontré información de stock para "${query}".`;
            return prod.stock > 0
                ? `✅ ${prod.name}: ${prod.stock} unidades disponibles a $${prod.price}`
                : `❌ ${prod.name}: Sin stock disponible actualmente.`;
        }

        case 'add_to_cart': {
            const productName = toolArgs?.product_name || toolArgs?.query || '';
            const quantity = parseInt(toolArgs?.quantity) || 1;
            const { data: prod } = await supabase
                .from('products')
                .select('id, name, price, stock')
                .eq('merchant_id', merchantId)
                .ilike('name', `%${productName}%`)
                .gt('stock', 0)
                .limit(1)
                .maybeSingle();
            if (!prod) return `No encontré el producto "${productName}" en nuestro catálogo o no hay stock disponible.`;
            const cart = variables['cart'] || [];
            const existing = cart.find((i: any) => i.id === prod.id);
            if (existing) { existing.qty += quantity; } else { cart.push({ id: prod.id, name: prod.name, price: prod.price, qty: quantity }); }
            variables['cart'] = cart;
            const total = cart.reduce((acc: number, it: any) => acc + (Number(it.price) * it.qty), 0);
            return `✅ ${prod.name} x${quantity} añadido al carrito. Total actual del carrito: $${total}`;
        }

        case 'get_cart': {
            const cart = variables['cart'] || [];
            if (cart.length === 0) return 'Tu carrito está vacío. ¿Te gustaría ver nuestro menú?';
            const total = cart.reduce((acc: number, it: any) => acc + (Number(it.price) * it.qty), 0);
            return `🛒 Tu carrito:\n${cart.map((it: any) => `• ${it.name} x${it.qty} = $${(it.price * it.qty).toFixed(2)}`).join('\n')}\n\n💰 Total: $${total.toFixed(2)}`;
        }

        case 'remove_from_cart': {
            const productName = toolArgs?.product_name || '';
            const cart = variables['cart'] || [];
            const before = cart.length;
            variables['cart'] = cart.filter((it: any) => !it.name.toLowerCase().includes(productName.toLowerCase()));
            if (variables['cart'].length < before) return `✅ "${productName}" eliminado del carrito.`;
            return `No encontré "${productName}" en tu carrito.`;
        }

        case 'register_order': {
            const cart = variables['cart'] || [];
            if (cart.length === 0) return 'Tu carrito está vacío. Primero añade productos para poder registrar el pedido.';
            const total = cart.reduce((acc: number, it: any) => acc + (Number(it.price) * it.qty), 0);
            const address = toolArgs?.address || variables['direccion_entrega'] || 'Por confirmar';
            const { data: order, error: orderErr } = await createOrderSafe(supabase, {
                merchant_id: merchantId, customer_id: customerId, total,
                delivery_address: address, status: 'pending', conversation_id: conversationId
            });
            if (!orderErr && order) {
                const orderNum = `#${order.order_number || order.id.substring(0, 8)}`;
                variables['orderNumber'] = orderNum;
                const items = cart.map((it: any) => ({
                    order_id: order.id, product_id: it.id, product_name: it.name,
                    quantity: it.qty, unit_price: it.price, subtotal: it.price * it.qty
                }));
                await supabase.from('order_items').insert(items);
                variables['cart'] = []; // Limpiar carrito tras registrar
                
                // NOTIFICAR SI EL PEDIDO SE CREÓ CORRECTAMENTE
                if (order) {
                   await notifyMerchantAgents(supabase, merchantId, "¡Nuevo Pedido (IA)! 🛵", `Se ha registrado el pedido #${orderNum}\nTotal: $${total.toFixed(2)}`);
                }

                return `🎉 ¡Pedido registrado exitosamente!\n📋 Número de pedido: ${orderNum}\n💰 Total: $${total.toFixed(2)}\n📍 Dirección: ${address}\n\nEn breve te contactaremos para confirmar la entrega.`;
            }
            return `Error al registrar el pedido. Por favor intenta de nuevo.`;
        }

        case 'order_status': {
            const orderRef = toolArgs?.order_id || toolArgs?.query || variables['orderNumber'] || '';
            const { data: ord } = await supabase
                .from('orders')
                .select('id, status, total, created_at, order_number')
                .eq('merchant_id', merchantId)
                .or(`id.ilike.%${orderRef}%,order_number.ilike.%${orderRef}%`)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            if (!ord) return `No encontré pedidos con la referencia "${orderRef}".`;
            const statusMap: any = { pending: 'Pendiente', confirmed: 'Confirmado', preparing: 'En preparación', delivered: 'Entregado', cancelled: 'Cancelado' };
            return `📦 Pedido #${ord.order_number || ord.id.substring(0, 8)}\nEstado: ${statusMap[ord.status] || ord.status}\nTotal: $${ord.total}`;
        }

        case 'get_available_slots': {
            const resourceId = toolArgs?.resource_id || variables['resource_id'];
            const date = toolArgs?.date || new Date().toISOString().split('T')[0];
            const pax = toolArgs?.pax || 1;
            
            if (!resourceId) return "Necesito saber qué recurso o servicio quieres consultar.";
            
            const { data, error } = await supabase.rpc('get_available_slots', {
                p_resource_id: resourceId,
                p_date: date,
                p_pax: pax
            });
            
            if (error) return `Error al consultar disponibilidad: ${error.message}`;
            if (!data || data.length === 0) return `No encontré horarios disponibles para el ${date}. ¿Deseas intentar con otra fecha?`;
            
            return `Horarios disponibles para el ${date}:\n${data.map((s: any) => `• ${s.slot_start.split('T')[1].substring(0, 5)}`).join('\n')}`;
        }

        case 'check_availability': {
            const resourceId = toolArgs?.resource_id || variables['resource_id'];
            const startStr = toolArgs?.start; // "YYYY-MM-DD HH:MM"
            const pax = toolArgs?.pax || 1;
            
            if (!resourceId || !startStr) return "Faltan datos para verificar disponibilidad (servicio o fecha/hora).";
            
            const start = new Date(startStr.replace(' ', 'T'));
            if (isNaN(start.getTime())) return "El formato de fecha/hora es inválido. Usa YYYY-MM-DD HH:MM.";

            const { data: resInfo } = await supabase.from('reservable_resources').select('duration_minutes').eq('id', resourceId).single();
            const duration = resInfo?.duration_minutes || 60;
            const end = new Date(start.getTime() + duration * 60000);
            
            const { data, error } = await supabase.rpc('check_resource_availability', {
                p_resource_id: resourceId,
                p_start_time: start.toISOString(),
                p_end_time: end.toISOString(),
                p_pax: pax
            });
            
            if (error) return `Error técnico: ${error.message}`;
            if (data.available) {
                variables['last_checked_start'] = start.toISOString();
                variables['last_checked_resource'] = resourceId;
                return `✅ ¡Sí! Hay disponibilidad para el ${startStr}. ¿Confirmamos tu reserva?`;
            } else {
                return `❌ Lo siento, no está disponible en ese horario: ${data.reason}`;
            }
        }

        case 'create_booking': {
            const resourceId = toolArgs?.resource_id || variables['last_checked_resource'] || variables['resource_id'];
            const startStr = toolArgs?.start || variables['last_checked_start'];
            const pax = toolArgs?.pax || 1;
            const name = toolArgs?.name || variables['customer_name'] || 'Cliente';
            
            if (!resourceId || !startStr) return "No tengo clara la fecha o el recurso para agendar. ¿Puedes confirmarlos?";
            
            const { data: resInfo } = await supabase.from('reservable_resources').select('duration_minutes, base_price').eq('id', resourceId).single();
            const duration = resInfo?.duration_minutes || 60;
            const start = new Date(startStr);
            const end = new Date(start.getTime() + duration * 60000);
            
            const { data: booking, error: bErr } = await supabase.from('bookings').insert({
                merchant_id: merchantId,
                customer_id: customerId,
                resource_id: resourceId,
                start_time: start.toISOString(),
                end_time: end.toISOString(),
                pax: pax,
                status: 'pending',
                channel: 'whatsapp',
                total_price: resInfo?.base_price || 0,
                conversation_id: conversationId
            }).select().single();
            
            if (bErr) return `Error al registrar la reserva: ${bErr.message}`;
            
            return `🎉 ¡Listo! Reserva agendada con éxito.\n📅 Fecha: ${new Date(startStr).toLocaleString()}\n👤 A nombre de: ${name}\n🔢 Personas: ${pax}\n\n¡Te esperamos!`;
        }

        case 'transfer_human': {
            await supabase.from('conversations').update({ ai_active: false }).eq('id', conversationId);
            variables['transferred_to_human'] = true;
            return `Perfecto, te conectaré con uno de nuestros asesores en breve. Por favor espera un momento.`;
        }

        default:
            return `No pude ejecutar la acción "${toolName}".`;
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DEFINICIONES DE TOOLS PARA GEMINI
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const TOOL_DEFINITIONS: Record<string, any> = {
    catalog_search: {
        name: 'catalog_search',
        description: 'Busca productos disponibles en el catálogo de la tienda. Úsala cuando el cliente pregunte qué hay disponible, qué vendemos, o busque un producto específico.',
        parameters: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Nombre o tipo de producto a buscar. Ej: "hamburguesa", "pizza", "bebida"' }
            },
            required: ['query']
        }
    },
    inventory_check: {
        name: 'inventory_check',
        description: 'Consulta si hay stock disponible de un producto específico.',
        parameters: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Nombre del producto a verificar' }
            },
            required: ['query']
        }
    },
    add_to_cart: {
        name: 'add_to_cart',
        description: 'Añade un producto al carrito del cliente. Úsala cuando el cliente elija un producto o indique que quiere comprarlo.',
        parameters: {
            type: 'object',
            properties: {
                product_name: { type: 'string', description: 'Nombre exacto del producto a añadir (buscado en el catálogo)' },
                quantity: { type: 'number', description: 'Cantidad a añadir. Por defecto 1.' }
            },
            required: ['product_name']
        }
    },
    get_cart: {
        name: 'get_cart',
        description: 'Muestra el contenido actual del carrito del cliente con precios y total. Úsala cuando el cliente quiera ver su pedido o pregunte por su carrito.',
        parameters: { type: 'object', properties: {} }
    },
    remove_from_cart: {
        name: 'remove_from_cart',
        description: 'Elimina un producto del carrito del cliente.',
        parameters: {
            type: 'object',
            properties: {
                product_name: { type: 'string', description: 'Nombre del producto a eliminar del carrito' }
            },
            required: ['product_name']
        }
    },
    register_order: {
        name: 'register_order',
        description: 'Registra y confirma el pedido del cliente en el sistema. USA ESTA FUNCIÓN SOLO cuando el cliente confirme explícitamente que desea hacer el pedido (diga "sí", "confirmar", "proceder", "realizar el pedido", etc.)',
        parameters: {
            type: 'object',
            properties: {
                address: { type: 'string', description: 'Dirección de entrega si el cliente la ha proporcionado' }
            }
        }
    },
    order_status: {
        name: 'order_status',
        description: 'Consulta el estado de un pedido previo del cliente.',
        parameters: {
            type: 'object',
            properties: {
                order_id: { type: 'string', description: 'Número o ID del pedido a consultar' }
            }
        }
    },
    transfer_human: {
        name: 'transfer_human',
        description: 'Transfiere la conversación a un agente humano. Úsala cuando el cliente lo solicite explícitamente o cuando no puedas resolver su consulta.',
        parameters: { type: 'object', properties: {} }
    },
    get_available_slots: {
        name: 'get_available_slots',
        description: 'Consulta los horarios disponibles para un recurso o servicio en una fecha específica.',
        parameters: {
            type: 'object',
            properties: {
                resource_id: { type: 'string', description: 'ID del recurso (UUID)' },
                date: { type: 'string', description: 'Fecha a consultar (YYYY-MM-DD)' },
                pax: { type: 'number', description: 'Número de personas' }
            },
            required: ['resource_id', 'date']
        }
    },
    check_availability: {
        name: 'check_availability',
        description: 'Verifica si un horario específico está disponible para reservar.',
        parameters: {
            type: 'object',
            properties: {
                resource_id: { type: 'string', description: 'ID del recurso (UUID)' },
                start: { type: 'string', description: 'Fecha y hora deseada (YYYY-MM-DD HH:MM)' },
                pax: { type: 'number', description: 'Número de personas' }
            },
            required: ['resource_id', 'start']
        }
    },
    create_booking: {
        name: 'create_booking',
        description: 'Crea y confirma una reserva en el sistema.',
        parameters: {
            type: 'object',
            properties: {
                resource_id: { type: 'string', description: 'ID del recurso (UUID)' },
                start: { type: 'string', description: 'Fecha y hora (YYYY-MM-DD HH:MM)' },
                pax: { type: 'number', description: 'Número de personas' },
                name: { type: 'string', description: 'Nombre del cliente' }
            },
            required: ['resource_id', 'start']
        }
    }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PURE AI AGENT (FALLBACK)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function processPureAI(supabase: any, merchantId: string, conversationId: string, messageText: string, customerId: string): Promise<string | null> {
    console.log(`[BOT-ENGINE] Modo IA Agente para conv: ${conversationId}`);
    try {
        const { data: merchant } = await supabase.from("merchants").select("*").eq("id", merchantId).single();
        const { data: ps } = await supabase.from("platform_settings").select("*").eq("id", "global").maybeSingle();
        const { data: systemPrompt } = await supabase.rpc("get_compiled_prompt", { p_merchant_id: merchantId });

        const { data: history } = await supabase
            .from("messages")
            .select("sender_type, content")
            .eq("conversation_id", conversationId)
            .order("created_at", { ascending: false })
            .limit(3);
        
        const historyContext = history 
            ? history.reverse().map((m: any) => `${m.sender_type === 'customer' ? 'Cliente' : 'Asistente'}: ${m.content}`).join('\n')
            : "";

        const apiKey = merchant.ai_api_key || ps?.ai_api_key || Deno.env.get("GEMINI_API_KEY");
        const model = merchant.ai_model || ps?.ai_model || "gemini-1.5-flash";

        if (!apiKey) return "Mmm, mi cerebro de IA no tiene una llave de acceso configurada todavía. 🤖🗝️";

        const multitaskInstruction = `Responde cordial y usa emojis. Al final de tu respuesta, DEBES incluir este bloque JSON oculto:
[DATA]
{
    "crm": {"preferences": [], "tags": [], "sentiment": "neutral"}
}
[/DATA]`;

        const fullPrompt = `${systemPrompt}\n\n${multitaskInstruction}`;
        
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                system_instruction: { parts: [{ text: fullPrompt }] },
                contents: [{ role: "user", parts: [{ text: `HISTORIAL:\n${historyContext}\n\nMENSAJE: ${messageText}` }] }]
            }),
        });

        const aiData = await res.json();
        const rawText = aiData.candidates?.[0]?.content?.parts?.[0]?.text || "";

        let response = rawText;
        const dataMatch = rawText.match(/\[DATA\]([\s\S]*?)\[\/DATA\]/);
        
        if (dataMatch) {
            try {
                const parsed = JSON.parse(dataMatch[1].trim());
                response = rawText.replace(dataMatch[0], "").trim();
                
                if (parsed.crm && (parsed.crm.preferences?.length > 0 || (parsed.crm.sentiment && parsed.crm.sentiment !== 'neutral'))) {
                    await supabase.from("customers").update({
                        preferences: parsed.crm.preferences,
                        sentiment: parsed.crm.sentiment,
                        updated_at: new Date().toISOString()
                    }).eq("id", customerId);
                }
            } catch (e) { console.error("[BOT-ENGINE] Error parseando CRM en modo PureAI", e); }
        }

        return response || "Lo siento, tuve un problema procesando eso. 🤖⚙️";
    } catch (err) {
        console.error("[BOT-ENGINE] Exception in processPureAI", err);
        return null;
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
        console.log("[BOT-ENGINE] No hay flujo activo. Cayendo en modo IA Agente...");
        return await processPureAI(supabase, merchantId, conversationId, messageText, customerId);
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

    // Cargar nombre del comercio en variables para resolver {{merchantName}}
    const { data: merchantData } = await supabase.from('merchants').select('name').eq('id', merchantId).single();
    if (merchantData) variables['merchantName'] = merchantData.name;

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
                        variables['last_selected_product_price'] = (parts.length > 2 || (parts.length === 2 && parts[1].length !== 2))
                            ? parseFloat(priceStr.replace(/\./g, ''))
                            : parseFloat(priceStr);
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

            // NOTA: El carrito se actualiza en el nodo action (add_to_cart), no aquí.
            // Guardamos la cantidad para que el action la use.
            // También guardamos las notas del producto para usarlas en el carrito.
            if (varName === 'last_product_notes' && variables['last_selected_product_id']) {
                variables['last_product_notes_value'] = messageText.trim();
            }

            const conn = connections.find((c: any) => c.from === currentNodeId && c.fromPort === 'output');
            if (conn) { currentNodeId = conn.to; waitingFor = null; }
        } else if (!currentNode) {
            console.warn(`[BOT-ENGINE] Nodo ${currentNodeId} no encontrado (waiting_for: input). Reiniciando.`);
            const startNode = nodes.find((n: any) => n.type === 'start');
            currentNodeId = startNode ? startNode.id : null;
            waitingFor = null;
        }
    } else if (waitingFor === 'ai_input') {
        // El AI Agent recibe el nuevo mensaje del usuario
        // Solo reseteamos el waitingFor para que el loop principal vuelva a ejecutar el nodo ai_agent
        // con el mismo currentNodeId, y messageText ya contiene el nuevo mensaje del usuario
        const currentNode = nodes.find((n: any) => n.id === currentNodeId);
        if (currentNode?.type === 'ai_agent') {
            waitingFor = null;
            // currentNodeId permanece igual: el loop ejecutará el nodo ai_agent
        }
    } else if (waitingFor === 'condition') {
        waitingFor = null;
    }

    // 4. Recorrer el flujo hasta pausar o terminar
    const messagesToReturn: string[] = [];
    let loopCount = 0;
    const MAX_LOOPS = 20;

    while (currentNodeId && loopCount < MAX_LOOPS) {
        loopCount++;
        const node = nodes.find((n: any) => n.id === currentNodeId);
        if (!node) {
            console.error(`[BOT-ENGINE] ERROR: No se encontró el nodo con ID: ${currentNodeId}. Reiniciando al inicio.`);
            const startNode = nodes.find((n: any) => n.type === 'start');
            if (startNode) {
                currentNodeId = startNode.id;
                continue;
            }
            break;
        }
        console.log(`[BOT-ENGINE] LOOP ${loopCount} | Nodo: ${node.data?.label || node.type} (${node.id})`);

        // ── ACCIÓN ──────────────────────────────────
        if (node.type === 'action') {
            await executeAction(supabase, node, variables, merchantId, conversationId, customerId);
        }

        // ── AGENTE IA (CON FUNCTION CALLING REAL) ───
        if (node.type === 'ai_agent') {
            const userTemplate = node.data.user_prompt || '{{message}}';
            const temp = node.data.temperature ?? 0.7;
            const memoryLimit = node.data.memory_limit ?? 6;

            // Obtener API configurations (merchant primero, luego plataforma)
            const { data: merchant } = await supabase.from('merchants').select('name, ai_api_key, ai_model').eq('id', merchantId).single();
            const { data: platform } = await supabase.from('platform_settings').select('ai_api_key, ai_model').eq('id', 'global').maybeSingle();
            
            const apiKey = merchant?.ai_api_key || platform?.ai_api_key;

            // Prioridad de modelo: 1. Configuración del comercio, 2. Configuración del bloque, 3. Configuración plataforma, 4. Fallback
            const modelRaw = merchant?.ai_model || node.data.model || platform?.ai_model || 'gemini-1.5-flash';
            const model = modelRaw.replace('models/', '');

            if (!apiKey) {
                messagesToReturn.push('⚠️ Configuración de IA no disponible. Contacta a soporte.');
                waitingFor = 'ai_input'; break;
            }

            try {
                // 1. Obtener el Súper Prompt Centralizado (Reglas de Oro + Configuración Merchant)
                const { data: compiledPrompt, error: promptErr } = await supabase.rpc('get_compiled_prompt', { 
                    p_merchant_id: merchantId 
                });

                if (promptErr) console.error('[BOT-ENGINE] Error al obtener prompt centralizado:', promptErr);

                // 2. Construir Contexto dinámico de la sesión
                const cart = variables['cart'] || [];
                const cartSummary = cart.length > 0
                    ? cart.map((it: any) => `${it.name} x${it.qty} ($${it.price * it.qty})`).join(', ')
                    : 'vacío';

                const customNodeInstructions = node.data.prompt || '';
                
                // 3. Ensamblar Prompt Final (Prioridad: Base Centralizada + Instrucciones del Nodo + Estado Actual)
                const systemPrompt = `
${compiledPrompt || 'Eres un asistente de ventas amigable.'}

### INSTRUCCIONES ESPECÍFICAS DE ESTA ETAPA:
${customNodeInstructions}

### INSTRUCCIONES OPERATIVAS:
1. SIEMPRE usa las herramientas (tools) disponibles para obtener información real (no inventes datos).
2. Para mostrar productos: usa catalog_search.
3. Para añadir al carrito: usa add_to_cart.
4. Para ver el carrito: usa get_cart.
5. Para confirmar pedido: usa register_order SOLO con confirmación explícita.
6. Mantén respuestas cortas, amigables y enfocadas a la venta.
7. RECUERDA: Tienes prohibido negociar precios, inventar ingredientes o hablar de temas ajenos al negocio.

### ESTADO ACTUAL DE LA SESIÓN:
- Tienda: ${merchant?.name || 'Nuestra tienda'}
- Carrito del cliente: ${cartSummary}
- Número de pedido activo: ${variables['orderNumber'] || 'ninguno'}
`;

                // Obtener historial de conversación para la memoria
                let history: any[] = [];
                if (memoryLimit > 0) {
                    const { data: hist } = await supabase.from('messages')
                        .select('sender_type, content')
                        .eq('conversation_id', conversationId)
                        .order('created_at', { ascending: false })
                        .limit(memoryLimit);
                    if (hist) history = hist.reverse();
                }

                const formattedHistory = history.map((m: any) => ({
                    role: m.sender_type === 'customer' ? 'user' : 'model',
                    parts: [{ text: m.content }]
                }));

                // Detectar skills conectadas al agente
                const skillConns = connections.filter((c: any) => c.to === node.id && c.toPort === 'skills_in');
                const skills = skillConns
                    .map((c: any) => nodes.find((n: any) => n.id === c.from))
                    .filter((n: any) => n?.type === 'ai_skill');

                // Construir definiciones de tools para Gemini
                const functionDeclarations: any[] = [];
                if (skills.length > 0) {
                    for (const skill of skills) {
                        const toolDef = TOOL_DEFINITIONS[skill.data.actionType];
                        if (toolDef) {
                            // Usar descripción personalizada del nodo si existe
                            const customizedDef = { ...toolDef };
                            if (skill.data.message) customizedDef.description = skill.data.message;
                            functionDeclarations.push(customizedDef);
                        }
                    }
                }

                const finalUserMessage = userTemplate.replace('{{message}}', messageText);
                const contents = [
                    ...formattedHistory,
                    { role: 'user', parts: [{ text: finalUserMessage }] }
                ];

                let geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

                // ── LLAMADA 1: Gemini decide si responde directo o usa una tool ──
                let aiRes = await fetch(geminiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        system_instruction: { parts: [{ text: systemPrompt }] },
                        contents,
                        tools: functionDeclarations.length > 0 ? [{ function_declarations: functionDeclarations }] : undefined,
                        tool_config: functionDeclarations.length > 0 ? { function_calling_config: { mode: 'AUTO' } } : undefined,
                        generationConfig: { temperature: temp, maxOutputTokens: 1024 }
                    })
                });

                // Fallback 1: Si falla por v1beta, intentar v1 (pero v1 no siempre soporta system_instruction igual)
                if (aiRes.status === 404) {
                  console.warn('[BOT] v1beta 404, probando v1...');
                  geminiUrl = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`;
                  aiRes = await fetch(geminiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      system_instruction: { parts: [{ text: systemPrompt }] },
                      contents,
                      tools: functionDeclarations.length > 0 ? [{ function_declarations: functionDeclarations }] : undefined,
                      generationConfig: { temperature: temp, maxOutputTokens: 1024 }
                    })
                  });
                }

                // Fallback 2: Si falla por "system_instruction" (error 400), mezclar prompt con mensaje en v1beta
                if (aiRes.status === 400) {
                  const errJson = await aiRes.clone().json().catch(() => ({}));
                  if (JSON.stringify(errJson).includes('system_instruction') || JSON.stringify(errJson).includes('tools')) {
                    console.warn('[BOT] El modelo no soporta system_instruction o tools, reintentando con blend...');
                    geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
                    aiRes = await fetch(geminiUrl, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        contents: [
                          ...formattedHistory.slice(-4), // Usar historial corto para no saturar si es blend
                          { role: 'user', parts: [{ text: `${systemPrompt}\n\nMENSAJE DEL USUARIO:\n${messageText}` }] }
                        ],
                        generationConfig: { temperature: temp, maxOutputTokens: 1024 }
                      })
                    });
                  }
                }

                if (!aiRes.ok) {
                    const errText = await aiRes.text();
                    console.error('[BOT-ENGINE] Gemini API Error:', aiRes.status, errText);
                    messagesToReturn.push('⚠️ Error al conectar con el servicio de IA. Intenta de nuevo.');
                    waitingFor = 'ai_input'; break;
                }

                const aiData = await aiRes.json();
                const candidate = aiData.candidates?.[0]?.content;

                if (!candidate) {
                    messagesToReturn.push('No pude generar una respuesta. ¿Puedes reformular tu pregunta?');
                    waitingFor = 'ai_input'; break;
                }

                // ── FUNCIÓN CALL: El LLM quiere usar una herramienta ──
                const functionCallPart = candidate.parts?.find((p: any) => p.functionCall);
                if (functionCallPart) {
                    const call = functionCallPart.functionCall;
                    console.log(`[BOT-ENGINE] Gemini solicita tool: ${call.name}`, call.args);

                    // Ejecutar la tool real
                    const toolResult = await executeAgentTool(
                        supabase, call.name, call.args, variables,
                        merchantId, conversationId, customerId
                    );
                    console.log(`[BOT-ENGINE] Resultado de tool "${call.name}":`, toolResult);

                    // ── LLAMADA 2: Enviar resultado al LLM para que redacte respuesta natural ──
                    const contentsWithTool = [
                        ...contents,
                        candidate,  // La respuesta del LLM con el functionCall
                        {
                            role: 'user',  // ← CRÍTICO: debe ser 'user', NO 'function'
                            parts: [{
                                functionResponse: {
                                    name: call.name,
                                    response: { content: toolResult }
                                }
                            }]
                        }
                    ];

                    const secondRes = await fetch(geminiUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            system_instruction: { parts: [{ text: systemPrompt }] },
                            contents: contentsWithTool,
                            generationConfig: { temperature: temp, maxOutputTokens: 1024 }
                        })
                    });

                    const secondData = await secondRes.json();
                    const finalText = secondData.candidates?.[0]?.content?.parts?.[0]?.text;
                    messagesToReturn.push(finalText || toolResult); // Fallback al resultado crudo si falla
                } else {
                    // Respuesta directa del LLM sin herramientas
                    const directText = candidate.parts?.find((p: any) => p.text)?.text;
                    messagesToReturn.push(directText || 'Entiendo. ¿En qué más te puedo ayudar?');
                }

            } catch (err: any) {
                console.error('[BOT-ENGINE] Error en AI Agent:', err);
                messagesToReturn.push('Ocurrió un error procesando tu solicitud. Por favor intenta de nuevo.');
            }

            // El AI Agent siempre pausa para esperar el siguiente mensaje
            waitingFor = 'ai_input';
            break;
        }

        // ── N8N WEBHOOK ──────────────────────────────
        if (node.type === 'n8n' && node.data.n8n_webhook_url) {
            console.log(`[BOT-ENGINE] Disparando Webhook n8n en: ${node.data.n8n_webhook_url}`);
            try {
                const res = await fetch(node.data.n8n_webhook_url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        conversationId,
                        merchantId,
                        customerId,
                        variables
                    })
                });
                
                if (node.data.n8n_wait_for_response) {
                    const data = await res.json();
                    if (data && typeof data === 'object') {
                        // Mezclar variables devueltas
                        Object.assign(variables, data);
                    }
                }
            } catch (err: any) {
                console.error('[BOT-ENGINE] Error n8n Webhook:', err.message);
            }
        }

        // ── MCP TOOL ─────────────────────────────────
        if (node.type === 'mcp' && node.data.mcp_tool_name) {
            console.log(`[BOT-ENGINE] Disparando MCP Tool: ${node.data.mcp_tool_name}`);
            // TODO: Integración directa al SDK de MCP Server usando variables. 
            // Esto funcionaría como placeholder hasta tener la URL real del puente MCP en Supabase Edge.
            variables[`mcp_${node.data.mcp_tool_name}_result`] = 'Simulated MCP Success';
        }

        // ── API REQUEST ──────────────────────────────
        if (node.type === 'api' && node.data.api_url) {
            console.log(`[BOT-ENGINE] Llamada API: [${node.data.api_method || 'GET'}] ${node.data.api_url}`);
            let url = resolveVariables(node.data.api_url, variables, flow.name);
            let body = node.data.api_body ? resolveVariables(node.data.api_body, variables, flow.name) : undefined;
            
            try {
                const opts: RequestInit = {
                    method: node.data.api_method || 'GET',
                    headers: { 'Content-Type': 'application/json' }
                };
                if (body && (opts.method === 'POST' || opts.method === 'PUT')) {
                    opts.body = body; // Asumiendo JSON válido
                }
                
                const apiRes = await fetch(url, opts);
                const data = await apiRes.json();
                
                if (node.data.response_mapping) {
                    variables[node.data.response_mapping] = data;
                }
            } catch(e: any) {
                console.error('[BOT-ENGINE] Error API:', e.message);
                if (node.data.response_mapping) {
                   variables[node.data.response_mapping] = { error: e.message };
                }
            }
        }

        // ── CATEGORÍA 2: CONTEXTO Y MEMORIA ──────────
        if (node.type === 'memory_extract' && node.data.memory_prompt && node.data.memory_key) {
            console.log(`[BOT-ENGINE] Extrayendo a memoria clave: ${node.data.memory_key}`);
            const prompt = resolveVariables(node.data.memory_prompt, variables, flow.name);
            const key = node.data.memory_key;
            
            // Reusar API Key para extracción si está disp.
            const { data: mData } = await supabase.from('merchants').select('ai_api_key').eq('id', merchantId).single();
            const apiKey = mData?.ai_api_key || (await supabase.from('platform_settings').select('ai_api_key').eq('id', 'global').maybeSingle())?.data?.ai_api_key;
            if (apiKey) {
                try {
                    const modelUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
                    const aiRes = await fetch(modelUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: [{ role: 'user', parts: [{ text: `Basado en el último mensaje del usuario: "${messageText}".\n\nInstrucción de extracción: ${prompt}\n\nDevuelve SOLAMENTE el valor extraído exacto, nada más. Si no puedes extraerlo o el usuario no da información, devuelve SILENCIO.` }] }],
                            generationConfig: { temperature: 0.1 }
                        })
                    });
                    const data = await aiRes.json();
                    const textExtract = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
                    if (textExtract && textExtract !== 'SILENCIO') {
                        variables[key] = textExtract;
                    }
                } catch(e) { console.error('Error Extracting Memory:', e); }
            }
        }

        if (node.type === 'set_variable' && node.data.variable_name) {
            const key = node.data.variable_name;
            const val = resolveVariables(node.data.variable_value || '', variables, flow.name);
            variables[key] = val;
            console.log(`[BOT-ENGINE] Set Variable: ${key} = ${val}`);
        }

        if (node.type === 'db_query' && node.data.db_table) {
            console.log(`[BOT-ENGINE] DB Query: ${node.data.db_operation} en ${node.data.db_table}`);
            const op = node.data.db_operation || 'select';
            const col = node.data.db_column || 'id';
            const rawVal = resolveVariables(node.data.db_value || '', variables, flow.name);
            
            try {
                if (op === 'select') {
                    const { data } = await supabase.from(node.data.db_table).select('*').eq(col, rawVal).maybeSingle();
                    if (node.data.response_mapping && data) {
                        variables[node.data.response_mapping] = data;
                    }
                } else if (op === 'insert') {
                    // Intenta interpretar rawVal como JSON si es un objeto insertado
                    let payload = rawVal;
                    try { payload = JSON.parse(rawVal); } catch (e) {}
                    await supabase.from(node.data.db_table).insert(payload);
                }
            } catch(e) { console.error('[BOT-ENGINE] Error DB Query:', e); }
        }

        // ── CATEGORÍA 3: LÓGICA Y FLUJO ──────────
        if (node.type === 'switch') {
            const varName = node.data.switch_variable || '';
            const actualVal = String(variables[varName] ?? '').trim().toLowerCase();
            const matchingCase = node.data.switch_cases?.find((c: any) => c.value.trim().toLowerCase() === actualVal);
            const portId = matchingCase ? matchingCase.id : null;
            
            console.log(`[BOT-ENGINE] Switch eval: ${varName}=${actualVal}. Matching port: ${portId}`);
            const conn = connections.find((c: any) => c.from === currentNodeId && c.fromPort === portId);
            if (conn) { currentNodeId = conn.to; continue; } else break;
        }

        if (node.type === 'business_hours') {
            const now = new Date();
            const tz = node.data.timezone || 'America/Bogota';
            
            try {
                // Obtener día y hora en la zona horaria del comercio
                const dayName = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: tz }).format(now).toLowerCase();
                const timeStr = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }).format(now);
                
                const config = node.data.business_hours?.find((h: any) => h.day === dayName);
                let isOpen = false;
                if (config && config.enabled) {
                    isOpen = timeStr >= (config.open || '00:00') && timeStr <= (config.close || '23:59');
                }
                
                console.log(`[BOT-ENGINE] Business Hours: ${tz} ${dayName} ${timeStr}. Open? ${isOpen}`);
                const portId = isOpen ? 'open' : 'closed';
                const conn = connections.find((c: any) => c.from === currentNodeId && c.fromPort === portId);
                if (conn) { currentNodeId = conn.to; continue; } else break;
            } catch (e) {
                console.error('[BOT-ENGINE] Error en Business Hours:', e);
                // Fallback a ruta 'open' para no bloquear el bot si falla el TZ
                const conn = connections.find((c: any) => c.from === currentNodeId && c.fromPort === 'open');
                if (conn) { currentNodeId = conn.to; continue; } else break;
            }
        }

        if (node.type === 'delay') {
            const h = node.data.delay_hours || 0;
            const m = node.data.delay_minutes || 0;
            const totalMs = (h * 3600 + m * 60) * 1000;
            
            if (totalMs > 0) {
                const resumeAt = new Date(Date.now() + totalMs).toISOString();
                variables['_resume_at'] = resumeAt;
                waitingFor = 'delay';
                console.log(`[BOT-ENGINE] Delay node reached. Pausing until ${resumeAt}`);
                break;
            }
        }

        // ── CATEGORÍA 4: INTELIGENCIA ARTIFICIAL ─────
        if (node.type === 'semantic_router') {
            const varToEvaluate = node.data.variable || 'message';
            const textToClassify = String(variables[varToEvaluate] || '').trim();
            const intents = node.data.ai_intents || [];
            
            if (textToClassify && intents.length > 0) {
                try {
                    const intentList = intents.map((i: any) => `- ${i.name}: ${i.description}`).join('\n');
                    const routerPrompt = `Clasifica el siguiente texto en una de estas intenciones. Responde ÚNICAMENTE con el NOMBRE de la intención (ej: comprar):\n\nIntenciones:\n${intentList}\n\nTexto: "${textToClassify}"`;
                    
                    const classification = await callGemini(routerPrompt, "Eres un enrutador semántico preciso.", merchantId);
                    const matchingIntent = intents.find((i: any) => i.name.toLowerCase() === classification.trim().toLowerCase());
                    const portId = matchingIntent ? matchingIntent.id : null;
                    
                    console.log(`[BOT-ENGINE] Semantic Router classified "${textToClassify}" as "${classification}". Matching port: ${portId}`);
                    const conn = connections.find((c: any) => c.from === currentNodeId && c.fromPort === portId);
                    if (conn) { currentNodeId = conn.to; continue; } else break;
                } catch (e) { console.error('[BOT-ENGINE] Semantic Router Error:', e); }
            }
        }

        if (node.type === 'image_generator') {
            const prompt = node.data.image_prompt || 'Una imagen creativa';
            // Placeholder: en producción llamaríamos a DALL-E / Midjourney
            const imageUrl = `https://pollinations.ai/p/${encodeURIComponent(prompt.substring(0, 100))}`;
            if (node.data.response_mapping) {
                variables[node.data.response_mapping] = imageUrl;
            }
            console.log(`[BOT-ENGINE] Image Generator: ${imageUrl}`);
            const conn = connections.find((c: any) => c.from === currentNodeId && c.fromPort === 'output');
            if (conn) { currentNodeId = conn.to; continue; } else break;
        }

        if (node.type === 'knowledge_query') {
            const query = node.data.knowledge_query || '';
            if (query) {
                try {
                    const chunks = await searchKnowledgeDocuments(supabase, query, merchantId, node.data.knowledge_doc_id);
                    const context = chunks.map((c: any) => c.content).join('\n\n');
                    const prompt = `Responde la siguiente pregunta basándote ÚNICAMENTE en este contexto:\n\nContexto:\n${context}\n\nPregunta: ${query}`;
                    const response = await callGemini(prompt, "Eres un asistente que responde basándose en documentos.", merchantId);
                    
                    if (node.data.response_mapping) {
                        variables[node.data.response_mapping] = response;
                    }
                } catch (e) { console.error('[BOT-ENGINE] Knowledge Query Error:', e); }
            }
            const conn = connections.find((c: any) => c.from === currentNodeId && c.fromPort === 'output');
            if (conn) { currentNodeId = conn.to; continue; } else break;
        }

        if (node.type === 'send_email') {
            const to = resolveVariables(node.data.email_to || '', variables, flow.name);
            const subject = resolveVariables(node.data.email_subject || '', variables, flow.name);
            const body = resolveVariables(node.data.email_body || '', variables, flow.name);
            console.log(`[BOT-ENGINE] Sending email to ${to}: ${subject}`);
            // Mock send
            const conn = connections.find((c: any) => c.from === currentNodeId && (c.fromPort === 'output' || !c.fromPort));
            if (conn) { currentNodeId = conn.to; continue; } else break;
        }

        if (node.type === 'transfer_operator') {
            waitingFor = 'operator';
            console.log(`[BOT-ENGINE] Transferring to operator...`);
            // Se rompe el loop para esperar intervención humana
            break;
        }

        if (node.type === 'wa_template') {
            const template = node.data.wa_template_name;
            const params = node.data.wa_template_params?.map((p: string) => resolveVariables(p, variables, flow.name)) || [];
            console.log(`[BOT-ENGINE] Sending WA Template ${template} with params:`, params);
            // Mock send
            const conn = connections.find((c: any) => c.from === currentNodeId && (c.fromPort === 'output' || !c.fromPort));
            if (conn) { currentNodeId = conn.to; continue; } else break;
        }

        if (node.type === 'catalog_search') {
            const { data: products } = await supabase.from('products').select('*').eq('merchant_id', merchantId).limit(5);
            if (products && products.length > 0) {
                const list = products.map((p: any) => `- ${p.name}: $${p.price}`).join('\n');
                messagesToReturn.push(`🛒 Productos disponibles:\n${list}`);
            } else {
                messagesToReturn.push('No hay productos disponibles en este momento.');
            }
            const conn = connections.find((c: any) => c.from === currentNodeId && (c.fromPort === 'output' || !c.fromPort));
            if (conn) { currentNodeId = conn.to; continue; } else break;
        }

        if (node.type === 'cart_summary') {
            const cart = variables['cart'] || [];
            if (cart.length === 0) {
                messagesToReturn.push('🛍️ Tu carrito está vacío.');
            } else {
                const summary = cart.map((it: any) => `- ${it.name} x${it.qty} ($${it.price * it.qty})`).join('\n');
                const total = cart.reduce((acc: number, it: any) => acc + (Number(it.price) * it.qty), 0);
                messagesToReturn.push(`🛍️ Resumen de tu carrito:\n\n${summary}\n\n💰 *Total: $${total}*`);
            }
            const conn = connections.find((c: any) => c.from === currentNodeId && (c.fromPort === 'output' || !c.fromPort));
            if (conn) { currentNodeId = conn.to; continue; } else break;
        }

        if (node.type === 'order_checkout') {
            await executeAction(supabase, { data: { actionType: 'register_order' } }, variables, merchantId, conversationId, customerId);
            const conn = connections.find((c: any) => c.from === currentNodeId && (c.fromPort === 'output' || !c.fromPort));
            if (conn) { currentNodeId = conn.to; continue; } else break;
        }

        // ── CONDICIÓN (Si/No) ────────────────────────
        if (node.type === 'condition') {
            const varName = node.data.variable || '';
            const actualVal = variables[varName] ?? '';
            const result = evaluateCondition(node.data.operator || '==', String(actualVal), node.data.value || '');
            const conn = connections.find((c: any) => c.from === currentNodeId && c.fromPort === (result ? 'yes' : 'no'));
            if (conn) { currentNodeId = conn.to; continue; } else break;
        }

        // ── CATEGORÍA: RESERVAS ──────────────────────
        if (node.type === 'reservation_check') {
            console.log(`[BOT-ENGINE] Nodo Reserva Check: ${node.data.resource_id}`);
            const resourceId = node.data.resource_id;
            const startStr = resolveVariables(node.data.start_time || '{{fecha_cita}} {{hora_cita}}', variables, flow.name);
            const pax = parseInt(resolveVariables(node.data.pax || '1', variables, flow.name)) || 1;
            
            const start = new Date(startStr.replace(' ', 'T'));
            if (!isNaN(start.getTime())) {
                const { data: resInfo } = await supabase.from('reservable_resources').select('duration_minutes').eq('id', resourceId).single();
                const duration = resInfo?.duration_minutes || 60;
                const end = new Date(start.getTime() + duration * 60000);

                const { data } = await supabase.rpc('check_resource_availability', {
                    p_resource_id: resourceId,
                    p_start_time: start.toISOString(),
                    p_end_time: end.toISOString(),
                    p_pax: pax
                });

                variables['reservation_available'] = data?.available || false;
                variables['reservation_reason'] = data?.reason || '';
            } else {
                variables['reservation_available'] = false;
                variables['reservation_reason'] = 'Formato de fecha inválido';
            }
        }

        if (node.type === 'reservation_create') {
            console.log(`[BOT-ENGINE] Nodo Reserva Create: ${node.data.resource_id}`);
            const resourceId = node.data.resource_id;
            const startStr = resolveVariables(node.data.start_time || '{{fecha_cita}} {{hora_cita}}', variables, flow.name);
            const pax = parseInt(resolveVariables(node.data.pax || '1', variables, flow.name)) || 1;
            
            const start = new Date(startStr.replace(' ', 'T'));
            if (!isNaN(start.getTime())) {
                const { data: resInfo } = await supabase.from('reservable_resources').select('duration_minutes, base_price').eq('id', resourceId).single();
                const duration = resInfo?.duration_minutes || 60;
                const end = new Date(start.getTime() + duration * 60000);

                const { data: booking, error: bErr } = await supabase.from('bookings').insert({
                    merchant_id: merchantId,
                    customer_id: customerId,
                    resource_id: resourceId,
                    start_time: start.toISOString(),
                    end_time: end.toISOString(),
                    pax: pax,
                    status: 'confirmed',
                    channel: 'whatsapp',
                    total_price: resInfo?.base_price || 0,
                    conversation_id: conversationId
                }).select().single();
                
                if (booking) {
                    variables['booking_id'] = booking.id;
                    variables['booking_status'] = 'success';
                    
                    // NOTIFICAR AGENTES
                    await notifyMerchantAgents(supabase, merchantId, "¡Nueva Reserva! 📅", `Cliente: ${variables['customer_name'] || 'Cliente'}\nFecha: ${startStr}\nPax: ${pax}`);
                } else {
                    variables['booking_status'] = 'error';
                    variables['booking_error'] = bErr?.message;
                }
            }
        }

        if (node.type === 'calendar_sync') {
            messagesToReturn.push('🔄 Sincronizando con calendarios externos...');
        }

        // ── MENSAJE ──────────────────────────────────
        if (node.data.message) {
            let msg = resolveVariables(node.data.message, variables, flow.name);
            console.log(`[BOT-ENGINE] Mensaje antes de opciones: "${msg}" (Node: ${node.id}, Type: ${node.type})`);
            if (node.type === 'menu' && node.data.options) {
                const optionsList = node.data.options.map((o: any, i: number) => `${i + 1}️⃣  ${o.text}`).join('\n');
                msg += `\n\n${optionsList}`;
                console.log(`[BOT-ENGINE] Opciones añadidas: ${node.data.options.length} opciones.`);
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
    }

    // 5. Guardar estado de la sesión
    await supabase.from('bot_flow_sessions').update({
        current_node_id: currentNodeId,
        variables,
        waiting_for: waitingFor,
        updated_at: new Date().toISOString(),
        status: currentNodeId === null ? 'completed' : 'active'
    }).eq('id', session.id);

    return messagesToReturn.join('\n\n') || null;
}
