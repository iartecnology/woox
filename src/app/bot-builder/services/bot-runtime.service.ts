import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../supabase.service';

export interface BotResponse {
    messages: string[];
    session: any;
    executionPath?: any[]; // Array de nodos ejecutados en este paso
    totalNodes?: number;
    allNodes?: { id: string, label: string, type: string }[];
    options?: any[]; // Opciones de menú si aplica
    completed?: boolean; // true cuando el nodo 'end' fue alcanzado
}

@Injectable({
    providedIn: 'root'
})
export class BotRuntimeService {
    private supabase = inject(SupabaseService);

    /**
     * Procesa un mensaje del usuario contra el flujo activo.
     */
    async processMessage(
        conversationId: string,
        merchantId: string,
        userMessage: string
    ): Promise<BotResponse | null> {

        // 1. ¿El merchant tiene un flujo activo?
        const { data: flow, error: flowErr } = await this.supabase.getActiveBotFlow(merchantId);
        if (flowErr || !flow) return null;

        // 1.1 Cargar info del comercio (para variables como merchant_menu_pdf)
        const { data: merchant } = await this.supabase.getMerchantById(merchantId);

        const flowData = flow.flow_data;
        const nodes = flowData.nodes || [];
        const startNode = nodes.find((n: any) => n.type === 'start');
        if (!startNode) return null;

        // 2. Obtener o crear sesión
        const { data: session, error: sessErr } = await this.supabase.getOrCreateBotSession(
            conversationId,
            merchantId,
            flow.id,
            startNode.id
        );
        if (sessErr || !session) return null;

        // Inyectar info del comercio en las variables para resolución
        if (merchant) {
            session.variables = {
                ...(session.variables || {}),
                merchant_name: merchant.name || '',
                merchant_menu_pdf: merchant.menu_pdf_url || '',
                menu_pdf: merchant.menu_pdf_url || ''
            };
        }

        // 3a. Sesión completada → No procesar más mensajes
        if (session.status === 'completed' || session.status === 'transferred') {
            return { messages: [], session, completed: true };
        }

        // 3b. ¿Es sesión recién creada (sin waiting_for)? → Enviar mensaje del START y avanzar
        if (!session.waiting_for) {
            const startMessage = this.resolveVariables(startNode.data?.message || '', session.variables, flow);
            const nextNodeId = this.getNextNodeId(flowData, startNode.id, 'output');
            const nextNode = nodes.find((n: any) => n.id === nextNodeId);
            
            const response = await this.advanceAndCollect(flowData, nextNode, session, flow);
            return { 
                messages: startMessage ? [startMessage, ...response.messages] : response.messages, 
                session: response.session,
                totalNodes: nodes.length,
                allNodes: nodes.map((n: any) => ({ id: n.id, label: n.data?.label || n.type, type: n.type })),
                executionPath: response.executionPath
            };
        }

        // 4. Sesión existente → Procesar input según el nodo actual
        const currentNode = nodes.find((n: any) => n.id === session.current_node_id);
        if (!currentNode) {
            // El nodo guardado ya no existe en el flujo (flujo regenerado).
            // Reiniciar la sesión desde el inicio automáticamente.
            console.warn('[BotRuntime] Nodo no encontrado, reinicinado flujo...');
            const startNode = nodes.find((n: any) => n.type === 'start');
            if (startNode) {
                const nextNodeId = this.getNextNodeId(flowData, startNode.id, 'output');
                const nextNode = nodes.find((n: any) => n.id === nextNodeId);
                session.variables = {
                    merchant_name: merchant?.name || '',
                    merchant_menu_pdf: merchant?.menu_pdf_url || '',
                    menu_pdf: merchant?.menu_pdf_url || ''
                };
                const response = await this.advanceAndCollect(flowData, nextNode, session, flow);
                return {
                    messages: ['🔄 El flujo fue actualizado. Reiniciando...', ...response.messages],
                    session: response.session,
                    totalNodes: nodes.length,
                    allNodes: nodes.map((n: any) => ({ id: n.id, label: n.data?.label || n.type, type: n.type })),
                    executionPath: response.executionPath
                };
            }
            return { messages: ['⚠️ Error: Flujo no configurado correctamente.'], session };
        }

        const response = await this.handleUserInput(flowData, currentNode, userMessage, session, flow);
        if (response) {
            response.totalNodes = nodes.length;
            response.allNodes = nodes.map((n: any) => ({ id: n.id, label: n.data?.label || n.type, type: n.type }));
        }
        return response;
    }

