import { Injectable, signal } from '@angular/core';
import { supabase } from '../supabase-config';

/**
 * OrderService — Gestión de Pedidos, Items y Suscripciones de pedidos
 * Extraído del monolito supabase.service.ts.
 */
@Injectable({ providedIn: 'root' })
export class OrderService {

    unreadOrdersCount = signal(0);

    async getOrders(merchantId: string) {
        const { data, error } = await supabase
            .from('orders')
            .select('*, customers(full_name), order_items(*, products(name, id))')
            .eq('merchant_id', merchantId)
            .order('created_at', { ascending: false });
        return { data, error };
    }

    async createOrder(orderData: any) {
        console.log('🚀 [OrderService] Creando pedido en DB...', orderData);
        const { data, error } = await supabase
            .from('orders')
            .insert(orderData)
            .select('*');

        if (error) {
            console.error('❌ [OrderService] Error creando pedido:', error);
            return { data: null, error };
        }
        const newOrder = data && data.length > 0 ? data[0] : null;
        return { data: newOrder, error: null };
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

    async updateOrderStatus(orderId: string, status: string) {
        return await supabase.from('orders').update({ status }).eq('id', orderId);
    }

    async deleteOrder(orderId: string) {
        return await supabase.from('orders').delete().eq('id', orderId);
    }

    async deleteAllOrders(merchantId: string) {
        return await supabase.from('orders').delete().eq('merchant_id', merchantId);
    }

    async unlinkOrdersFromConversation(conversationId: string) {
        return await supabase.from('orders').update({ conversation_id: null }).eq('conversation_id', conversationId);
    }

    async unlinkOrdersFromAllConversations(merchantId: string) {
        return await supabase.from('orders').update({ conversation_id: null }).eq('merchant_id', merchantId);
    }

    async getConversationByOrderId(orderId: string) {
        return await supabase.from('conversations').select('id').eq('order_id', orderId).single();
    }

    // --- REALTIME ---
    subscribeToOrders(merchantId: string, callback: () => void) {
        if (!merchantId) return null;
        return supabase
            .channel(`public:orders:merchant:${merchantId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `merchant_id=eq.${merchantId}` },
                (payload) => { callback(); })
            .subscribe();
    }

    subscribeToMerchantOrders(merchantId: string, callback: (payload: any) => void) {
        if (!merchantId) return null;
        return supabase
            .channel(`merchant_orders:${merchantId}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders', filter: `merchant_id=eq.${merchantId}` }, callback)
            .subscribe();
    }

    async refreshGlobalUnreadOrdersCount(merchantId: string) {
        if (!merchantId) return;
        const { count, error } = await supabase
            .from('orders')
            .select('*', { count: 'exact', head: true })
            .eq('merchant_id', merchantId)
            .eq('status', 'pending');
        if (!error && count !== null) {
            this.unreadOrdersCount.set(count);
        }
    }

    async unsubscribeChannel(channel: any) {
        if (channel) await supabase.removeChannel(channel);
    }
}
