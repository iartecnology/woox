import { Injectable, signal } from '@angular/core';
import { supabase } from './supabase-config';

@Injectable({
    providedIn: 'root'
})
export class SupabaseService {

    unreadCount = signal(0);
    unreadOrdersCount = signal(0);
    isSoundEnabled = signal(localStorage.getItem('notification_sound') !== 'false');
    agentStatus = signal<'online' | 'busy' | 'offline'>('online');

    constructor() { }

    isValidUUID(uuid: string): boolean {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        return uuidRegex.test(uuid);
    }

    async updateAgentStatus(status: 'online' | 'busy' | 'offline') {
        const userId = localStorage.getItem('user_id'); // Asumiendo que guardamos el ID
        if (userId) {
            await supabase.from('profiles').update({ status }).eq('id', userId);
        }
        this.agentStatus.set(status);
    }

    async updateAgentCapacity(capacity: number) {
        const userId = localStorage.getItem('user_id');
        if (userId) {
            return await supabase.from('profiles').update({ max_capacity: capacity }).eq('id', userId);
        }
        return { error: 'No user ID' };
    }

    async getTeams(merchantId: string) {
        return await supabase
            .from('teams')
            .select('*')
            .eq('merchant_id', merchantId);
    }

    async saveTeam(team: any) {
        return await supabase
            .from('teams')
            .upsert(team)
            .select()
            .single();
    }

    async deleteTeam(teamId: string) {
        return await supabase
            .from('teams')
            .delete()
            .eq('id', teamId);
    }

    async addTeamMember(teamId: string, userId: string) {
        return await supabase
            .from('team_members')
            .upsert({ team_id: teamId, user_id: userId });
    }

    async assignToTeam(conversationId: string, teamId: string | null) {
        return await supabase
            .from('conversations')
            .update({ team_id: teamId })
            .eq('id', conversationId);
    }

    async assignConversation(conversationId: string, agentId: string | null) {
        return await supabase
            .from('conversations')
            .update({ assigned_agent_id: agentId })
            .eq('id', conversationId);
    }

    async sendTypingIndicator(conversationId: string, isTyping: boolean) {
        // En una implementación real usaríamos Supabase Presence. 
        // Por ahora lo hacemos vía canal dedicado para simplicidad.
        return supabase.channel(`typing:${conversationId}`).send({
            type: 'broadcast',
            event: 'typing',
            payload: { isTyping, agentName: localStorage.getItem('user_name') }
        });
    }

    toggleSound() {
        const newValue = !this.isSoundEnabled();
        this.isSoundEnabled.set(newValue);
        localStorage.setItem('notification_sound', String(newValue));
    }

    private lastSoundPlayedAt = 0;

    playSound() {
        if (!this.isSoundEnabled()) return;

        const now = Date.now();
        if (now - this.lastSoundPlayedAt < 1000) return; // Cooldown de 1 segundo

        this.lastSoundPlayedAt = now;
        const audio = new Audio('/notification.mp3');
        audio.play().catch(err => console.warn('Error playing notification sound:', err));
    }

    async refreshGlobalUnreadCount(merchantId: string, totalCount?: number) {
        if (!merchantId || !this.isValidUUID(merchantId)) return;
        
        if (totalCount !== undefined) {
             this.unreadCount.set(totalCount);
             return;
        }

        const { data } = await this.getConversations(merchantId);
        if (data) {
            const total = data.reduce((acc: number, curr: any) => acc + (curr.unread_count || 0), 0);
            this.unreadCount.set(total);
        }
    }

    async refreshGlobalUnreadOrdersCount(merchantId: string) {
        if (!merchantId || !this.isValidUUID(merchantId)) return;
        const { count, error } = await supabase
            .from('orders')
            .select('*', { count: 'exact', head: true })
            .eq('merchant_id', merchantId)
            .eq('status', 'pending');
        
        if (!error && count !== null) {
            this.unreadOrdersCount.set(count);
        }
    }

    // --- AUTH ---
    async login(email: string, pass: string) {
        const { data, error } = await supabase
            .from('profiles')
            .select('*, merchants(*)')
            .eq('email', email)
            .eq('password', pass)
            .single();
        return { data, error };
    }