    private async handleUserInput(
        flowData: any,
        currentNode: any,
        userInput: string,
        session: any,
        flow: any
    ): Promise<BotResponse> {
        const nodes = flowData.nodes || [];
        const cleanedInput = userInput.trim().toLowerCase();

        // Comando global de reinicio (Volver / Inicio)
        if (['0', 'volver', 'inicio', 'menu', 'menú', 'salir', 'reiniciar'].includes(cleanedInput)) {
            const startNode = nodes.find((n: any) => n.type === 'start');
            if (startNode) {
                const nextNodeId = this.getNextNodeId(flowData, startNode.id, 'output');
                const nextNode = nodes.find((n: any) => n.id === nextNodeId);
                if (nextNode) {
                    // Reiniciar variables pero manteniendo las info del comercio
                    const { data: merchant } = await this.supabase.getMerchantById(session.merchant_id);
                    session.variables = {
                        merchant_name: merchant?.name || '',
                        merchant_menu_pdf: merchant?.menu_pdf_url || '',
                        menu_pdf: merchant?.menu_pdf_url || ''
                    };
                    return await this.advanceAndCollect(flowData, nextNode, session, flow);
                }
            }
        }

        if (currentNode.type === 'question') {
            // Validar y guardar variable
            const validation = currentNode.data?.validation || 'text';
            if (!this.validateInput(userInput, validation)) {
                return { 
                    messages: [`⚠️ Por favor ingresa un ${validation} válido.`], 
                    session 
                };
            }

            const variableName = currentNode.data?.variable || 'last_input';
            const variables = { ...(session.variables || {}), [variableName]: userInput };
            session.variables = variables;

            const nextNodeId = this.getNextNodeId(flowData, currentNode.id, 'output');
            const nextNode = nodes.find((n: any) => n.id === nextNodeId);
            return await this.advanceAndCollect(flowData, nextNode, session, flow);
        }

        if (currentNode.type === 'menu') {
            const options = currentNode.data?.options || [];
            const selectedOption = this.matchMenuOption(userInput, options);
            
            if (!selectedOption) {
                const optionsText = options.map((o: any, i: number) => `${i + 1}. ${o.text}`).join('\n');
                const retryMsg = (currentNode.data?.message || '') + '\n\n' + optionsText;
                return { 
                    messages: [`No entendí tu elección. Elige una opción:\n${optionsText}`], 
                    session 
                };
            }

            const nextNodeId = this.getNextNodeId(flowData, currentNode.id, selectedOption.id);
            const nextNode = nodes.find((n: any) => n.id === nextNodeId);

            const val = selectedOption.value || selectedOption.id;
            const parts = String(val).split('|');

            // Guardar variables del producto o recurso seleccionado
            session.variables = {
                ...(session.variables || {}),
                resource_id: parts[0],
                selected_product_id: parts[0],
                selected_product_price: parts[1] || 0,
                selected_product_name: selectedOption.text,
                __resource_name: selectedOption.text,
                __reservation_stage: 'day_selection'  // iniciar etapas de reserva si aplica
            };

            return await this.advanceAndCollect(flowData, nextNode, session, flow);
        }

        if (currentNode.type === 'ai_agent') {
            const variables = session.variables || {};
            // Simulación básica de respuesta de IA para el runtime client-side
            const response = `🤖 [IA]: He recibido tu mensaje: "${userInput}". Usando mis habilidades integradas, estoy procesando tu solicitud para asistirte mejor. ¿En qué más puedo ayudarte?`;
            
            const nextNodeId = this.getNextNodeId(flowData, currentNode.id, 'output');
            const nextNode = nodes.find((n: any) => n.id === nextNodeId);
            const nextResponse = await this.advanceAndCollect(flowData, nextNode, session, flow);
            
            return {
                messages: [response, ...nextResponse.messages],
                session: nextResponse.session
            };
        }

        if (currentNode.type === 'reservation_check') {
            const stage = session.variables?.__reservation_stage || 'day_selection';
            const variables = { ...(session.variables || {}) };

            // ── ETAPA 1: El usuario eligió el DÍA ──────────────────────────────────
            if (stage === 'day_selection') {
                const dayOptions = this.getNextDays(7);
                const idx = parseInt(userInput.trim(), 10);
                const selectedDay = (idx >= 1 && idx <= dayOptions.length)
                    ? dayOptions[idx - 1]
                    : dayOptions.find((d: string) => d.toLowerCase().includes(userInput.toLowerCase().trim()));

                if (!selectedDay) {
                    const list = dayOptions.map((d: string, i: number) => `${i + 1}. ${d}`).join('\n');
                    return { messages: [`Por favor elige un número de la lista:\n\n${list}`], session };
                }

                variables.__selected_day = selectedDay;
                variables.__reservation_stage = 'hour_selection';
                session.variables = variables;
                await this.updateSession(session, currentNode.id, 'input');

                // Generar slots de hora (cada 30 min entre 8am y 6pm)
                const slots = this.getTimeSlots();
                const slotsText = slots.map((s: string, i: number) => `${i + 1}. ${s}`).join('\n');
                return { messages: [`✅ ${selectedDay} anotado.\n\n🕐 ¿A qué hora te viene mejor?\n\n${slotsText}`], session };
            }

            // ── ETAPA 2: El usuario eligió la HORA ────────────────────────────────
            if (stage === 'hour_selection') {
                const slots = this.getTimeSlots();
                const idx = parseInt(userInput.trim(), 10);
                const selectedTime = (idx >= 1 && idx <= slots.length)
                    ? slots[idx - 1]
                    : slots.find((s: string) => s.includes(userInput.trim()));

                if (!selectedTime) {
                    const slotsText = slots.map((s: string, i: number) => `${i + 1}. ${s}`).join('\n');
                    return { messages: [`Por favor elige un número de la lista:\n\n${slotsText}`], session };
                }

                variables.__selected_time = selectedTime;
                variables.__reservation_stage = 'confirm';
                session.variables = variables;
                await this.updateSession(session, currentNode.id, 'input');

                const day = variables.__selected_day;
                const resourceName = variables.__resource_name || 'el servicio';
                return { messages: [`📋 Resumen de tu cita:\n\n👨‍⚕️ Especialista: ${resourceName}\n📅 Día: ${day}\n🕐 Hora: ${selectedTime}\n\n¿Confirmas? Escribe *sí* para confirmar o *no* para volver.`], session };
            }

            // ── ETAPA 3: El usuario CONFIRMA o CANCELA ─────────────────────────────
            if (stage === 'confirm') {
                const answer = userInput.toLowerCase().trim();

                if (answer === 'no' || answer === 'cancelar') {
                    variables.__reservation_stage = 'day_selection';
                    session.variables = variables;
                    await this.updateSession(session, currentNode.id, 'input');
                    const dayOptions = this.getNextDays(7);
                    const list = dayOptions.map((d: string, i: number) => `${i + 1}. ${d}`).join('\n');
                    return { messages: [`🔄 De acuerdo, volvemos a empezar.\n\n📅 ¿Para qué día te gustaría agendar?\n\n${list}`], session };
                }

                if (['sí', 'si', 'yes', '1', 'confirmar', 'ok'].includes(answer)) {
                    // Avanzar al nodo reservation_create (puerto 'available')
                    variables.__reservation_stage = null;
                    variables.booking_start = `${variables.__selected_day} ${variables.__selected_time}`;
                    session.variables = variables;

                    const nextAvailId = this.getNextNodeId(flowData, currentNode.id, 'available');
                    const nextNode = nodes.find((n: any) => n.id === nextAvailId);
                    return await this.advanceAndCollect(flowData, nextNode, session, flow);
                }

                // No entendió
                return { messages: ['Por favor escribe *sí* para confirmar o *no* para cancelar.'], session };
            }
        }

        return { messages: ['Lo siento, hubo un error en el flujo.'], session };
    }

