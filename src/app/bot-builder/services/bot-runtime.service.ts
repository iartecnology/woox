import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../supabase.service';

export interface BotResponse {
    messages: string[];
    session: any;
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

        // 3. ¿Es sesión recién creada (sin waiting_for)? → Enviar mensaje del START y avanzar
        if (!session.waiting_for) {
            const startMessage = this.resolveVariables(startNode.data?.message || '', session.variables, flow);
            const nextNodeId = this.getNextNodeId(flowData, startNode.id, 'output');
            const nextNode = nodes.find((n: any) => n.id === nextNodeId);
            
            const response = await this.advanceAndCollect(flowData, nextNode, session, flow);
            return { 
                messages: startMessage ? [startMessage, ...response.messages] : response.messages, 
                session: response.session 
            };
        }

        // 4. Sesión existente → Procesar input según el nodo actual
        const currentNode = nodes.find((n: any) => n.id === session.current_node_id);
        if (!currentNode) return { messages: ['⚠️ Error: Nodo no encontrado.'], session };

        return await this.handleUserInput(flowData, currentNode, userMessage, session, flow);
    }

    private async handleUserInput(
        flowData: any,
        currentNode: any,
        userInput: string,
        session: any,
        flow: any
    ): Promise<BotResponse> {
        const nodes = flowData.nodes || [];

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

        return { messages: ['Lo siento, hubo un error en el flujo.'], session };
    }

    private async advanceAndCollect(
        flowData: any,
        node: any,
        session: any,
        flow: any
    ): Promise<BotResponse> {
        const messages: string[] = [];
        const nodes = flowData.nodes || [];

        let iterations = 0;
        const maxIterations = 50;

        while (node && iterations < maxIterations) {
            iterations++;
            switch (node.type) {
                case 'message':
                    messages.push(this.resolveVariables(node.data?.message || '', session.variables, flow));
                    const nextMsgNodeId = this.getNextNodeId(flowData, node.id, 'output');
                    node = nodes.find((n: any) => n.id === nextMsgNodeId);
                    break;

                case 'question':
                    messages.push(this.resolveVariables(node.data?.message || '', session.variables, flow));
                    await this.updateSession(session, node.id, 'input');
                    return { messages, session };

                case 'menu':
                    const menuMsg = this.resolveVariables(node.data?.message || '', session.variables, flow);
                    const optionsText = (node.data?.options || []).map((o: any, i: number) => `${i + 1}. ${o.text}`).join('\n');
                    messages.push(`${menuMsg}\n\n${optionsText}`);
                    await this.updateSession(session, node.id, 'menu_selection');
                    return { messages, session };

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
                    return { messages, session };

                case 'end':
                    if (node.data?.message) {
                        messages.push(this.resolveVariables(node.data.message, session.variables, flow));
                    }
                    await this.updateSession(session, node.id, null, 'completed');
                    return { messages, session };

                default:
                    node = null;
            }
        }

        if (iterations >= maxIterations) {
            messages.push('⚠️ Alerta: Se detectó un posible bucle infinito en el flujo. La ejecución se detuvo por seguridad.');
        }

        // Si el bucle termina, actualizar estado final
        await this.updateSession(session, session.current_node_id, null, 'completed');
        return { messages, session };
    }

    private resolveVariables(template: string, variables: any = {}, flow: any): string {
        if (!template) return '';
        let result = template;
        
        // Variables de sesión
        for (const [key, value] of Object.entries(variables)) {
            result = result.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
        }
        
        // Variables del sistema
        result = result.replace(/{{merchantName}}/g, flow.name || 'Comercio');
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
            if (actionType === 'empty_cart') {
                session.variables['cart'] = [];
                return '🗑️ He vaciado tu carrito. ¿Qué te gustaría pedir ahora?';
            }

            if (actionType === 'register_order') {
                const vars = session.variables || {};
                const cart = vars['cart'] || [];
                const total = cart.reduce((acc: number, it: any) => acc + (Number(it.price) * it.qty), 0);

                // 1. Actualizar datos del cliente en CRM
                if (session.customer_id) {
                    await this.supabase.updateCustomerCRM(session.customer_id, {
                        full_name: vars['customer_name'],
                        phone: vars['phone'],
                        address: vars['direccion_entrega']
                    });
                }

                // 2. Crear la orden maestra
                const { data: order, error } = await this.supabase.createOrder({
                    merchant_id: session.merchant_id,
                    customer_id: session.customer_id,
                    total: total,
                    status: 'pending',
                    source: 'bot_flow',
                    closing_agent_type: 'bot',
                    delivery_address: vars['direccion_entrega'] || 'No proporcionada',
                    internal_note: `Pedido vía Bot Flow. Datos: ${JSON.stringify(vars)}`
                });

                if (error || !order) return '⚠️ Error al registrar el pedido principal.';

                // 3. Registrar ítems de la orden
                if (cart.length > 0) {
                    const items = cart.map((it: any) => ({
                        order_id: order.id,
                        product_id: it.id,
                        product_name: it.name,
                        quantity: Number(it.qty),
                        unit_price: Number(it.price),
                        subtotal: Number(it.price) * Number(it.qty)
                    }));
                    await this.supabase.createOrderItems(items);
                }

                const orderNum = order.order_number || order.id.substring(0, 8);
                session.variables['orderNumber'] = `#${orderNum}`;
                
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