    async getMerchantById(id: string) {
        const { data, error } = await supabase
            .from('merchants')
            .select('*')
            .eq('id', id)
            .single();
        return { data, error };
    }

    async getMerchantByAnyId(idOrCode: string) {
        if (!idOrCode) return { data: null, error: new Error('ID missing') };

        // 1. Intentar por ID (UUID)
        let { data, error } = await supabase
            .from('merchants')
            .select('*')
            .eq('id', idOrCode)
            .maybeSingle();

        if (!data) {
            // 2. Intentar por merchant_code
            const { data: mc, error: mcErr } = await supabase
                .from('merchants')
                .select('*')
                .eq('merchant_code', idOrCode)
                .maybeSingle();
            data = mc;
            error = mcErr;
        }

        return { data, error };
    }

    // --- COMERCIOS (MERCHANTS) ---
    async getMerchants() {
        const { data, error } = await supabase
            .from('merchants')
            .select('*')
            .order('name', { ascending: true });
        return { data, error };
    }

    async updateMerchant(id: string, updates: any) {
        return await supabase.from('merchants').update(updates).eq('id', id);
    }

    async updateProduct(id: string, updates: any) {
        return await supabase.from('products').update(updates).eq('id', id);
    }

    async saveMerchant(merchant: any) {
        const { data, error } = await supabase
            .from('merchants')
            .upsert(merchant)
            .select()
            .single();
        return { data, error };
    }

    async deleteMerchant(id: string) {
        return await supabase.from('merchants').delete().eq('id', id);
    }

    async checkMerchantCodeAvailability(code: string, excludeId?: string) {
        let query = supabase
            .from('merchants')
            .select('id', { count: 'exact', head: true })
            .eq('merchant_code', code);

        if (excludeId) {
            query = query.neq('id', excludeId);
        }

        const { count, error } = await query;
        return { exists: (count || 0) > 0, error };
    }


    async getCategories(merchantId: string) {
        if (!merchantId || !this.isValidUUID(merchantId)) {
            console.error('[SupabaseService] getCategories: Invalid or missing UUID:', merchantId);
            return { data: [], error: { message: `ID de comercio inválido ("${merchantId}"). Por favor, selecciona la empresa nuevamente.` } };
        }
        const { data, error } = await supabase
            .from('categories')
            .select('*')
            .eq('merchant_id', merchantId)
            .order('name');
        if (error) console.error('[SupabaseService] Error loading categories:', error);
        return { data, error };
    }

    async saveCategory(category: any) {
        return await supabase.from('categories').upsert(category).select().single();
    }

    async getProducts(merchantId: string) {
        if (!merchantId || !this.isValidUUID(merchantId)) {
            console.error('[SupabaseService] getProducts: Invalid or missing UUID:', merchantId);
            return { data: [], error: { message: `ID de comercio inválido ("${merchantId}"). Por favor, selecciona la empresa nuevamente.` } };
        }
        const { data, error } = await supabase
            .from('products')
            .select('*')
            .eq('merchant_id', merchantId)
            .order('name');
        if (error) console.error('[SupabaseService] Error loading products:', error);
        return { data, error };
    }

    async saveProduct(product: any) {
        return await supabase.from('products').upsert(product).select().single();
    }

    async deleteProduct(productId: string) {
        return await supabase.from('products').delete().eq('id', productId);
    }

    async getReservableResources(merchantId: string) {
        if (!merchantId || !this.isValidUUID(merchantId)) {
            return { data: [], error: { message: 'ID de comercio inválido' } };
        }
        const { data, error } = await supabase
            .from('reservable_resources')
            .select('*')
            .eq('merchant_id', merchantId)
            .order('name');
        return { data, error };
    }

    // --- RESERVAS (BOOKINGS) ---
    async getOrCreateCustomer(merchant_id: string, phone: string, full_name?: string) {
        // 1. Buscar si ya existe por teléfono en este comercio
        const { data: existing } = await supabase
            .from('customers')
            .select('id')
            .eq('merchant_id', merchant_id)
            .eq('phone', phone)
            .maybeSingle();

        if (existing) return existing.id;

        // 2. Si no, crearlo (registra en el CRM)
        const { data, error } = await supabase
            .from('customers')
            .insert({
                merchant_id,
                phone,
                full_name: full_name || 'Cliente Nuevo',
                status: 'lead'
            })
            .select('id')
            .single();

        if (error) {
            console.error('Error creando cliente:', error);
            return null;
        }
        return data.id;
    }