    /** Genera los próximos N días hábiles como strings */
    private getNextDays(count: number): string[] {
        const days = [];
        const names = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
        const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
        const today = new Date();
        let added = 0;
        let offset = 0;
        while (added < count) {
            offset++;
            const d = new Date(today);
            d.setDate(today.getDate() + offset);
            const dow = d.getDay();
            if (dow !== 0 && dow !== 6) { // excluir sábado y domingo
                days.push(`${names[dow]} ${d.getDate()} ${months[d.getMonth()]}`);
                added++;
            }
        }
        return days;
    }

    /** Genera slots de tiempo de 8am a 6pm cada 30 min */
    private getTimeSlots(): string[] {
        const slots = [];
        for (let h = 8; h < 18; h++) {
            slots.push(`${String(h).padStart(2,'0')}:00`);
            slots.push(`${String(h).padStart(2,'0')}:30`);
        }
        return slots; // 20 slots
    }



    private async advanceAndCollect(
        flowData: any,
        node: any,
        session: any,
        flow: any
    ): Promise<BotResponse> {
        const messages: string[] = [];
        const executionPath: any[] = []; 
        const nodes = flowData.nodes || [];

        let iterations = 0;
        const maxIterations = 50;

        while (node && iterations < maxIterations) {
            iterations++;
            executionPath.push({ id: node.id, type: node.type, label: node.data?.label || node.type });
            switch (node.type) {
                case 'message':
                    const msg = node.data?.message;
                    if (msg) messages.push(this.resolveVariables(msg, session.variables, flow));
                    const nextMsgNodeId = this.getNextNodeId(flowData, node.id, 'output');
                    node = nodes.find((n: any) => n.id === nextMsgNodeId);
                    break;

                case 'send_pdf':
                    const pdfUrl = this.resolveVariables(node.data?.pdf_url || '', session.variables, flow);
                    const pdfCaption = this.resolveVariables(node.data?.pdf_caption || '', session.variables, flow);
                    if (pdfUrl) {
                        messages.push(`[PDF:${pdfUrl}:${pdfCaption || 'Documento PDF'}]`);
                    }
                    const nextPdfNodeId = this.getNextNodeId(flowData, node.id, 'output');
                    node = nodes.find((n: any) => n.id === nextPdfNodeId);
                    break;

                case 'question':
                    const qMsg = node.data?.message || node.data?.question;
                    if (qMsg) messages.push(this.resolveVariables(qMsg, session.variables, flow));
                    await this.updateSession(session, node.id, 'input');
                    return { messages, session, executionPath };

                case 'menu':
                    const mMsg = node.data?.message || node.data?.label || 'Por favor elige una opción:';
                    const menuMsg = this.resolveVariables(mMsg, session.variables, flow);
                    const mOptions = node.data?.options || [];
                    const optionsText = mOptions.map((o: any, i: number) => `${i + 1}. ${o.text}`).join('\n');
                    messages.push(`${menuMsg}\n\n${optionsText}`);
                    await this.updateSession(session, node.id, 'menu_selection');
                    return { messages, session, executionPath, options: mOptions };

                case 'reservation_check':
                    // Iniciar etapas de reserva: pedir día primero
                    const dayList = this.getNextDays(7);
                    const dayOpts = dayList.map((d: string, i: number) => `${i + 1}. ${d}`).join('\n');
                    messages.push(`📅 ¿Para qué día te gustaría agendar?\n\n${dayOpts}`);
                    // CRUCIAL: guardar el nodo reservation_check como nodo actual + stage inicial
                    session.variables = {
                        ...(session.variables || {}),
                        __reservation_stage: 'day_selection'
                    };
                    await this.updateSession(session, node.id, 'input');
                    return { messages, session, executionPath };


                case 'condition':
                    const result = this.evaluateCondition(node.data, session.variables);
                    const nextCondNodeId = this.getNextNodeId(flowData, node.id, result ? 'yes' : 'no');
                    node = nodes.find((n: any) => n.id === nextCondNodeId);
                    break;

                case 'action':
                    const actionResult = await this.executeAction(node.data, session);
                    if (actionResult) messages.push(actionResult);
                    const nextActNodeId = this.getNextNodeId(flowData, node.id, 'output');
                    node = nodes.find((n: any) => n.id === nextActNodeId);
                    break;

                case 'ai_agent':
                    const aiMsg = node.data?.message || '🧠 [Agente Inteligente]: Hola, ¿cómo puedo ayudarte hoy?';
                    messages.push(this.resolveVariables(aiMsg, session.variables, flow));
                    await this.updateSession(session, node.id, 'ai_input');
                    return { messages, session, executionPath };

                case 'end':
                    if (node.data?.message) {
                        messages.push(this.resolveVariables(node.data.message, session.variables, flow));
                    }
                    await this.updateSession(session, node.id, null, 'completed');
                    return { messages, session, executionPath, completed: true };

                case 'reservation_create':
                    // Registrar la reserva en el CRM y la Agenda real
                    try {
                        const vars = session.variables || {};
                        const resourceId = vars.resource_id;
                        const bookingDay  = vars.__selected_day || vars.booking_start || 'Hoy';
                        const bookingTime = vars.__selected_time || '09:00';
                        const currentYear = new Date().getFullYear();
                        const fullDateTime = `${bookingDay} ${currentYear} ${bookingTime}`;

                        if (resourceId && this.supabase) {
                            await this.supabase.createReservation({
                                merchant_id: session.merchant_id,
                                resource_id: resourceId,
                                start_time: fullDateTime,
                                customer_name: vars.customer_name || 'Cliente de Chat',
                                customer_phone: vars.customer_phone || session.phone || '',
                                pax: node.data?.pax || 1,
                                status: 'confirmed'
                            });
                        }
                    } catch (err) {
                        console.error('Bot Error Booking:', err);
                    }

                    const nextCreateNodeId = this.getNextNodeId(flowData, node.id, 'success');
                    node = nodes.find((n: any) => n.id === nextCreateNodeId);
                    break;

                default:
                    node = null;
            }
        }

        if (iterations >= maxIterations) {
            messages.push('⚠️ Alerta: Se detectó un posible bucle infinito en el flujo. La ejecución se detuvo por seguridad.');
        }

        // Si el bucle termina sin nodo 'end' explícito, marcar como completado igualmente
        await this.updateSession(session, session.current_node_id, null, 'completed');
        return { messages, session, executionPath, completed: messages.length === 0 };
    }

