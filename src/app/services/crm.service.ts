import { Injectable } from '@angular/core';
import { supabase } from '../supabase-config';

/**
 * CrmService — Gestión de Clientes, Estadísticas y Segmentación
 * Extraído del monolito supabase.service.ts.
 */
@Injectable({ providedIn: 'root' })
export class CrmService {

    async getMerchantCustomers(merchantId: string) {
        return await supabase
            .from('customers')
            .select('*')
            .eq('merchant_id', merchantId)
            .order('clv', { ascending: false });
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

    async getOrCreateCustomer(merchant_id: string, phone: string, full_name?: string) {
        const { data: existing } = await supabase
            .from('customers')
            .select('id')
            .eq('merchant_id', merchant_id)
            .eq('phone', phone)
            .maybeSingle();

        if (existing) return existing.id;

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
}
