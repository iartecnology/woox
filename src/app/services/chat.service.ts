import { Injectable, signal } from '@angular/core';
import { supabase } from '../supabase-config';

/**
 * ChatService — Gestión de Conversaciones, Mensajes y Realtime
 * Extraído del monolito supabase.service.ts para mantener responsabilidad única.
 */
@Injectable({ providedIn: 'root' })
export class ChatService {

    unreadCount = signal(0);

    // --- CONVERSACIONES ---
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

    async createConversation(merchantId: string, customerId: string | null, platform: string = 'simulator', customerIdentifier?: string) {
        try {
            const insertData: any = {
                merchant_id: merchantId,
                customer_id: customerId,
                platform: platform,
                channel: platform,
                status: 'open',
                ai_active: true
            };
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

    async getConversationWithCustomer(conversationId: string) {
        return await supabase
            .from('conversations')
            .select(`
                *,
                customers (
                    id, full_name, phone, email, address, city, notes,
                    loyalty_points, status, last_purchase_at,
                    telegram_chat_id, telegram_user_id
                ),
                tags:conversation_tags(tags(*))
            `)
            .eq('id', conversationId)
            .single();
    }

    async toggleAI(conversationId: string, isActive: boolean) {
        return await supabase
            .from('conversations')
            .update({ ai_active: isActive })
            .eq('id', conversationId);
    }

    async markAsRead(conversationId: string) {
        return await supabase
            .from('conversations')
            .update({ unread_count: 0 })
            .eq('id', conversationId);
    }

    async assignConversation(conversationId: string, agentId: string | null) {
        return await supabase
            .from('conversations')
            .update({ assigned_agent_id: agentId })
            .eq('id', conversationId);
    }

    async assignToTeam(conversationId: string, teamId: string | null) {
        return await supabase
            .from('conversations')
            .update({ team_id: teamId })
            .eq('id', conversationId);
    }

    async deleteConversation(conversationId: string) {
        return await supabase
            .from('conversations')
            .delete()
            .eq('id', conversationId);
    }

    async deleteAllConversations(merchantId: string) {
        return await supabase
            .from('conversations')
            .delete()
            .eq('merchant_id', merchantId);
    }

    // --- MENSAJES ---
    async getMessages(conversationId: string) {
        const { data, error } = await supabase
            .from('messages')
            .select('*')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: true });
        return { data, error };
    }

    async saveMessage(conversationId: string, senderType: 'ai' | 'human_agent' | 'customer', content: string, skipDelivery: boolean = false) {
        const { data, error } = await supabase
            .from('messages')
            .insert({
                conversation_id: conversationId,
                sender_type: senderType,
                content: content
            });

        if (!error) {
            try {
                await supabase
                    .from('conversations')
                    .update({
                        last_message: content,
                        last_message_at: new Date().toISOString()
                    })
                    .eq('id', conversationId);

                if (!skipDelivery && (senderType === 'human_agent' || senderType === 'ai')) {
                    const { data: fetchRes, error: fetchErr } = await supabase.functions.invoke('deliver-message', {
                        body: { conversation_id: conversationId, content: content }
                    });
                    if (fetchErr) {
                        console.error('Error in deliver-message function:', fetchErr);
                        return { data: null, error: fetchErr };
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

    // --- NOTAS INTERNAS ---
    async saveInternalNote(conversationId: string, content: string, authorId?: string) {
        return await supabase
            .from('internal_notes')
            .insert({ conversation_id: conversationId, content, author_id: authorId });
    }

    async getInternalNotes(conversationId: string) {
        return await supabase
            .from('internal_notes')
            .select('*')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: false });
    }

    // --- TAGS ---
    async getMerchantTags(merchantId: string) {
        return await supabase.from('tags').select('*').eq('merchant_id', merchantId).order('name');
    }

    async addTagToConversation(conversationId: string, tagId: string) {
        return await supabase.from('conversation_tags').insert({ conversation_id: conversationId, tag_id: tagId });
    }

    async removeTagFromConversation(conversationId: string, tagId: string) {
        return await supabase.from('conversation_tags').delete().match({ conversation_id: conversationId, tag_id: tagId });
    }

    // --- REALTIME ---
    subscribeToMessages(conversationId: string, callback: (payload: any) => void) {
        return supabase
            .channel(`chat:${conversationId}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, callback)
            .subscribe();
    }

    subscribeToMerchantConversations(merchantId: string, callback: (payload: any) => void) {
        if (!merchantId || !this.isValidUUID(merchantId)) return null;
        return supabase
            .channel(`merchant:${merchantId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations', filter: `merchant_id=eq.${merchantId}` }, callback)
            .subscribe();
    }

    subscribeToBotSession(conversationId: string, callback: (payload: any) => void) {
        return supabase
            .channel(`session:${conversationId}`)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bot_flow_sessions', filter: `conversation_id=eq.${conversationId}` }, callback)
            .subscribe();
    }

    sendTypingIndicator(conversationId: string, isTyping: boolean) {
        return supabase.channel(`typing:${conversationId}`).send({
            type: 'broadcast',
            event: 'typing',
            payload: { isTyping, agentName: localStorage.getItem('user_name') }
        });
    }

    channel(name: string) { return supabase.channel(name); }
    unsubscribe(channel: any) { supabase.removeChannel(channel); }

    // --- NOTIFICACIONES ---
    async requestNotificationPermission() {
        if (!('Notification' in window)) return;
        return await Notification.requestPermission();
    }

    sendBrowserNotification(title: string, options?: NotificationOptions) {
        if (!('Notification' in window) || Notification.permission !== 'granted') return;
        new Notification(title, options);
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

    // --- UTILIDADES ---
    private isValidUUID(uuid: string): boolean {
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid);
    }
}