    async createReservation(reservation: any) {
        if (!reservation.merchant_id || !this.isValidUUID(reservation.merchant_id)) {
            return { data: null, error: { message: 'ID de comercio inválido' } };
        }

        // 1. Asegurar cliente (CRM)
        const customerId = await this.getOrCreateCustomer(
            reservation.merchant_id, 
            reservation.customer_phone, 
            reservation.customer_name
        );

        if (!customerId) return { data: null, error: { message: 'No se pudo crear/obtener el cliente en CRM' } };

        // 2. Preparar el booking para la tabla oficial
        // Si start_time es un string "Dom 19 Mar 10:00", hay que convertirlo a ISO o Date.
        // Asumimos que viene formateado o es manejable. 
        // Si viene de bot-runtime como "Mar 11 Mar 10:00", necesitamos parsearlo.
        
        // Calcular end_time sumando 60 min por defecto o traer duración del recurso
        let start = new Date(reservation.start_time);
        if (isNaN(start.getTime())) {
            // Intento de parseo manual simple para el bot builder
            const now = new Date();
            const timeMatch = reservation.start_time.match(/(\d{2}):(\d{2})/);
            if (timeMatch) {
                start = new Date();
                start.setHours(parseInt(timeMatch[1]), parseInt(timeMatch[2]), 0, 0);
            } else {
                start = now;
            }
        }
        const end = new Date(start.getTime() + (reservation.duration || 60) * 60000);

        const booking = {
            merchant_id: reservation.merchant_id,
            customer_id: customerId,
            resource_id: reservation.resource_id,
            start_time: start.toISOString(),
            end_time: end.toISOString(),
            pax: reservation.pax || 1,
            status: reservation.status || 'confirmed',
            channel: 'whatsapp',
            metadata: { 
                customer_name_manual: reservation.customer_name,
                source: 'Bot Simulation/Live'
            }
        };

        return await supabase
            .from('bookings')
            .insert(booking)
            .select()
            .single();
    }

    // --- PEDIDOS (ORDERS) ---
    async getOrders(merchantId: string) {
        const { data, error } = await supabase
            .from('orders')
            .select('*, customers(full_name), order_items(*, products(name, id))')
            .eq('merchant_id', merchantId)
            .order('created_at', { ascending: false });
        return { data, error };
    }

    async updateOrderStatus(orderId: string, status: string) {
        return await supabase.from('orders').update({ status }).eq('id', orderId);
    }

    async createOrder(orderData: any) {
        console.log('🚀 [SupabaseService] Creando pedido en DB...', orderData);
        const { data, error } = await supabase
            .from('orders')
            .insert(orderData)
            .select('*');

        if (error) {
            console.error('❌ [SupabaseService] Error creando pedido:', error);
            return { data: null, error };
        }

        const newOrder = data && data.length > 0 ? data[0] : null;
        console.log('✅ [SupabaseService] Pedido maestro creado:', newOrder?.id);
        return { data: newOrder, error: null };
    }

    async deleteOrder(orderId: string) {
        return await supabase.from('orders').delete().eq('id', orderId);
    }

    async deleteAllOrders(merchantId: string) {
        return await supabase.from('orders').delete().eq('merchant_id', merchantId);
    }

    async createOrderItems(items: any[]) {
        try {
            const cleanItems = items.map(it => ({
                order_id: it.order_id,
                product_id: it.product_id,
                product_name: String(it.product_name || 'Producto'),
                quantity: Number(it.quantity) || 0,
                unit_price: Number(it.unit_price) || 0,
                subtotal: Number(it.subtotal) || 0,
                notes: it.notes || ''
            }));

            const { data, error } = await supabase
                .from('order_items')
                .insert(cleanItems)
                .select();

            if (error) {
                console.error('❌ Error de Supabase al insertar ítems:', error);
                return { data: null, error };
            }
            return { data, error: null };
        } catch (e: any) {
            console.error('❌ Excepción crítica al insertar ítems:', e);
            return { data: null, error: e };
        }
    }

