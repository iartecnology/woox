import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { notifyMerchantAgents } from "./notifications.ts";
import { resolveAIConfig, callUnifiedAI, type AIMessage, type AIToolDef } from "./ai-adapter.ts";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HELPERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function resolveVariables(text: string, variables: any, flowName?: string): string {
    if (!text) return '';

    // Resolver {{cartSummary}} o {{cart_summary}}
    if (text.includes('{{cartSummary}}') || text.includes('{{cart_summary}}')) {
        const cart = variables['cart'] || [];
        if (cart.length === 0) {
            // Si el carrito está vacío, intentar usar la caché del último checkout
            if (variables['checkout_summary_cache']) {
                text = text.replace(/{{cartSummary}}/ig, variables['checkout_summary_cache']);
                text = text.replace(/{{cart_summary}}/ig, variables['checkout_summary_cache']);
            } else {
                text = text.replace(/{{cartSummary}}/ig, '_El carrito está vacío_');
                text = text.replace(/{{cart_summary}}/ig, '_El carrito está vacío_');
            }
        } else {
            const summary = cart.map((it: any) => {
                const notes = it.notes ? ` (${it.notes})` : '';
                return `- ${it.name} x${it.qty}${notes} ($${it.price * it.qty})`;
            }).join('\n');
            const total = cart.reduce((acc: number, it: any) => acc + (Number(it.price) * it.qty), 0);
            const finalSummary = `${summary}\n\n💰 *Total: $${total}*`;
            text = text.replace(/{{cartSummary}}/ig, finalSummary);
            text = text.replace(/{{cart_summary}}/ig, finalSummary);
        }
    }

    return text.replace(/{{(.*?)}}/g, (match: string, key: string) => {
        const k = key.trim();
        if (k.toLowerCase() === 'merchantname') return variables['merchantName'] || flowName || 'Comercio';
        const varKey = Object.keys(variables).find(v => v.toLowerCase() === k.toLowerCase());
        if (varKey) {
            const val = variables[varKey];
            return val !== undefined && val !== null ? String(val) : '';
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

function formatPrice(amount: number | string): string {
    const num = Number(amount);
    if (isNaN(num)) return String(amount);
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(num).replace('COP', '').trim();
}

async function createOrderSafe(supabase: any, orderData: any) {
    const fullData = { 
        ...orderData, 
        source: orderData.source || 'bot_flow', 
        closing_agent_type: orderData.closing_agent_type || 'bot' 
    };
    
    let { data, error } = await supabase.from('orders').insert(fullData).select('*').single();

    if (error && (error.message.includes('column') || error.message.includes('cache'))) {
        console.log('[BOT-ENGINE] Fallback a esquema básico de orders...');
        const basicData: any = {
            merchant_id: orderData.merchant_id,
            customer_id: orderData.customer_id,
            total: orderData.total,
            delivery_address: orderData.delivery_address,
            notes: orderData.notes,
            status: orderData.status,
            customer_name: orderData.customer_name,
            customer_phone: orderData.customer_phone
        };
        if (orderData.channel) basicData.channel = orderData.channel;
        const res = await supabase.from('orders').insert(basicData).select('*').single();
        data = res.data;
        error = res.error;
    }
    
    if (error) console.error('[BOT-ENGINE] Error creando pedido:', error);
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
        if (variables['customer_name'] || variables['nombre_cliente'] || variables['nombre'] || variables['name']) {
            customerUpdate.full_name = variables['customer_name'] || variables['nombre_cliente'] || variables['nombre'] || variables['name'];
        }
        if (variables['customer_phone'] || variables['telefono_cliente'] || variables['telefono'] || variables['phone']) {
            customerUpdate.phone = variables['customer_phone'] || variables['telefono_cliente'] || variables['telefono'] || variables['phone'];
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
            notes: variables['notas_entrega'] || variables['nota_adicional'] || variables['notas'] || null,
            status: 'pending', conversation_id: conversationId, channel: finalChannel,
            customer_name: customerUpdate.full_name || variables['customer_name'],
            customer_phone: customerUpdate.phone || variables['customer_phone']
        });

        if (!orderErr && order) {
            variables['orderNumber'] = `#${order.order_number || order.id.substring(0, 8)}`;
            variables['order_number'] = variables['orderNumber'];
            const currentCart = variables['cart'] || [];
            if (currentCart.length > 0) {
                const items = currentCart.map((it: any) => ({
                    order_id: order.id, 
                    product_id: it.id, 
                    product_name: it.name,
                    quantity: it.qty, 
                    unit_price: it.price, 
                    subtotal: it.price * it.qty,
                    notes: it.notes || null
                }));
                await supabase.from('order_items').insert(items);
            }
            
            // --- 3. CACHEAR EL RESUMEN DEL CARRITO Y LIMPIAR LA SESIÓN ---
            // Esto permite que el nodo de 'Mensaje de Éxito' pueda mostrar el resumen, pero evita duplicados
            const summaryStrings = currentCart.map((it: any) => {
                const notes = it.notes ? ` (${it.notes})` : '';
                return `- ${it.name} x${it.qty}${notes} ($${it.price * it.qty})`;
            }).join('\n');
            const calculatedTotal = currentCart.reduce((acc: number, it: any) => acc + (Number(it.price) * it.qty), 0);
            variables['checkout_summary_cache'] = `${summaryStrings}\n\n💰 *Total: $${calculatedTotal}*`;

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
        
        // Determinar notas dinámicamente si vienen en los params del nodo (evaluando variables como {{notas_preparacion}})
        let notes = '';
        if (node.data.params?.notes) {
            notes = resolveVariables(node.data.params.notes, variables, '');
        }
        // Fallback a las variables legacy si el nodo no mapeó explícitamente
        if (!notes || notes === node.data.params?.notes) {
            notes = variables['last_product_notes_value'] || variables['last_product_notes'] || '';
        }

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
            // Limpieza básica y manejo de plurales
            const query = queryRaw.replace(/^(papas|una|un|el|la|los|las|quiero|ver|busca|hamburguesas?)\s+/i, '').replace(/s$/, '').trim() || queryRaw.replace(/s$/, '');
            
            console.log(`[BOT-ENGINE] Catalog Search | Raw: "${queryRaw}" | Clean: "${query}"`);

            // Sinonimos y traducciones comunes para mejorar la búsqueda semántica
            const synonyms: Record<string, string[]> = {
                'aguacate': ['avocado', 'guacamole', 'avocada'],
                'avocado': ['aguacate', 'guacamole', 'avocada'],
                'avocada': ['aguacate', 'avocado', 'guacamole'],
                'guacamole': ['aguacate', 'avocado', 'avocada'],
                'tocineta': ['bacon'],
                'bacon': ['tocineta'],
                'queso': ['cheese', 'colby', 'gouda', 'mozzarella'],
                'cheese': ['queso'],
                'carne': ['beef', 'angus', 'burger', 'hamburguesa'],
                'pollo': ['chicken', 'bistecca'],
                'chicken': ['pollo'],
                'hamburguesa': ['burger', 'angus', 'beef'],
                'burger': ['hamburguesa']
            };

            // 1. Buscar categorías que coincidan (incluyendo subcategorías)
            const { data: cats } = await supabase.from('categories')
                .select('id, name, parent_id')
                .eq('merchant_id', merchantId)
                .or(`name.ilike.%${query}%,name.ilike.%${queryRaw}%`);
            
            let allCatIds = (cats || []).map((c: any) => c.id);
            console.log(`[BOT-ENGINE] Categorías encontradas:`, (cats || []).map(c => c.name));
            
            // Si encontramos categorías, incluir subcategorías
            if (allCatIds.length > 0) {
                const { data: subCats } = await supabase.from('categories')
                    .select('id')
                    .in('parent_id', allCatIds);
                if (subCats && subCats.length > 0) {
                    allCatIds = [...allCatIds, ...subCats.map((sc: any) => sc.id)];
                }
            }

            // 2. Buscar productos con estrategia multi-etapa (Exacta/Contiene -> Palabras individuales -> Categoría)
            let q = supabase.from('products')
                .select('id, name, price, description, is_available')
                .eq('merchant_id', merchantId)
                .eq('is_available', true);
            
            // Construir filtro OR dinámico
            const filters = [
                `name.ilike.%${query}%`,
                `description.ilike.%${query}%`
            ];
            if (queryRaw !== query) {
                filters.push(`name.ilike.%${queryRaw}%`);
            }
            // Expandir filtros con palabras individuales (mínimo 3 caracteres)
            const words = query.split(/\s+/).filter(w => w.length >= 3);
            for (const w of words) {
                const cleanWord = w.replace(/s$/, '');
                filters.push(`name.ilike.%${cleanWord}%`);
                if (synonyms[cleanWord]) {
                    for (const syn of synonyms[cleanWord]) {
                        filters.push(`name.ilike.%${syn}%`);
                        filters.push(`description.ilike.%${syn}%`);
                    }
                }
            }
            if (allCatIds.length > 0) {
                filters.push(`category_id.in.(${allCatIds.join(',')})`);
            }

            let { data: prods, error: pErr } = await q.or(filters.join(',')).limit(6);

            if (pErr) console.error('[BOT-ENGINE] Error en búsqueda de productos:', pErr);
            
            // Si la búsqueda estricta no trajo nada, buscar con coincidencia amplia
            if (!prods || prods.length === 0) {
                const broadFilters = words.map(w => `name.ilike.%${w.slice(0, 4)}%`);
                if (broadFilters.length > 0) {
                    const { data: fallbackProds } = await supabase.from('products')
                        .select('id, name, price, description, is_available')
                        .eq('merchant_id', merchantId)
                        .eq('is_available', true)
                        .or(broadFilters.join(','))
                        .limit(4);
                    if (fallbackProds && fallbackProds.length > 0) {
                        prods = fallbackProds;
                    }
                }
            }

            console.log(`[BOT-ENGINE] Productos encontrados: ${prods?.length || 0}`);

            if (!prods || prods.length === 0) {
                // Sugerencia si no hay nada
                const { data: others } = await supabase.from('products').select('name, price').eq('merchant_id', merchantId).eq('is_available', true).limit(3);
                if (others && others.length > 0) {
                   return `No encontré productos específicos para "${queryRaw}", pero te sugiero estos destacados de nuestro menú:\n${others.map((p: any) => `• ${p.name} - $${formatPrice(p.price)}`).join('\n')}\n\n¿Te interesa alguno o buscas otra cosa?`;
                }
                return `Lo siento, no encontré productos que coincidan con "${queryRaw}" en nuestro catálogo actual.`;
            }
            
            const results = prods.map((p: any) => `• ${p.name} - $${formatPrice(p.price)}${p.description ? ` (${p.description.substring(0, 50)}...)` : ''}`).join('\n');
            return `He encontrado estas opciones destacadas:\n${results}${prods.length >= 5 ? '\n\n...y algunos más. ¿Buscas algo específico?' : ''}`;
        }

        case 'inventory_check': {
            const queryRaw = (toolArgs?.query || toolArgs?.product_name || '').toLowerCase().trim();
            const query = queryRaw.replace(/^(papas|una|un|el|la|los|las|quiero|ver|busca)\s+/i, '').replace(/s$/, '');

            const synonyms: Record<string, string[]> = {
                'aguacate': ['avocado', 'guacamole', 'avocada'],
                'avocado': ['aguacate', 'guacamole', 'avocada'],
                'avocada': ['aguacate', 'avocado', 'guacamole'],
                'guacamole': ['aguacate', 'avocado', 'avocada'],
                'tocineta': ['bacon'],
                'bacon': ['tocineta'],
                'queso': ['cheese', 'colby', 'gouda', 'mozzarella'],
                'cheese': ['queso'],
                'carne': ['beef', 'angus', 'burger', 'hamburguesa'],
                'pollo': ['chicken', 'bistecca'],
                'chicken': ['pollo'],
                'hamburguesa': ['burger', 'angus', 'beef'],
                'burger': ['hamburguesa']
            };

            const filters = [
                `name.ilike.%${query}%`,
                `description.ilike.%${query}%`
            ];
            const words = query.split(/\s+/);
            for (const w of words) {
                const cleanWord = w.replace(/s$/, '');
                if (synonyms[cleanWord]) {
                    for (const syn of synonyms[cleanWord]) {
                        filters.push(`name.ilike.%${syn}%`);
                        filters.push(`description.ilike.%${syn}%`);
                    }
                }
            }

            const { data: prods } = await supabase
                .from('products')
                .select('name, is_available, price')
                .eq('merchant_id', merchantId)
                .or(filters.join(','));

            if (!prods || prods.length === 0) return `No encontré información de disponibilidad para "${queryRaw}".`;
            
            // Buscar mejor coincidencia
            let bestProd = prods[0];
            let maxOverlap = 0;
            const queryWords = query.split(/\s+/);
            for (const p of prods) {
                const nameLower = p.name.toLowerCase();
                if (nameLower === query || nameLower.includes(query)) {
                    bestProd = p;
                    break;
                }
                let overlap = 0;
                for (const qw of queryWords) {
                    if (nameLower.includes(qw)) overlap++;
                }
                if (overlap > maxOverlap) {
                    maxOverlap = overlap;
                    bestProd = p;
                }
            }

            return bestProd.is_available
                ? `✅ ${bestProd.name}: Disponible a $${formatPrice(bestProd.price)}`
                : `❌ ${bestProd.name}: No disponible actualmente.`;
        }

        case 'add_to_cart': {
            const queryRaw = (toolArgs?.product_name || toolArgs?.query || '').toLowerCase().trim();
            const quantity = parseInt(toolArgs?.quantity) || 1;
            const notes = toolArgs?.notes || '';
            const query = queryRaw.replace(/^(papas|una|un|el|la|los|las|quiero|ver|busca|agregar|agrega|dame)\s+/i, '').replace(/s$/, '').trim();

            const synonyms: Record<string, string[]> = {
                'aguacate': ['avocado', 'guacamole', 'avocada'],
                'avocado': ['aguacate', 'guacamole', 'avocada'],
                'avocada': ['aguacate', 'avocado', 'guacamole'],
                'guacamole': ['aguacate', 'avocado', 'avocada'],
                'tocineta': ['bacon'],
                'bacon': ['tocineta'],
                'queso': ['cheese', 'colby', 'gouda', 'mozzarella'],
                'cheese': ['queso'],
                'carne': ['beef', 'angus', 'burger', 'hamburguesa'],
                'pollo': ['chicken', 'bistecca'],
                'chicken': ['pollo'],
                'hamburguesa': ['burger', 'angus', 'beef'],
                'burger': ['hamburguesa']
            };

            const filters = [
                `name.ilike.%${query}%`,
                `description.ilike.%${query}%`
            ];
            if (queryRaw && queryRaw !== query) {
                filters.push(`name.ilike.%${queryRaw}%`);
            }
            const words = query.split(/\s+/).filter(w => w.length >= 3);
            for (const w of words) {
                const cleanWord = w.replace(/s$/, '');
                filters.push(`name.ilike.%${cleanWord}%`);
                if (synonyms[cleanWord]) {
                    for (const syn of synonyms[cleanWord]) {
                        filters.push(`name.ilike.%${syn}%`);
                        filters.push(`description.ilike.%${syn}%`);
                    }
                }
            }

            let { data: prods } = await supabase
                .from('products')
                .select('id, name, price, is_available')
                .eq('merchant_id', merchantId)
                .eq('is_available', true)
                .or(filters.join(','));
            
            // Fallback si no encuentra por palabras completas
            if (!prods || prods.length === 0) {
                const broadTerms = words.map(w => `name.ilike.%${w.slice(0, 4)}%`);
                if (broadTerms.length > 0) {
                    const { data: fallbackProds } = await supabase.from('products')
                        .select('id, name, price, is_available')
                        .eq('merchant_id', merchantId)
                        .eq('is_available', true)
                        .or(broadTerms.join(','))
                        .limit(3);
                    if (fallbackProds && fallbackProds.length > 0) {
                        prods = fallbackProds;
                    }
                }
            }
            
            if (!prods || prods.length === 0) return `No encontré el producto "${queryRaw}" en nuestro catálogo o no está disponible.`;
            
            // Encontrar la mejor coincidencia por similitud de nombre
            let bestProd = prods[0];
            let maxOverlap = 0;
            const queryWords = query.split(/\s+/);
            for (const p of prods) {
                const nameLower = p.name.toLowerCase();
                if (nameLower === query || nameLower.includes(query)) {
                    bestProd = p;
                    break;
                }
                let overlap = 0;
                for (const qw of queryWords) {
                    if (nameLower.includes(qw)) overlap++;
                }
                if (overlap > maxOverlap) {
                    maxOverlap = overlap;
                    bestProd = p;
                }
            }

            const prod = bestProd;
            const cart = variables['cart'] || [];
            const existing = cart.find((i: any) => i.id === prod.id);
            
            if (existing) { 
                existing.qty += quantity; 
                if (notes) existing.notes = existing.notes ? `${existing.notes}, ${notes}` : notes;
            } else { 
                cart.push({ id: prod.id, name: prod.name, price: prod.price, qty: quantity, notes }); 
            }
            
            variables['cart'] = cart;
            const total = cart.reduce((acc: number, it: any) => acc + (Number(it.price) * it.qty), 0);
            return `✅ ${prod.name} x${quantity} añadido al carrito${notes ? ` con notas: "${notes}"` : ''}. Total actual del carrito: $${formatPrice(total)}`;
        }

        case 'get_cart': {
            const cart = variables['cart'] || [];
            if (cart.length === 0) return 'Tu carrito está vacío. ¿Te gustaría ver nuestro menú?';
            const total = cart.reduce((acc: number, it: any) => acc + (Number(it.price) * it.qty), 0);
            return `🛒 Tu carrito:\n${cart.map((it: any) => `• ${it.name} x${it.qty} = $${formatPrice(it.price * it.qty)}`).join('\n')}\n\n💰 Total: $${formatPrice(total)}`;
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
            
            const clientName = toolArgs?.customer_name || variables['customer_name'] || variables['nombre_cliente'];
            const clientPhone = toolArgs?.customer_phone || variables['customer_phone'] || variables['telefono_cliente'];
            const address = toolArgs?.address || variables['direccion_entrega'];

            const isInvalidField = (v: any) => !v || typeof v !== 'string' || v.trim() === '' || /^(\.{2,}|no\s*(disponible|aplica|s[ée])|n\/a|por confirmar)$/i.test(v.trim());
            
            // Persistir datos parciales si vienen en la llamada
            if (toolArgs?.customer_name && !isInvalidField(toolArgs.customer_name)) variables['customer_name'] = toolArgs.customer_name;
            if (toolArgs?.customer_phone && !isInvalidField(toolArgs.customer_phone)) variables['customer_phone'] = toolArgs.customer_phone;
            if (toolArgs?.address && !isInvalidField(toolArgs.address)) variables['direccion_entrega'] = toolArgs.address;

            const missing: string[] = [];
            if (isInvalidField(clientName)) missing.push('tu nombre completo');
            if (isInvalidField(clientPhone)) missing.push('tu número de celular');
            if (isInvalidField(address)) missing.push('tu dirección de entrega');

            if (missing.length > 0) {
                return `Para completar el pedido de tu carrito ($${formatPrice(total)}), por favor confírmame ${missing.join(', ')}.`;
            }

            // Actualizar tabla de clientes si tenemos nuevos datos
            if (clientName || clientPhone) {
                const update: any = {};
                if (clientName) update.full_name = clientName;
                if (clientPhone) update.phone = clientPhone;
                await supabase.from('customers').update(update).eq('id', customerId);
            }

            const { data: order, error: orderErr } = await createOrderSafe(supabase, {
                merchant_id: merchantId, customer_id: customerId, total,
                delivery_address: address, status: 'pending', conversation_id: conversationId,
                customer_name: clientName, customer_phone: clientPhone,
                source: 'ai_agent', closing_agent_type: 'ai'
            });
            if (!orderErr && order) {
                const orderNum = `#${order.order_number || order.id.substring(0, 8)}`;
                variables['orderNumber'] = orderNum;
                const items = cart.map((it: any) => ({
                    order_id: order.id, 
                    product_id: it.id, 
                    product_name: it.name,
                    quantity: it.qty, 
                    unit_price: it.price, 
                    subtotal: it.price * it.qty,
                    notes: it.notes || null
                }));
                await supabase.from('order_items').insert(items);
                variables['cart'] = []; // Limpiar carrito tras registrar
                
                // NOTIFICAR SI EL PEDIDO SE CREÓ CORRECTAMENTE
                if (order) {
                   await notifyMerchantAgents(supabase, merchantId, "¡Nuevo Pedido (IA)! 🛵", `Se ha registrado el pedido #${orderNum}\nTotal: $${total.toFixed(2)}`);
                   // Contabilizar orden en SaaS Metering
                   try {
                       await supabase.rpc('track_merchant_usage', {
                           p_merchant_id: merchantId,
                           p_tokens: 0,
                           p_is_ai_message: false,
                           p_order_closed: true,
                           p_order_value: total
                       });
                   } catch (e) {
                       console.warn('[BOT-ENGINE] Error tracking order usage:', e);
                   }
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

        case 'checkout_trigger': {
            variables['_exit_ai_agent'] = true;
            return "SUCCESS: El cliente ha terminado de pedir. Responde con un mensaje corto (ej: '¡Perfecto! Vamos a finalizar.') y NO uses más herramientas. El sistema pedirá los datos a continuación.";
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
        description: 'BUSCA PRODUCTOS AHORA. Úsala inmediatamente cuando el cliente mencione un producto, plato o categoría. Devuelve nombres, precios y descripciones reales. Es obligatorio usarla para saber qué vendemos.',
        parameters: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Nombre del producto, plato o categoría a buscar.' }
            },
            required: ['query']
        }
    },
    inventory_check: {
        name: 'inventory_check',
        description: 'VERIFICA STOCK. Consulta si un producto específico está disponible ahora mismo.',
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
        description: 'AÑADE AL CARRITO. Ejecuta esta herramienta en cuanto el cliente confirme que quiere un producto. No preguntes permiso para usar la herramienta, solo confirma después de añadirlo.',
        parameters: {
            type: 'object',
            properties: {
                product_name: { type: 'string', description: 'Nombre exacto del producto a añadir' },
                quantity: { type: 'number', description: 'Cantidad a añadir. Por defecto 1.' },
                notes: { type: 'string', description: 'Observaciones o notas especiales para el producto' }
            },
            required: ['product_name']
        }
    },
    get_cart: {
        name: 'get_cart',
        description: 'Muestra el contenido actual del carrito del cliente con precios y total. Úsala cuando el cliente quiera ver su pedido o pregunte por su carrito.',
        parameters: { type: 'object', properties: {}, required: [] }
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
        description: 'Registra y confirma el pedido del cliente en el sistema. USA ESTA FUNCIÓN SOLO cuando el cliente confirme explícitamente que desea hacer el pedido. Asegúrate de pedir primero el nombre, teléfono y dirección si no los conoces.',
        parameters: {
            type: 'object',
            properties: {
                address: { type: 'string', description: 'Dirección de entrega' },
                customer_name: { type: 'string', description: 'Nombre completo del cliente' },
                customer_phone: { type: 'string', description: 'Número de teléfono de contacto' }
            },
            required: ['address', 'customer_name', 'customer_phone']
        }
    },
    order_status: {
        name: 'order_status',
        description: 'Consulta el estado de un pedido previo del cliente.',
        parameters: {
            type: 'object',
            properties: {
                order_id: { type: 'string', description: 'Número o ID del pedido a consultar' }
            },
            required: ['order_id']
        }
    },
    transfer_human: {
        name: 'transfer_human',
        description: 'Transfiere la conversación a un agente humano. Úsala cuando el cliente lo solicite explícitamente o cuando no puedas resolver su consulta.',
        parameters: { type: 'object', properties: {}, required: [] }
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
// MODO SIMULADOR: Usa el flow_data enviado desde el frontend
// en lugar de cargarlo desde la base de datos.
// Esto garantiza que el Simulador y WhatsApp usen EL MISMO MOTOR.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export async function processBotFlowWithOverride(
    supabase: any,
    merchantId: string,
    conversationId: string,
    messageText: string,
    customerId: string,
    flowDataOverride: any,   // El flow_data completo (nodos + conexiones) del editor
    flowIdOverride: string,  // ID del flujo (o 'simulator')
    nodeContextOverride?: string  // Prompt del nodo IA activo (si aplica)
): Promise<string> {
    console.log(`[BOT-ENGINE] [SIMULATOR] Procesando: "${messageText}" | conv: ${conversationId}`);

    const nodes = flowDataOverride?.nodes || [];
    const connections = flowDataOverride?.connections || [];

    const startNode = nodes.find((n: any) => n.type === 'start');
    if (!startNode) return "Error: El flujo no tiene nodo de inicio.";

    // Obtener o crear sesión usando el flow_id del simulador
    const { data: session, error: sessionErr } = await supabase.rpc('get_or_create_bot_session', {
        p_conversation_id: conversationId,
        p_merchant_id: merchantId,
        p_flow_id: flowIdOverride,
        p_start_node_id: startNode.id
    });

    if (sessionErr || !session) {
        console.error('[BOT-ENGINE][SIMULATOR] Error de sesión:', sessionErr);
        return `Error al gestionar la sesión: ${sessionErr?.message || 'Error desconocido'}`;
    }

    // Guardar el mensaje en el historial para el simulador
    await supabase.from('bot_flow_history').insert({
        session_id: session.id,
        role: 'user',
        content: messageText
    });

    let currentNodeId: string | null = session.current_node_id;
    let variables: any = session.variables || {};
    let waitingFor: string | null = session.waiting_for;

    // Inyectar datos del comercio en variables
    const { data: merchantData } = await supabase.from('merchants').select('name, menu_pdf_url').eq('id', merchantId).single();
    if (merchantData) {
        variables['merchantName'] = merchantData.name;
        variables['merchant_name'] = merchantData.name;
        variables['merchant_menu_pdf'] = merchantData.menu_pdf_url || '';
        variables['menu_pdf'] = merchantData.menu_pdf_url || '';
    }

    // Si el nodo de IA tiene un contexto específico, inyectarlo en las variables
    // para que el engine lo use en el system prompt
    if (nodeContextOverride) {
        variables['__node_context_override'] = nodeContextOverride;
    }

    // Delegar al procesador de flujos principal (reutiliza toda la lógica de bot-engine.ts)
    // pasando el flujo desde memoria en lugar de desde BD
    return await _processFlowFromState(
        supabase, merchantId, conversationId, messageText, customerId,
        nodes, connections, session, currentNodeId, variables, waitingFor,
        flowIdOverride
    );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FUNCIÓN PRINCIPAL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export async function processBotFlow(supabase: any, merchantId: string, conversationId: string, messageText: string, customerId: string) {

    console.log(`[BOT-ENGINE] Procesando: "${messageText}" | conv: ${conversationId}`);

    // LOG USER MESSAGE TO HISTORY
    const { data: sessionDataForHistory } = await supabase.from('bot_flow_sessions').select('id').eq('conversation_id', conversationId).maybeSingle();
    if (sessionDataForHistory) {
        await supabase.from('bot_flow_history').insert({
            session_id: sessionDataForHistory.id,
            role: 'user',
            content: messageText
        });
    }

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
    if (!startNode) {
        console.error('[BOT-ENGINE] Flujo sin nodo de inicio:', flow.id);
        return "Error: El flujo no tiene nodo de inicio.";
    }

    const { data: session, error: sessionErr } = await supabase.rpc('get_or_create_bot_session', {
        p_conversation_id: conversationId,
        p_merchant_id: merchantId,
        p_flow_id: flow.id,
        p_start_node_id: startNode.id
    });

    if (sessionErr || !session) {
        console.error('[BOT-ENGINE] Error de sesión:', sessionErr);
        return `Error al gestionar la sesión: ${sessionErr?.message || 'Error desconocido'}`;
    }

    let variables: any = session.variables || {};
    const { data: merchantData } = await supabase.from('merchants').select('name, menu_pdf_url').eq('id', merchantId).single();
    if (merchantData) {
        variables['merchantName'] = merchantData.name;
        variables['merchant_name'] = merchantData.name;
        variables['merchant_menu_pdf'] = merchantData.menu_pdf_url || '';
        variables['menu_pdf'] = merchantData.menu_pdf_url || '';
    }

    return await _processFlowFromState(
        supabase, merchantId, conversationId, messageText, customerId,
        nodes, connections, session, session.current_node_id, variables, session.waiting_for, flow.id
    );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MOTOR COMPARTIDO: Producción + Simulador
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function _processFlowFromState(
    supabase: any, merchantId: string, conversationId: string,
    messageText: string, customerId: string,
    nodes: any[], connections: any[], session: any,
    currentNodeId: string | null, variables: any,
    waitingFor: string | null, flowId: string
): Promise<string> {
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

            // AUTO-UPDATE CUSTOMER PROFILE IF CAPTURING IDENTITY DATA
            // IMPORTANTE: NO sobreescribir 'phone' porque es el identificador canónico
            // que usa el webhook de WhatsApp (remoteJid) para encontrar al cliente.
            // Si lo cambiamos, el webhook no lo encontrará y creará una conversación nueva.
            if (customerId) {
                const nameVars = ['customer_name', 'nombre_cliente', 'nombre', 'name'];
                const phoneVars = ['customer_phone', 'telefono_cliente', 'telefono', 'phone'];
                const identityUpdate: any = {};
                
                if (nameVars.includes(varName)) identityUpdate.full_name = messageText.trim();
                // Guardar teléfono de contacto en metadata, NO en el campo 'phone' principal
                if (phoneVars.includes(varName)) identityUpdate.metadata = { ...(variables['_customer_metadata'] || {}), contact_phone: messageText.trim() };
                
                if (Object.keys(identityUpdate).length > 0) {
                    await supabase.from('customers').update(identityUpdate).eq('id', customerId);
                }
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
        const currentNode = nodes.find((n: any) => n.id === currentNodeId);
        if (currentNode?.type === 'ai_agent') {
            waitingFor = null;
        }
    } else if (waitingFor === 'condition') {
        waitingFor = null;
    }

    // 4. Recorrer el flujo hasta pausar o terminar
    const messagesToReturn: string[] = [];
    let loopCount = 0;
    const MAX_LOOPS = 20;

    // Variables de compatibilidad para los bloques n8n_agent que las referencian
    const sessionId: string = session.id;
    const lastUserMessage: string = messageText;
    const historyLogs: any[] = []; // Historial simplificado para n8n (sin acceso a BD aquí)

    const debugLogs: string[] = [];
    while (currentNodeId && loopCount < MAX_LOOPS) {
        loopCount++;
        const node = nodes.find((n: any) => n.id === currentNodeId);
        if (!node) {
            debugLogs.push(`[ERROR] Nodo no encontrado: ${currentNodeId}`);
            console.error(`[BOT-ENGINE] ERROR: No se encontró el nodo con ID: ${currentNodeId}. Reiniciando al inicio.`);
            const startNode = nodes.find((n: any) => n.type === 'start');
            if (startNode) {
                currentNodeId = startNode.id;
                continue;
            }
            break;
        }
        debugLogs.push(`[LOOP ${loopCount}] Node: ${node.data?.label || node.type} (${node.id})`);
        console.log(`[BOT-ENGINE] LOOP ${loopCount} | Nodo: ${node.data?.label || node.type} (${node.id})`);

        // ── ACCIÓN ──────────────────────────────────
        if (node.type === 'action') {
            await executeAction(supabase, node, variables, merchantId, conversationId, customerId);
        }

        // ── AGENTE IA (CON FUNCTION CALLING REAL) ───
        // ── AGENTE N8N GLOBAL ───────────────────────
        if (node.type === 'n8n_agent') {
            console.log(`[ENGINE] Nodo Agente n8n: ${node.data.n8n_webhook_url}`);
            const webhookUrl = node.data.n8n_webhook_url;
            if (!webhookUrl) {
                console.error("[ENGINE] No webhook URL for n8n_agent");
                break;
            }

            try {
                // Preparar historial simplificado para n8n
                const history = historyLogs.slice(-10).map(h => ({
                    role: h.sender === 'bot' ? 'assistant' : 'user',
                    content: h.message
                }));

                const response = await fetch(webhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        merchant_id: merchantId,
                        customer_id: customerId,
                        session_id: sessionId,
                        message: lastUserMessage,
                        history,
                        mcp_server: node.data.mcp_server_url || `${Deno.env.get('SUPABASE_URL')}/functions/v1/mcp-woox?merchant_id=${merchantId}`,
                        prompt: node.data.prompt
                    })
                });

                if (response.ok) {
                    const data = await response.json();
                    const aiText = data.output || data.text || data.message || "";
                    if (aiText) {
                        messagesToReturn.push(aiText);
                    }
                    
                    // n8n puede devolver variables para actualizar en Woox
                    if (data.variables) {
                        Object.assign(variables, data.variables);
                    }

                    // IMPORTANTE: Si n8n responde, nos quedamos en este nodo para el siguiente mensaje
                    // a menos que el flujo tenga una conexión de salida explícita y n8n haya terminado su tarea.
                    if (data.action === 'next') {
                        const conn = connections.find((c: any) => c.from === currentNodeId && (c.fromPort === 'output' || !c.fromPort));
                        if (conn) { currentNodeId = conn.to; continue; } else break;
                    } else if (data.action === 'stop') {
                        break;
                    } else {
                        // Por defecto, nos quedamos aquí para seguir conversando con n8n
                        break; 
                    }
                } else {
                    console.error(`[ENGINE] n8n error: ${response.status}`);
                    break;
                }
            } catch (err) {
                console.error('[ENGINE] n8n_agent fetch error:', err);
                break;
            }
        }

        if (node.type === 'ai_agent') {
            const userTemplate = node.data.user_prompt || '{{message}}';
            const temp = node.data.temperature ?? 0.7;
            const memoryLimit = node.data.memory_limit ?? 6;

            try {
                // ── 1. CONSULTAS PARALELAS A BD ────────────────────────────
                const [merchantRes, platformRes, promptRes, histRes] = await Promise.all([
                    supabase.from('merchants').select('name, ai_api_key, ai_keys, ai_model, ai_api_url, ai_provider').eq('id', merchantId).single(),
                    supabase.from('platform_settings').select('ai_api_key, ai_model').eq('id', 'global').maybeSingle(),
                    supabase.rpc('get_compiled_prompt', { p_merchant_id: merchantId }),
                    memoryLimit > 0
                        ? supabase.from('bot_flow_history').select('role, content').eq('session_id', session.id).order('created_at', { ascending: false }).limit(memoryLimit)
                        : Promise.resolve({ data: [] })
                ]);

                const merchant = merchantRes.data;
                const platform = platformRes.data;
                const compiledPrompt = promptRes.data;
                const history = histRes.data ? histRes.data.reverse() : [];

                if (promptRes.error) console.error('[BOT-ENGINE] Error al obtener prompt centralizado:', promptRes.error);

                // ── 2. RESOLVER CONFIG DE IA (Adaptador Unificado) ─────────
                const aiConfig = resolveAIConfig(merchant, node.data, platform, {
                    temperature: temp,
                    maxTokens: 1024
                });

                if (!aiConfig.apiKey) {
                    messagesToReturn.push('⚠️ Configuración de IA no disponible. Contacta a soporte.');
                    waitingFor = 'ai_input'; break;
                }

                // ── 3. GUARDAR MENSAJE DEL USUARIO EN HISTORIAL ───────────
                const { data: lastHist } = await supabase.from('bot_flow_history')
                    .select('role, content')
                    .eq('session_id', session.id)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (!lastHist || (lastHist.role !== 'user' || lastHist.content !== messageText.trim())) {
                    await supabase.from('bot_flow_history').insert({
                        session_id: session.id,
                        role: 'user',
                        content: messageText.trim()
                    });
                    const { data: newHist } = await supabase.from('bot_flow_history')
                        .select('role, content')
                        .eq('session_id', session.id)
                        .order('created_at', { ascending: false })
                        .limit(memoryLimit);
                    history.length = 0;
                    if (newHist) history.push(...newHist.reverse());
                }

                // ── 4. CARGAR SKILLS (HERRAMIENTAS) ───────────────────────
                const skillConns = connections.filter((c: any) => c.to === node.id && c.toPort === 'skills_in');
                const skills = skillConns.map((c: any) => nodes.find((n: any) => n.id === c.from)).filter((n: any) => n?.type === 'ai_skill');
                const toolDefs: AIToolDef[] = skills.map((s: any) => {
                    const def = TOOL_DEFINITIONS[s.data.actionType];
                    if (def) {
                        const customized = { ...def };
                        if (s.data.message) customized.description = s.data.message;
                        return customized;
                    }
                    return null;
                }).filter((d: any) => d !== null);

                console.log(`[BOT-ENGINE] Skills cargadas: ${toolDefs.map(t => t.name).join(', ') || 'ninguna'}`);

                // ── 5. CONSTRUIR SYSTEM PROMPT ────────────────────────────
                const systemPrompt = `
${compiledPrompt || 'Eres un asistente de ventas amigable.'}

### INSTRUCCIONES ESPECÍFICAS DE ESTA ETAPA:
${node.data.prompt || ''}

### INSTRUCCIONES OPERATIVAS:
1. USA LAS HERRAMIENTAS NATIVAS: No escribas el nombre de la herramienta en texto ni uses corchetes como [UPDATE_CART]. Usa la función técnica real de function calling.
2. NO EXPLIQUES TUS ACCIONES: No digas "Voy a usar la herramienta...". Simplemente úsala y presenta los resultados.
3. PRIORIZA EL CATÁLOGO: Solo ofrece productos que encuentres con catalog_search.
4. AGREGAR AL CARRITO INMEDIATAMENTE: Si el cliente indica que quiere un producto (ej: 'quiero una real avocado', 'dame 2 clasicas', o afirmativo tras recomendar algo), DEBES llamar a la herramienta 'add_to_cart' de inmediato con su cantidad. No pidas confirmación doble para agregar; ¡agrégalo y confírmale con entusiasmo!
5. CONFIRMA EL CARRITO ACTUAL: En cada respuesta tras agregar o consultar, menciona claramente qué productos están en el carrito y cuál es el total.
6. CIERRE INTELIGENTE (HÍBRIDO vs AUTÓNOMO):
   - Si dispones de la herramienta 'checkout_trigger' (flujo híbrido con formulario visual posterior): cuando el cliente diga 'eso es todo', 'nada más', 'quiero pagar', 'no' o termine de pedir, LLAMA INMEDIATAMENTE A 'checkout_trigger'. NO pidas nombre ni dirección en el chat.
   - Si NO tienes 'checkout_trigger' pero sí 'register_order' (flujo autónomo): pide amablemente en un solo mensaje Nombre completo, Dirección y Celular. En cuanto te los proporcione, llama a 'register_order'. Tienes prohibido volver a listar el catálogo cuando el cliente ya te está dando sus datos.
7. RESPUESTAS CORTAS: Sé amable, vendedor y mantén tus respuestas breves (máximo 3 párrafos).
8. VERACIDAD ABSOLUTA: Toda información de ingredientes y precios debe provenir de 'catalog_search'. Prohibido inventar productos o negociar precios.
9. MANEJO DE NEGATIVAS ('No'): Si el cliente responde 'no' a tu pregunta de si desea algo más, procede de inmediato a cerrar (usando 'checkout_trigger' si está presente, o pidiendo datos de envío). Nunca muestres el menú completo tras un 'no'.

### ESTADO ACTUAL DE LA SESIÓN:
- Tienda: ${merchant?.name || 'Nuestra tienda'}
- Carrito del cliente: ${variables['cart']?.length > 0 ? variables['cart'].map((it: any) => it.name + ' x' + it.qty + ' ($' + (it.price * it.qty) + ')').join(', ') : 'vacío'}
- Número de pedido activo: ${variables['orderNumber'] || 'ninguno'}
- Herramienta de cierre presente: ${toolDefs.some(t => t.name === 'checkout_trigger') ? 'checkout_trigger (Flujo Híbrido -> NO pedir datos en chat)' : (toolDefs.some(t => t.name === 'register_order') ? 'register_order (Cierre Autónomo -> Pedir datos en chat)' : 'ninguna')}
`;
                const finalUserMessage = userTemplate.replace('{{message}}', messageText);

                // ── 6. CONSTRUIR HISTORIAL EN FORMATO UNIVERSAL ───────────
                const aiMessages: AIMessage[] = [
                    { role: 'system', content: systemPrompt }
                ];

                let lastMsgRole = 'system';
                for (const m of (history || [])) {
                    const role: 'user' | 'assistant' = m.role === 'user' ? 'user' : 'assistant';
                    if (role !== lastMsgRole) {
                        aiMessages.push({ role, content: m.content });
                        lastMsgRole = role;
                    } else if (aiMessages.length > 0) {
                        aiMessages[aiMessages.length - 1].content += '\n' + m.content;
                    }
                }

                // Asegurar que el último mensaje sea del usuario
                if (lastMsgRole !== 'user') {
                    aiMessages.push({ role: 'user', content: finalUserMessage });
                }

                // ── 7. LLAMAR AL MODELO (ADAPTADOR UNIFICADO) ─────────────
                const result = await callUnifiedAI(
                    aiConfig,
                    aiMessages,
                    toolDefs,
                    async (name: string, args: any) => {
                        return await executeAgentTool(supabase, name, args, variables, merchantId, conversationId, customerId);
                    }
                );

                // ── 8. PROCESAR RESULTADO ─────────────────────────────────
                debugLogs.push(...result.debugLogs);

                if (result.text) {
                    messagesToReturn.push(result.text);
                    await supabase.from('bot_flow_history').insert({
                        session_id: session.id,
                        role: 'assistant',
                        content: result.text
                    });

                    // Registrar consumo en SaaS Metering
                    try {
                        const estimatedTokens = Math.ceil((systemPrompt.length + finalUserMessage.length + result.text.length) / 4);
                        await supabase.rpc('track_merchant_usage', {
                            p_merchant_id: merchantId,
                            p_tokens: estimatedTokens,
                            p_is_ai_message: true,
                            p_is_outbound: true
                        });
                    } catch (mErr) {
                        console.warn('[BOT-ENGINE] Error tracking AI usage:', mErr);
                    }
                } else {
                    console.log('[BOT-ENGINE] Sin respuesta de texto del modelo.');
                    const generic = `Lo siento, tuve un problema. DEBUG:\n${debugLogs.join('\n')}`;
                    messagesToReturn.push(generic);
                }

                // ── 9. CHECKOUT TRIGGER (Válvula de Escape) ───────────────
                if (variables['_exit_ai_agent']) {
                    console.log('[BOT-ENGINE] AI Agent triggered exit via checkout_trigger. Avanzando al siguiente nodo.');
                    delete variables['_exit_ai_agent'];
                    const outConn = connections.find((c: any) => c.from === node.id && (c.fromPort === 'output' || !c.fromPort));
                    if (outConn) {
                        currentNodeId = outConn.to;
                        continue; // Avanzar en el flujo
                    } else {
                        break;
                    }
                }

            } catch (err: any) {
                console.error('[BOT-ENGINE] Error en AI Agent:', err);
                messagesToReturn.push(`Ocurrió un error procesando tu solicitud. Error: ${err.message || String(err)}`);
                debugLogs.push(`[GLOBAL-AI-ERROR] ${err.message || String(err)}`);
            }

            // El AI Agent siempre pausa para esperar el siguiente mensaje a menos que se haya disparado el trigger
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
            let url = resolveVariables(node.data.api_url, variables, variables['merchant_name']);
            let body = node.data.api_body ? resolveVariables(node.data.api_body, variables, variables['merchant_name']) : undefined;
            
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

        // ── ENVIAR PDF ───────────────────────────────
        if (node.type === 'send_pdf' && node.data.pdf_url) {
            const pdfUrl = resolveVariables(node.data.pdf_url, variables, variables['merchant_name']);
            const pdfCaption = node.data.pdf_caption ? resolveVariables(node.data.pdf_caption, variables, variables['merchant_name']) : '';
            console.log(`[BOT-ENGINE] Resolviendo PDF: ${pdfUrl}`);
            if (pdfUrl) {
                messagesToReturn.push(`[PDF:${pdfUrl}:${pdfCaption}]`);
            } else {
                console.warn(`[BOT-ENGINE] PDF URL resolved as empty for node ${node.id}`);
            }
        }

        // ── CATEGORÍA 2: CONTEXTO Y MEMORIA ──────────
        if (node.type === 'memory_extract' && node.data.memory_prompt && node.data.memory_key) {
            console.log(`[BOT-ENGINE] Extrayendo a memoria clave: ${node.data.memory_key}`);
            const prompt = resolveVariables(node.data.memory_prompt, variables, variables['merchant_name']);
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
            const val = resolveVariables(node.data.variable_value || '', variables, variables['merchant_name']);
            variables[key] = val;
            console.log(`[BOT-ENGINE] Set Variable: ${key} = ${val}`);
        }

        if (node.type === 'db_query' && node.data.db_table) {
            console.log(`[BOT-ENGINE] DB Query: ${node.data.db_operation} en ${node.data.db_table}`);
            const op = node.data.db_operation || 'select';
            const col = node.data.db_column || 'id';
            const rawVal = resolveVariables(node.data.db_value || '', variables, variables['merchant_name']);
            
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
            const to = resolveVariables(node.data.email_to || '', variables, variables['merchant_name']);
            const subject = resolveVariables(node.data.email_subject || '', variables, variables['merchant_name']);
            const body = resolveVariables(node.data.email_body || '', variables, variables['merchant_name']);
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
            const params = node.data.wa_template_params?.map((p: string) => resolveVariables(p, variables, variables['merchant_name'])) || [];
            console.log(`[BOT-ENGINE] Sending WA Template ${template} with params:`, params);
            // Mock send
            const conn = connections.find((c: any) => c.from === currentNodeId && (c.fromPort === 'output' || !c.fromPort));
            if (conn) { currentNodeId = conn.to; continue; } else break;
        }

        if (node.type === 'catalog_search') {
            const query = node.data.query ? resolveVariables(node.data.query, variables, variables['merchant_name']) : '';
            console.log(`[BOT-ENGINE] Manual Catalog Search: query="${query}"`);
            
            // Reusar la lógica de búsqueda de la herramienta para consistencia
            const toolResult = await executeAgentTool(supabase, 'catalog_search', { query }, variables, merchantId, conversationId, customerId);
            messagesToReturn.push(toolResult);
            
            const conn = connections.find((c: any) => c.from === currentNodeId && (c.fromPort === 'output' || !c.fromPort));
            if (conn) { currentNodeId = conn.to; continue; } else break;
        }

        if (node.type === 'cart_summary') {
            const cart = variables['cart'] || [];
            if (cart.length === 0) {
                messagesToReturn.push('🛍️ Tu carrito está vacío.');
            } else {
                const summary = cart.map((it: any) => it.name + ' x' + it.qty + ' ($' + (it.price * it.qty) + ')').join('\n');
                const total = cart.reduce((acc: number, it: any) => acc + (Number(it.price) * it.qty), 0);
                messagesToReturn.push('🛍️ Resumen de tu carrito:\n\n' + summary + '\n\n💰 *Total: $' + total + '*');
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
            const startStr = resolveVariables(node.data.start_time || '{{fecha_cita}} {{hora_cita}}', variables, variables['merchant_name']);
            const pax = parseInt(resolveVariables(node.data.pax || '1', variables, variables['merchant_name'])) || 1;
            
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
            const startStr = resolveVariables(node.data.start_time || '{{fecha_cita}} {{hora_cita}}', variables, variables['merchant_name']);
            const pax = parseInt(resolveVariables(node.data.pax || '1', variables, variables['merchant_name'])) || 1;
            
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
            let msg = resolveVariables(node.data.message, variables, variables['merchant_name']);
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
            debugLogs.push(`[WAIT] Question: ${node.data?.label || node.type}. Waiting for input.`);
            waitingFor = 'input'; break;
        } else if (node.type === 'menu') {
            debugLogs.push(`[WAIT] Menu: ${node.data?.label || node.type}. Waiting for selection.`);
            waitingFor = 'menu_selection'; break;
        } else if (node.type === 'end') {
            debugLogs.push(`[END] Flujo finalizado en nodo: ${node.data?.label || node.type}`);
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
        status: 'active' // Mantenemos siempre activo para evitar reinicios accidentales
    }).eq('id', session.id);

    // Guardar logs de depuración en la conversación
    try {
        const { data: currentConv } = await supabase.from('conversations').select('typing_data').eq('id', conversationId).maybeSingle();
        if (currentConv) {
            await supabase.from('conversations').update({
                typing_data: { 
                    ...(currentConv?.typing_data || {}), 
                    bot_debug: debugLogs.slice(-10) 
                }
            }).eq('id', conversationId);
        }
    } catch (e) {
        console.warn('[BOT-ENGINE] No se pudo guardar bot_debug en conversación:', e);
    }

    const finalResponse = messagesToReturn.join('\n\n');
    
    // Save non-AI responses to history too
    if (finalResponse && !messagesToReturn.some(m => !m.startsWith('[PDF:'))) { // Simplified check
        // We only save here if it wasn't already saved by the AI agent logic
        // But to be safe and consistent, we should probably save all bot responses
        // However, we must avoid duplicates.
        // For now, let's just make sure we return a string.
    }

    return finalResponse || "No pude procesar tu solicitud.";
}