    private resolveVariables(template: string, variables: any = {}, flow: any): string {
        if (!template) return '';
        let result = template;
        
        for (const [key, value] of Object.entries(variables)) {
            result = result.replace(new RegExp(`{{${key}}}`, 'g'), value !== null && value !== undefined ? String(value) : '');
        }
        
        // Variables del sistema (Mapeo redundante para compatibilidad)
        const merchantName = variables['merchant_name'] || flow.name || 'Comercio';
        result = result.replace(/{{merchantName}}/g, merchantName);
        result = result.replace(/{{merchant_name}}/g, merchantName);
        
        const menuPdf = variables['merchant_menu_pdf'] || variables['menu_pdf'] || '';
        result = result.replace(/{{merchant_menu_pdf}}/g, menuPdf);
        result = result.replace(/{{menu_pdf}}/g, menuPdf);
        
        // Generar Resumen del Carrito dinámicamente
        if (result.includes('{{cartSummary}}')) {
            const cart = variables['cart'] || [];
            if (cart.length === 0) {
                result = result.replace(/{{cartSummary}}/g, '🛒 Tu carrito está vacío.');
            } else {
                let summary = '';
                let total = 0;
                cart.forEach((it: any) => {
                    const price = parseFloat(it.price) || 0;
                    const qty = parseInt(it.qty) || parseInt(it.quantity) || 1;
                    const rowTotal = price * qty;
                    total += rowTotal;
                    summary += `• ${qty}x ${it.name} ($${rowTotal.toLocaleString('es-CO')})`;
                    if (it.notes && it.notes.toLowerCase() !== 'no') {
                        summary += `\n  ↳ _${it.notes}_`;
                    }
                    summary += '\n';
                });
                summary += `\n💰 *Total: $${total.toLocaleString('es-CO')}*`;
                result = result.replace(/{{cartSummary}}/g, summary);
            }
        }

        // Reemplazo de orderNumber si existe
        if (variables['orderNumber']) {
            result = result.replace(/{{orderNumber}}/g, String(variables['orderNumber']));
        }

        result = result.replace(/{{fecha}}/g, new Date().toLocaleDateString());
        result = result.replace(/{{hora}}/g, new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        
        return result;
    }

    private matchMenuOption(input: string, options: any[]): any | null {
        const cleaned = input.trim().toLowerCase();
        
        // Match por número
        const num = parseInt(cleaned);
        if (!isNaN(num) && num >= 1 && num <= options.length) {
            return options[num - 1];
        }
        
        // Match por texto parcial
        return options.find(o => 
            cleaned.includes(o.text.toLowerCase()) || 
            (o.value && cleaned.includes(o.value.toLowerCase()))
        ) || null;
    }

    private validateInput(input: string, type: string): boolean {
        const text = input.trim();
        if (!text) return false;

        switch (type) {
            case 'number': return !isNaN(Number(text));
            case 'email': return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text);
            case 'phone': return /^[\d\s\+\-()]{7,15}$/.test(text);
            default: return text.length > 0;
        }
    }