    // --- MÉTRICAS ---
    async getMerchantMetrics(merchantId: string) {
        const { data: orders, error: err1 } = await supabase
            .from('orders')
            .select('total, created_at, closing_agent_type')
            .eq('merchant_id', merchantId);

        if (err1) return { error: err1 };

        const totalSales = orders.reduce((acc, curr) => acc + Number(curr.total), 0);
        const totalOrders = orders.length;
        const aiOrders = orders.filter(o => o.closing_agent_type === 'ai').length;
        const conversionRate = totalOrders > 0 ? Math.round((aiOrders / totalOrders) * 100) : 0;

        return {
            data: {
                totalSales,
                totalOrders,
                aiOrders,
                conversionRate,
                avgTime: '24 min' // Hardcoded por ahora o calculado si tenemos campos de tiempo
            }
        };
    }

    // --- CONVERSACIONES Y CHAT ---
    async toggleAI(conversationId: string, isActive: boolean) {
        const { data, error } = await supabase
            .from('conversations')
            .update({ ai_active: isActive })
            .eq('id', conversationId);
        return { data, error };
    }

    async createConversation(merchantId: string, customerId: string | null, platform: string = 'simulator', customerIdentifier?: string) {
        try {
            const insertData: any = {
                merchant_id: merchantId,
                customer_id: customerId,
                platform: platform,
                channel: platform, // Sincronizar channel con platform
                status: 'open',
                ai_active: true
            };

            // Solo añadir si existe el valor, para evitar errores si la columna no existe aún
            if (customerIdentifier) {
                insertData.customer_identifier = customerIdentifier;
            }

            const { data, error } = await supabase
                .from('conversations')
                .insert(insertData)
                .select()
                .single();

            if (error) console.error('Error creating conversation:', error);
            return { data, error };
        } catch (err) {
            console.error('Exception in createConversation:', err);
            return { data: null, error: err };
        }
    }

    async getConversations(merchantId: string) {
        if (!merchantId || !this.isValidUUID(merchantId)) {
            return { data: [], error: { message: 'Invalid UUID' } };
        }
        const { data, error } = await supabase
            .from('conversations')
            .select('*, customers(full_name, phone)')
            .eq('merchant_id', merchantId)
            .order('last_message_at', { ascending: false });
        return { data, error };
    }

