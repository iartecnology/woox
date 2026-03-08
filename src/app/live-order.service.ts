import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { inject } from '@angular/core';

export interface LiveCart {
    id: string;
    merchantId: string;
    customerName: string;
    customerPhone?: string;
    items: any[];
    total: number;
    lastUpdate: Date;
    status: 'active' | 'idle' | 'confirmed' | 'abandoned';
    sentiment?: 'happy' | 'neutral' | 'confused' | 'frustrated';
}

@Injectable({
    providedIn: 'root'
})
export class LiveOrderService {
    private supabaseService = inject(SupabaseService);
    private liveCartsSubject = new BehaviorSubject<LiveCart[]>([]);
    liveCarts$ = this.liveCartsSubject.asObservable();

    constructor() { }

    /**
     * Se suscribe a los carritos "en vivo" (conversaciones activas con datos de compra)
     */
    subscribeToLiveCarts(merchantId: string) {
        // 1. Carga inicial de conversaciones con carritos activos
        this.loadActiveCarts(merchantId);

        // 2. Suscripción Realtime a la tabla conversations
        return (this.supabaseService as any).supabase
            .channel(`live_carts:${merchantId}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'conversations',
                filter: `merchant_id=eq.${merchantId}`
            }, (payload: any) => {
                this.handleConversationChange(payload);
            })
            .subscribe();
    }

    private async loadActiveCarts(merchantId: string) {
        const { data, error } = await (this.supabaseService as any).supabase
            .from('conversations')
            .select('*, customers(full_name)')
            .eq('merchant_id', merchantId)
            .neq('typing_data', '{}')
            .order('updated_at', { ascending: false });

        if (data) {
            const carts = data.map((conv: any) => this.mapConvToCart(conv));
            this.liveCartsSubject.next(carts);
        }
    }

    private handleConversationChange(payload: any) {
        const current = this.liveCartsSubject.value;
        const conv = payload.new;

        if (!conv.typing_data || JSON.stringify(conv.typing_data) === '{}') {
            // Si el carrito se vació o la conversación se cerró, lo quitamos de la vista live
            this.liveCartsSubject.next(current.filter(c => c.id !== conv.id));
            return;
        }

        const cart = this.mapConvToCart(conv);
        const index = current.findIndex(c => c.id === cart.id);

        if (index !== -1) {
            current[index] = cart;
        } else {
            current.unshift(cart);
        }

        this.liveCartsSubject.next([...current]);
    }

    private mapConvToCart(conv: any): LiveCart {
        const typing = conv.typing_data || {};
        return {
            id: conv.id,
            merchantId: conv.merchant_id,
            customerName: conv.customers?.full_name || conv.customer_identifier || 'Cliente Anónimo',
            items: typing.items || [],
            total: typing.total || 0,
            lastUpdate: new Date(conv.updated_at || conv.last_message_at),
            status: conv.status === 'open' ? 'active' : 'confirmed',
            sentiment: conv.sentiment || 'neutral'
        };
    }

    // Método para el Simulador (Persistencia en DB)
    async updateSimulatorCart(convId: string, cartData: any, sentiment: string = 'neutral') {
        return await (this.supabaseService as any).supabase
            .from('conversations')
            .update({
                typing_data: cartData,
                sentiment: sentiment,
                updated_at: new Date().toISOString()
            })
            .eq('id', convId);
    }

    unsubscribeChannel(channel: any) {
        this.supabaseService.unsubscribe(channel);
    }
}
