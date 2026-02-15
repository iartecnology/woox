import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

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
    private liveCartsSubject = new BehaviorSubject<LiveCart[]>([]);
    liveCarts$ = this.liveCartsSubject.asObservable();

    updateLiveCart(cart: LiveCart) {
        const current = this.liveCartsSubject.value;
        const index = current.findIndex(c => c.id === cart.id);

        if (index !== -1) {
            current[index] = { ...cart, lastUpdate: new Date() };
        } else {
            current.push({ ...cart, lastUpdate: new Date() });
        }

        this.liveCartsSubject.next([...current]);
    }

    getLiveCartsByMerchant(merchantId: string) {
        return this.liveCartsSubject.value.filter(c => c.merchantId === merchantId);
    }

    deleteCart(id: string) {
        const current = this.liveCartsSubject.value.filter(c => c.id !== id);
        this.liveCartsSubject.next([...current]);
    }
}