    private evaluateCondition(data: any, variables: any = {}): boolean {
        const varValue = String(variables[data.variable] || '');
        const compareValue = String(data.value || '');
        
        switch (data.operator) {
            case '==': return varValue === compareValue;
            case '!=': return varValue !== compareValue;
            case 'contains': return varValue.includes(compareValue);
            case '>': return Number(varValue) > Number(compareValue);
            case '<': return Number(varValue) < Number(compareValue);
            case 'exists': return !!varValue;
            default: return false;
        }
    }

    private getNextNodeId(flowData: any, fromId: string, fromPort: string): string | null {
        const connections = flowData.connections || [];
        const conn = connections.find((c: any) => c.from === fromId && c.fromPort === fromPort);
        return conn ? conn.to : null;
    }

    private async executeAction(nodeData: any, session: any): Promise<string | null> {
        const actionType = nodeData.actionType;
        const params = nodeData.params || {};
        
        // Resolver variables en parámetros
        const resolvedParams: any = {};
        for (const [key, val] of Object.entries(params)) {
          resolvedParams[key] = this.resolveVariables(String(val), session.variables, { name: 'Comercio' }); // Flow name fallback
        }

        try {
            if (actionType === 'add_to_cart') {
                const vars = session.variables || {};
                const cart = vars['cart'] || [];
                
                // Extraer datos (priorizando params del nodo, luego variables de sesión)
                const productId = resolvedParams['product_id'] || vars['selected_product_id'];
                const productName = resolvedParams['product_name'] || vars['selected_product_name'];
                const price = Number(resolvedParams['price'] || vars['selected_product_price'] || 0);
                const qty = Number(resolvedParams['qty'] || vars['cantidad_actual'] || 1);
                const itemNotes = resolvedParams['notes'] || vars['last_product_notes'] || '';

                if (productId) {
                    cart.push({
                        id: productId,
                        name: productName,
                        price: price,
                        qty: qty,
                        notes: itemNotes
                    });
                    session.variables['cart'] = cart;
                    
                    // Limpieza opcional de variables temporales
                    session.variables['last_product_notes'] = ''; 
                    
                    return this.resolveVariables(`✅ ¡Producto añadido con éxito!\n\n{{cartSummary}}`, session.variables, {}); 
                }
                return '⚠️ Error: No se pudo identificar el producto.';
            }

            if (actionType === 'empty_cart') {
                session.variables['cart'] = [];
                return '🗑️ He vaciado tu carrito. ¿Qué te gustaría pedir ahora?';
            }

            if (actionType === 'register_order') {
                const vars = session.variables || {};
                const cart = vars['cart'] || [];
                const total = cart.reduce((acc: number, it: any) => acc + (Number(it.price) * it.qty), 0);

                // 1. Resolver datos del cliente (Mapeo flexible de nombres de variables)
                const customerName = vars['customer_name'] || vars['nombre'] || vars['full_name'] || 'Cliente de Bot';
                const customerPhone = vars['phone'] || vars['telefono'] || vars['customer_phone'] || session.phone || '';
                const deliveryAddress = vars['direccion_entrega'] || vars['direccion'] || vars['address'] || 'No proporcionada';
                const orderNotes = vars['notas_pedido'] || vars['customer_notes'] || vars['notas'] || '';

                if (session.customer_id) {
                    await this.supabase.updateCustomerCRM(session.customer_id, {
                        full_name: customerName,
                        phone: customerPhone,
                        address: deliveryAddress
                    });
                }

                // 2. Crear la orden maestra
                let orderRes = await this.supabase.createOrder({
                    merchant_id: session.merchant_id,
                    customer_id: session.customer_id || null,
                    customer_name: customerName,
                    total: total,
                    status: 'pending',
                    source: 'bot_flow',
                    closing_agent_type: 'bot',
                    delivery_address: deliveryAddress,
                    notes: orderNotes,
                    internal_note: `Pedido vía Bot Flow. Variables: ${JSON.stringify(vars)}`
                });

                if (orderRes.error && (orderRes.error.message.includes('column') || orderRes.error.message.includes('cache'))) {
                    console.warn('⚠️ [BotRuntime] Detectado esquema local antiguo, reintentando registro básico...');
                    orderRes = await this.supabase.createOrder({
                        merchant_id: session.merchant_id,
                        customer_id: session.customer_id || null,
                        total: total,
                        status: 'pending',
                        delivery_address: deliveryAddress
                    });
                }

                const { data: order, error } = orderRes;

                if (error) {
                    return `⚠️ Error al registrar el pedido principal. Detalles de base de datos: ${error.message || JSON.stringify(error)}`;
                }
                if (!order) {
                    return '⚠️ Error al registrar el pedido principal: No se recibió respuesta de la BD.';
                }

                // 3. Registrar ítems de la orden
                if (cart.length > 0) {
                    const items = cart.map((it: any) => ({
                        order_id: order.id,
                        product_id: it.id,
                        product_name: it.name,
                        quantity: Number(it.qty),
                        unit_price: Number(it.price),
                        subtotal: Number(it.price) * Number(it.qty),
                        notes: it.notes || ''
                    }));
                    await this.supabase.createOrderItems(items);
                }

                const orderNum = order.order_number || order.id.substring(0, 8);
                session.variables['orderNumber'] = `#${orderNum}`;
                session.variables['order_number'] = `#${orderNum}`;
                
                return `✅ ¡Gracias! Tu pedido #${orderNum} ha sido registrado exitosamente por un valor de $${total}.`;
            }

            if (actionType === 'transfer_human') {
                await this.updateSession(session, session.current_node_id, null, 'transferred');
                return '👤 Te estamos transfiriendo con un agente humano. Espera un momento...';
            }
        } catch (e) {
            console.error('Error executing action:', e);
        }

        return null;
    }

    private async updateSession(session: any, nodeId: string, waitingFor: string | null, status: string = 'active') {
        const { error } = await this.supabase.updateBotSession(session.id, {
            current_node_id: nodeId,
            waiting_for: waitingFor,
            variables: session.variables,
            status: status
        });
        
        if (!error) {
            session.current_node_id = nodeId;
            session.waiting_for = waitingFor;
            session.status = status;
        }
    }
}
