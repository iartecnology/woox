import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';

export interface Category {
    id: string;
    merchant_id: string;
    name: string;
}

export interface Product {
    id: string;
    merchant_id: string;
    category_id: string;
    name: string;
    description: string;
    price: number;
    image_url: string;
    is_available: boolean;
}

@Injectable({
    providedIn: 'root'
})
export class CatalogService {
    private supabaseService = inject(SupabaseService);

    // Métodos asíncronos para cargar datos reales
    async getCategoriesFromServer(merchantId: string) {
        const { data } = await this.supabaseService.getCategories(merchantId);
        return data || [];
    }

    async getProductsFromServer(merchantId: string) {
        const { data } = await this.supabaseService.getProducts(merchantId);
        return data || [];
    }

    // Adaptador para el generador de contexto de IA (ahora asíncrono o pre-cargado)
    // Para simplificar, mantendré una versión que pueda ser usada en getAIContext
    // pero idealmente getAIContext debería ser movido a SupabaseService o ser async.

    // He actualizado getAIContextForMerchant en super-admin para que maneje esto si es necesario,
    // pero vamos a hacer que CatalogService pueda proveer el string de contexto de forma async.

    async getAIContextForMerchant(merchantId: string): Promise<string> {
        const products = await this.getProductsFromServer(merchantId);
        const categories = await this.getCategoriesFromServer(merchantId);

        if (products.length === 0) {
            return 'No hay productos cargados en el menú aún.';
        }

        let context = 'Menú de Productos:\n';
        categories.forEach(cat => {
            const catProducts = products.filter(p => p.category_id === cat.id);
            if (catProducts.length > 0) {
                context += `\nCategoría: ${cat.name}\n`;
                catProducts.forEach(p => {
                    const status = p.is_available ? '[DISPONIBLE]' : '[AGOTADO]';
                    const desc = p.description ? `- ${p.description}` : '';
                    context += `- ${p.name} ($${p.price.toLocaleString()}) ${status} ${desc}\n`;
                });
            }
        });

        return context;
    }

    private formatProductStatus(isAvailable: boolean): string {
        return isAvailable ? '[DISPONIBLE]' : '[AGOTADO]';
    }
}