    async getMessages(conversationId: string) {
        const { data, error } = await supabase
            .from('messages')
            .select('*')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: true });
        return { data, error };
    }

    subscribeToMessages(conversationId: string, callback: (payload: any) => void) {
        return supabase
            .channel(`chat:${conversationId}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, callback)
            .subscribe();
    }

    subscribeToMerchantOrders(merchantId: string, callback: (payload: any) => void) {
        if (!merchantId || !this.isValidUUID(merchantId)) return null;
        return supabase
            .channel(`merchant_orders:${merchantId}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders', filter: `merchant_id=eq.${merchantId}` }, callback)
            .subscribe();
    }

    // Suscripción Global para Notificaciones (Cualquier mensaje nuevo en conversaciones de este merchant)
    subscribeToMerchantConversations(merchantId: string, callback: (payload: any) => void) {
        if (!merchantId || !this.isValidUUID(merchantId)) {
            console.error('[SupabaseService] subscribeToMerchantConversations: Invalid UUID', merchantId);
            return null;
        }
        return supabase
            .channel(`merchant:${merchantId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations', filter: `merchant_id=eq.${merchantId}` }, callback)
            .subscribe();
    }

    async requestNotificationPermission() {
        if (!('Notification' in window)) return;
        return await Notification.requestPermission();
    }

    sendBrowserNotification(title: string, options?: NotificationOptions) {
        if (!('Notification' in window) || Notification.permission !== 'granted') return;
        new Notification(title, options);
    }

    channel(name: string) {
        return supabase.channel(name);
    }

    unsubscribe(channel: any) {
        supabase.removeChannel(channel);
    }

    async saveMessage(conversationId: string, senderType: 'ai' | 'human_agent' | 'customer', content: string, skipDelivery: boolean = false) {
        // 1. Insertar el mensaje
        const { data, error } = await supabase
            .from('messages')
            .insert({
                conversation_id: conversationId,
                sender_type: senderType,
                content: content
            });

        // 2. Actualizar la metadata de la conversación (para el historial)
        if (!error) {
            try {
                // Actualización secundaria para disparar Realtime en otros agentes
                await supabase
                    .from('conversations')
                    .update({
                        last_message: content,
                        last_message_at: new Date().toISOString()
                    })
                    .eq('id', conversationId);

                // 3. SI EL EMISOR ES HUMANO O IA, ENTREGAR AL CANAL EXTERNO (OJO: No se entrega si es simulador)
                if (!skipDelivery && (senderType === 'human_agent' || senderType === 'ai')) {
                    console.log(`[SupabaseService] Enviando entrega externa para: ${senderType}`);
                    // Llamar a la Edge Function de entrega
                    const { data: fetchRes, error: fetchErr } = await supabase.functions.invoke('deliver-message', {
                        body: { conversation_id: conversationId, content: content }
                    });

                    if (fetchErr) {
                        console.error('Error in deliver-message function:', fetchErr);
                        // Retornamos el error de entrega para que el UI pueda reaccionar
                        return { data: null, error: fetchErr };
                    } else {
                        console.log('Delivery result:', fetchRes);
                    }
                }
            } catch (e) {
                console.warn('Silent fail delivery/update:', e);
            }
        }

        return { data, error };
    }

    async sendHumanMessage(conversationId: string, content: string, skipDelivery: boolean = false) {
        return await this.saveMessage(conversationId, 'human_agent', content, skipDelivery);
    }

    async generateGeminiResponse(userPrompt: string, systemContext: string, apiKey: string) {
        // Mock de llamada a Gemini
        console.log('Gemini call with:', { userPrompt, systemContext });
        return {
            content: `Sugerencia de IA para: "${userPrompt}"\nEste es un mensaje generado automáticamente basado en el contexto proporcionado.`
        };
    }

    async getMerchantCustomers(merchantId: string) {
        return await supabase
            .from('customers')
            .select('*')
            .eq('merchant_id', merchantId)
            .order('clv', { ascending: false });
    }

    async getMerchantInfo(merchantId: string) {
        const { data, error } = await supabase
            .from('merchants')
            .select('*')
            .eq('id', merchantId)
            .single();
        return { data: data, error };
    }

    // --- USUARIOS Y PERFILES ---
    async getProfiles() {
        const { data, error } = await supabase
            .from('profiles')
            .select('*, merchants(name), team_members(team_id, teams(name))')
            .order('created_at', { ascending: false });
        return { data, error };
    }

    async saveProfile(profile: any) {
        return await supabase
            .from('profiles')
            .upsert(profile)
            .select()
            .single();
    }

    async deleteProfile(id: string) {
        return await supabase
            .from('profiles')
            .delete()
            .eq('id', id);
    }

    // --- CRM Y CHAT AVANZADO ---
    async getConversationWithCustomer(conversationId: string) {
        return await supabase
            .from('conversations')
            .select(`
                *,
                customers (
                    id, 
                    full_name, 
                    phone, 
                    email, 
                    address, 
                    city, 
                    notes, 
                    loyalty_points, 
                    status,
                    last_purchase_at,
                    telegram_chat_id,
                    telegram_user_id
                ),
                tags:conversation_tags(tags(*))
            `)
            .eq('id', conversationId)
            .single();
    }

    async updateCustomerCRM(customerId: string, updates: any) {
        return await supabase
            .from('customers')
            .update(updates)
            .eq('id', customerId);
    }

    async getCustomerStats(customerId: string) {
        const { data, error } = await supabase
            .from('orders')
            .select('total')
            .eq('customer_id', customerId);

        if (error) return { data: null, error };

        const stats = {
            orders_count: data.length,
            total_spent: data.reduce((acc, curr) => acc + Number(curr.total), 0)
        };

        return { data: stats, error: null };
    }

    async getMerchantTags(merchantId: string) {
        return await supabase
            .from('tags')
            .select('*')
            .eq('merchant_id', merchantId)
            .order('name');
    }

    async addTagToConversation(conversationId: string, tagId: string) {
        return await supabase
            .from('conversation_tags')
            .insert({ conversation_id: conversationId, tag_id: tagId });
    }

    async removeTagFromConversation(conversationId: string, tagId: string) {
        return await supabase
            .from('conversation_tags')
            .delete()
            .match({ conversation_id: conversationId, tag_id: tagId });
    }

    async saveInternalNote(conversationId: string, content: string, authorId?: string) {
        return await supabase
            .from('internal_notes')
            .insert({
                conversation_id: conversationId,
                content: content,
                author_id: authorId
            });
    }

    async getInternalNotes(conversationId: string) {
        return await supabase
            .from('internal_notes')
            .select('*')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: false });
    }

    async markAsRead(conversationId: string) {
        return await supabase
            .from('conversations')
            .update({ unread_count: 0 })
            .eq('id', conversationId);
    }

    async deleteConversation(conversationId: string) {
        return await supabase
            .from('conversations')
            .delete()
            .eq('id', conversationId);
    }

    async unlinkOrdersFromConversation(conversationId: string) {
        return await supabase
            .from('orders')
            .update({ conversation_id: null })
            .eq('conversation_id', conversationId);
    }

    async deleteAllConversations(merchantId: string) {
        return await supabase
            .from('conversations')
            .delete()
            .eq('merchant_id', merchantId);
    }

    async unlinkOrdersFromAllConversations(merchantId: string) {
        return await supabase
            .from('orders')
            .update({ conversation_id: null })
            .eq('merchant_id', merchantId);
    }

    subscribeToOrders(merchantId: string, callback: () => void) {
        console.log('📡 [SupabaseService] Suscribiendo a cambios de pedidos para:', merchantId);
        return supabase
            .channel(`public:orders:merchant:${merchantId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'orders',
                    filter: `merchant_id=eq.${merchantId}`
                },
                (payload) => {
                    console.log('🔔 [SupabaseService] Cambio en tabla orders detectado:', payload.eventType);
                    callback();
                }
            )
            .subscribe();
    }

    async unsubscribeChannel(channel: any) {
        if (channel) {
            await supabase.removeChannel(channel);
        }
    }

    async rpc(functionName: string, params: any) {
        return await supabase.rpc(functionName, params);
    }

    // --- BOT BUILDER (FLUJOS PROGRAMADOS) ---
    async getBotFlows(merchantId: string) {
        return await supabase
            .from('bot_flows')
            .select('*')
            .eq('merchant_id', merchantId)
            .order('created_at', { ascending: false });
    }

    async saveBotFlow(flow: any) {
        return await supabase
            .from('bot_flows')
            .upsert(flow)
            .select()
            .single();
    }

    async deleteBotFlow(id: string) {
        return await supabase
            .from('bot_flows')
            .delete()
            .eq('id', id);
    }

    async getActiveBotFlow(merchantId: string) {
        return await supabase.rpc('get_active_bot_flow', { p_merchant_id: merchantId });
    }

    // --- PLANTILLAS DE FLUJOS (PLANTILLAS PRO) ---
    async getBotFlowTemplates() {
        return await supabase
            .from('bot_flow_templates')
            .select('*')
            .order('created_at', { ascending: false });
    }

    async saveBotFlowTemplate(template: any) {
        return await supabase
            .from('bot_flow_templates')
            .upsert(template)
            .select()
            .single();
    }

    async deleteBotFlowTemplate(id: string) {
        return await supabase
            .from('bot_flow_templates')
            .delete()
            .eq('id', id);
    }


    async getOrCreateBotSession(conversationId: string, merchantId: string, flowId: string, startNodeId: string) {
        return await supabase.rpc('get_or_create_bot_session', {
            p_conversation_id: conversationId,
            p_merchant_id: merchantId,
            p_flow_id: flowId,
            p_start_node_id: startNodeId
        });
    }

    async updateBotSession(sessionId: string, updates: any) {
        return await supabase
            .from('bot_flow_sessions')
            .update({
                ...updates,
                updated_at: new Date().toISOString()
            })
            .eq('id', sessionId);
    }

    // --- PLATFORM SETTINGS ---
    async getPlatformSettings() {
        return await supabase
            .from('platform_settings')
            .select('*')
            .eq('id', 'global')
            .single();
    }

    async updatePlatformSettings(updates: any) {
        return await supabase
            .from('platform_settings')
            .upsert({ id: 'global', ...updates });
    }

    // --- AI LANDING PAGES ---
    async getLandingByMerchant(merchantId: string) {
        return await supabase
            .from('ai_landing_pages')
            .select('*')
            .eq('merchant_id', merchantId)
            .maybeSingle();
    }

    async getLandingBySlug(slug: string) {
        return await supabase
            .from('ai_landing_pages')
            .select('*')
            .eq('slug', slug)
            .maybeSingle();
    }

    async saveLandingPage(landing: any) {
        return await supabase
            .from('ai_landing_pages')
            .upsert(landing)
            .select()
            .single();
    }

    // --- SCALABLE RAG MANAGEMENT (DOCUMENTS & CHUNKS) ---

    async getKnowledgeBaseDocuments(merchantId: string) {
        return await supabase
            .from('knowledge_base_documents')
            .select('*')
            .eq('merchant_id', merchantId)
            .order('updated_at', { ascending: false });
    }

    async saveKnowledgeBaseDocument(doc: any) {
        return await supabase
            .from('knowledge_base_documents')
            .upsert(doc)
            .select()
            .single();
    }

    async deleteKnowledgeBaseDocument(id: string) {
        return await supabase
            .from('knowledge_base_documents')
            .delete()
            .eq('id', id);
    }

    async getKnowledgeBaseChunks(documentId: string) {
        return await supabase
            .from('knowledge_base_chunks')
            .select('*')
            .eq('document_id', documentId)
            .order('chunk_index', { ascending: true });
    }

    async saveKnowledgeBaseChunk(chunk: any) {
        return await supabase
            .from('knowledge_base_chunks')
            .insert(chunk)
            .throwOnError();
    }

    async deleteKnowledgeBaseChunks(documentId: string) {
        return await supabase
            .from('knowledge_base_chunks')
            .delete()
            .eq('document_id', documentId);
    }

    async searchKnowledgeBase(merchantId: string, embedding: number[], threshold: number = 0.5, limit: number = 5) {
        return await supabase.rpc('match_knowledge_base_chunks', {
            p_merchant_id: merchantId,
            p_embedding: embedding,
            p_match_threshold: threshold,
            p_match_count: limit
        });
    }

    async generateEmbedding(text: string, settings: any): Promise<number[] | null> {
        const provider = settings?.embed_provider || 'google_gemini';
        let model = settings?.embed_model;
        
        // Defaults inteligentes para vector(768)
        if (!model) {
            model = provider === 'google_gemini' ? 'models/gemini-embedding-001' : 'text-embedding-3-small';
        }

        const apiKey = settings?.embed_api_key || settings?.ai_api_key;
        const ollamaUrl = settings?.ollama_base_url || 'http://localhost:11434';

        if (!apiKey && provider !== 'ollama') return null;

        try {
            if (provider === 'google_gemini') {
                // El modelo 'models/gemini-embedding-001' es el estándar actual verificado para esta API Key.
                // 'gemini-embedding-2-preview' también funciona pero devuelve 3072 dimensiones.
                let targetModelId = model || 'models/gemini-embedding-001';
                
                // Normalizar prefijo
                const fullModelId = targetModelId.includes('/') ? targetModelId : `models/${targetModelId}`;
                
                const body: any = {
                    content: { parts: [{ text }] }
                };
                
                // Intentamos pedir 768 si es un modelo moderno que lo soporte (como el preview 2)
                if (fullModelId.includes('preview')) {
                    body.outputDimensionality = 768;
                }

                const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/${fullModelId}:embedContent?key=${apiKey}`, {
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
                
                const data = await resp.json();
                
                if (data.error) {
                    // Fallback de emergencia al único modelo garantizado si falla el del usuario
                    if (fullModelId !== 'models/gemini-embedding-001') {
                         console.warn('Fallo con modelo específico, intentando con gemini-embedding-001...');
                         return this.generateEmbedding(text, { ...settings, embed_model: 'models/gemini-embedding-001' });
                    }
                    throw new Error(data.error.message || 'Error en API de Google');
                }
                
                let values = data.embedding?.values;
                if (!values || !Array.isArray(values)) throw new Error('Respuesta de API sin vector válido');

                // SOLUCIÓN A LAS DIMENSIONES:
                // Si el modelo es el Preview 2 o similar, puede devolver 3072.
                // Como usamos Matryoshka embeddings, truncar los primeros 768 es totalmente válido.
                if (values.length > 768) {
                    console.log(`Dimensiones de IA excedidas (${values.length}), truncando a 768 para compatibilidad DB...`);
                    values = values.slice(0, 768);
                }

                if (values.length < 768) {
                    throw new Error(`El modelo devolvió muy pocas dimensiones (${values.length}). Se requieren 768.`);
                }

                return values;
            } else if (provider === 'openai') {
                const resp = await fetch('https://api.openai.com/v1/embeddings', {
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                    body: JSON.stringify({ 
                        model: model || 'text-embedding-3-small', 
                        input: text,
                        dimensions: 768 
                    })
                });
                const data = await resp.json();
                if (data.error) throw new Error(data.error.message || 'Error en API OpenAI');
                return data.data?.[0]?.embedding || null;
            } else if (provider === 'ollama') {
                const headers: any = { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' };
                if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
                const resp = await fetch(`${ollamaUrl}/api/embeddings`, {
                    method: 'POST', headers: headers,
                    body: JSON.stringify({ model, prompt: text })
                });
                const data = await resp.json();
                if (data.error) throw new Error(data.error || 'Error en API Ollama');
                return data.embedding || null;
            }
        } catch (e: any) { 
            console.error('Error absoluto en generateEmbedding:', e); 
            throw e; 
        }
        return null;
    }

    // =====================================================================
    // STUBS DE COMPATIBILIDAD (tablas legacy eliminadas - retornan vacío)
    // Estos métodos existen únicamente para evitar errores de compilación en
    // componentes que aún no han sido migrados. Las tablas agents, agent_skills,
    // agent_context_blocks, merchant_context_blocks y skills_catalog fueron
    // eliminadas de la base de datos.
    // =====================================================================

    async getAgents() {
        console.warn('⚠️ getAgents(): La tabla agents fue eliminada.');
        return { data: [], error: null };
    }

    async saveAgent(agent: any): Promise<{ data: any; error: any }> {
        console.warn('⚠️ saveAgent(): La tabla agents fue eliminada.');
        return { data: null, error: new Error('La tabla agents no existe') };
    }

    async deleteAgent(id: string) {
        console.warn('⚠️ deleteAgent(): La tabla agents fue eliminada.');
        return { data: null, error: new Error('La tabla agents no existe') };
    }

    async getAgentSkills(agentId: string) {
        console.warn('⚠️ getAgentSkills(): La tabla agent_skills fue eliminada.');
        return { data: [], error: null };
    }

    async updateAgentSkill(agentId: string, skillId: string, isEnabled: boolean) {
        console.warn('⚠️ updateAgentSkill(): La tabla agent_skills fue eliminada.');
        return { data: null, error: new Error('La tabla agent_skills no existe') };
    }

    async getAgentContextBlocks(agentId: string) {
        console.warn('⚠️ getAgentContextBlocks(): La tabla agent_context_blocks fue eliminada.');
        return { data: [], error: null };
    }

    async saveAgentContextBlock(block: any) {
        console.warn('⚠️ saveAgentContextBlock(): La tabla agent_context_blocks fue eliminada.');
        return { data: null, error: new Error('La tabla agent_context_blocks no existe') };
    }

    async deleteAgentContextBlock(id: string) {
        console.warn('⚠️ deleteAgentContextBlock(): La tabla agent_context_blocks fue eliminada.');
        return { data: null, error: new Error('La tabla agent_context_blocks no existe') };
    }

    async saveMerchantContextBlock(block: any) {
        console.warn('⚠️ saveMerchantContextBlock(): La tabla merchant_context_blocks fue eliminada.');
        return { data: null, error: new Error('La tabla merchant_context_blocks no existe') };
    }

    async getSkillsCatalog() {
        console.warn('⚠️ getSkillsCatalog(): La tabla skills_catalog fue eliminada.');
        return { data: [], error: null };
    }

    async saveSkillToCatalog(skill: any) {
        console.warn('⚠️ saveSkillToCatalog(): La tabla skills_catalog fue eliminada.');
        return { data: null, error: new Error('La tabla skills_catalog no existe') };
    }

    async deleteSkillFromCatalog(id: string) {
        console.warn('⚠️ deleteSkillFromCatalog(): La tabla skills_catalog fue eliminada.');
        return { data: null, error: new Error('La tabla skills_catalog no existe') };
    }
}
