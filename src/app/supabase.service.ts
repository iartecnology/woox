import { Injectable, signal } from '@angular/core';
import { supabase } from './supabase-config';

@Injectable({
    providedIn: 'root'
})
export class SupabaseService {

    unreadCount = signal(0);
    isSoundEnabled = signal(localStorage.getItem('notification_sound') !== 'false');
    agentStatus = signal<'online' | 'busy' | 'offline'>('online');

    constructor() { }

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
        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3');
        audio.play().catch(err => console.warn('Error playing notification sound:', err));
    }

    async refreshGlobalUnreadCount(merchantId: string) {
        if (!merchantId) return;
        const { data } = await this.getConversations(merchantId);
        if (data) {
            const total = data.reduce((acc: number, curr: any) => acc + (curr.unread_count || 0), 0);
            console.log('Validando Global Unread Count:', total);
            this.unreadCount.set(total);
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
        const { data, error } = await supabase
            .from('merchants')
            .update(updates)
            .eq('id', id);
        return { data, error };
    }

    async saveMerchant(merchant: any) {
        const { data, error } = await supabase
            .from('merchants')
            .upsert(merchant)
            .select()
            .single();
        return { data, error };
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

    // --- AGENTES (AI AGENTS) ---
    async getAgents() {
        const { data, error } = await supabase
            .from('agents')
            .select('*')
            .order('created_at', { ascending: false });
        return { data, error };
    }

    async saveAgent(agent: any) {
        const { data, error } = await supabase
            .from('agents')
            .upsert(agent);
        return { data, error };
    }

    // --- PRODUCTOS Y CATEGORÍAS ---
    async getCategories(merchantId: string) {
        const { data, error } = await supabase
            .from('categories')
            .select('*')
            .eq('merchant_id', merchantId)
            .order('name');
        return { data, error };
    }

    async saveCategory(category: any) {
        return await supabase.from('categories').upsert(category).select().single();
    }

    async getProducts(merchantId: string) {
        const { data, error } = await supabase
            .from('products')
            .select('*, categories(name)')
            .eq('merchant_id', merchantId)
            .order('name');
        return { data, error };
    }

    async saveProduct(product: any) {
        return await supabase.from('products').upsert(product).select().single();
    }

    async deleteProduct(productId: string) {
        return await supabase.from('products').delete().eq('id', productId);
    }

    // --- PEDIDOS (ORDERS) ---
    async getOrders(merchantId: string) {
        const { data, error } = await supabase
            .from('orders')
            .select('*, customers(full_name), order_items(*, products(name))')
            .eq('merchant_id', merchantId)
            .order('created_at', { ascending: false });
        return { data, error };
    }

    async updateOrderStatus(orderId: string, status: string) {
        return await supabase.from('orders').update({ status }).eq('id', orderId);
    }

    async createOrder(orderData: any) {
        const { data, error } = await supabase
            .from('orders')
            .insert(orderData)
            .select()
            .single();
        return { data, error };
    }

    async createOrderItems(items: any[]) {
        const { data, error } = await supabase
            .from('order_items')
            .insert(items);
        return { data, error };
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

    // Suscripción Global para Notificaciones (Cualquier mensaje nuevo en conversaciones de este merchant)
    subscribeToMerchantConversations(merchantId: string, callback: (payload: any) => void) {
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

    async saveMessage(conversationId: string, senderType: 'ai' | 'human_agent' | 'customer', content: string) {
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

                // 3. SI EL EMISOR ES HUMANO O IA, ENTREGAR AL CANAL EXTERNO
                if (senderType === 'human_agent' || senderType === 'ai') {
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

    async sendHumanMessage(conversationId: string, content: string) {
        return await this.saveMessage(conversationId, 'human_agent', content);
    }

    async generateGeminiResponse(userPrompt: string, systemContext: string, apiKey: string) {
        // Mock de llamada a Gemini
        console.log('Gemini call with:', { userPrompt, systemContext });
        return {
            content: `Sugerencia de IA para: "${userPrompt}"\nEste es un mensaje generado automáticamente basado en el contexto proporcionado.`
        };
    }

    async getMerchantConfig(merchantId: string) {
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

    async unsubscribeChannel(channel: any) {
        if (channel) {
            await supabase.removeChannel(channel);
        }
    }

    async rpc(functionName: string, params: any) {
        return await supabase.rpc(functionName, params);
    }
}
