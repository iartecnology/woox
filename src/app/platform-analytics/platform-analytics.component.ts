import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { SupabaseService } from '../supabase.service';

interface MerchantStats {
    id: string;
    name: string;
    conversations: number;
    ai_tokens: number;
    avg_response_time: number;
    total_orders: number;
    revenue: number;
    plan: string;
}

@Component({
    selector: 'app-platform-analytics',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './platform-analytics.component.html',
    styleUrl: './platform-analytics.component.css'
})
export class PlatformAnalyticsComponent implements OnInit {
    // Filtros
    selectedMerchant: string = 'all';
    selectedPeriod: string = '30d';
    startDate: string = '';
    endDate: string = '';

    merchants = [
        { id: 'all', name: 'Todas las Empresas' },
        { id: '1', name: 'Burgers & Co' },
        { id: '2', name: 'Pizza Woox' },
        { id: '3', name: 'Sushi Express' },
        { id: '4', name: 'Café Aroma' },
        { id: '5', name: 'Tacos El Rey' }
    ];

    periods = [
        { id: 'today', name: 'Hoy' },
        { id: '7d', name: 'Últimos 7 días' },
        { id: '30d', name: 'Últimos 30 días' },
        { id: 'custom', name: 'Rango Personalizado' }
    ];

    // Métricas Globales
    globalMetrics = {
        total_merchants: 12,
        active_merchants: 10,
        total_conversations: 8547,
        total_ai_tokens: 2847593,
        total_revenue: 45890,
        avg_response_time: 2.3
    };

    // Consumo de IA
    aiConsumption = {
        total_tokens: 2847593,
        input_tokens: 1523847,
        output_tokens: 1323746,
        cost_estimate: 142.38,
        conversations_handled: 6234,
        avg_tokens_per_conversation: 457
    };

    // Distribución por Provider
    aiProviders = [
        { name: 'OpenAI GPT-4o', merchants: 6, tokens: 1523847, percentage: 53.5, color: '#10B981' },
        { name: 'Google Gemini Pro', merchants: 3, tokens: 854123, percentage: 30.0, color: '#4F46E5' },
        { name: 'Anthropic Claude', merchants: 2, tokens: 325478, percentage: 11.4, color: '#F59E0B' },
        { name: 'DeepSeek R1', merchants: 1, tokens: 144145, percentage: 5.1, color: '#EF4444' }
    ];

    // Métricas de Conversaciones
    conversationMetrics = {
        total: 8547,
        ai_handled: 6234,
        human_handled: 2313,
        avg_duration: '4m 32s',
        conversion_rate: 68.5
    };

    // Top Comercios por Uso
    allMerchantsData: MerchantStats[] = [
        { id: '1', name: 'Burgers & Co', conversations: 1847, ai_tokens: 847593, avg_response_time: 1.8, total_orders: 523, revenue: 15670, plan: 'Enterprise' },
        { id: '2', name: 'Pizza Woox', conversations: 1234, ai_tokens: 523847, avg_response_time: 2.1, total_orders: 412, revenue: 12340, plan: 'Pro' },
        { id: '3', name: 'Sushi Express', conversations: 987, ai_tokens: 412589, avg_response_time: 2.5, total_orders: 356, revenue: 10890, plan: 'Pro' },
        { id: '4', name: 'Café Aroma', conversations: 756, ai_tokens: 325478, avg_response_time: 1.9, total_orders: 289, revenue: 8670, plan: 'Basic' },
        { id: '5', name: 'Tacos El Rey', conversations: 623, ai_tokens: 287456, avg_response_time: 2.3, total_orders: 234, revenue: 7020, plan: 'Pro' },
        { id: '6', name: 'Dim Sum Garden', conversations: 580, ai_tokens: 210000, avg_response_time: 2.0, total_orders: 210, revenue: 6300, plan: 'Enterprise' },
        { id: '7', name: 'Pasta Palace', conversations: 540, ai_tokens: 195000, avg_response_time: 2.2, total_orders: 198, revenue: 5940, plan: 'Pro' },
        { id: '8', name: 'Steak & Smoke', conversations: 510, ai_tokens: 180000, avg_response_time: 1.7, total_orders: 185, revenue: 5550, plan: 'Pro' },
        { id: '9', name: 'Waffle House', conversations: 480, ai_tokens: 165000, avg_response_time: 2.4, total_orders: 170, revenue: 5100, plan: 'Basic' },
        { id: '10', name: 'Green Bowl', conversations: 450, ai_tokens: 150000, avg_response_time: 1.9, total_orders: 160, revenue: 4800, plan: 'Pro' }
    ];

    topMerchants: MerchantStats[] = [];

    // Paginación y Ordenación
    sortKey: keyof MerchantStats = 'conversations';
    sortDirection: 'asc' | 'desc' = 'desc';
    currentPage: number = 1;
    itemsPerPage: number = 5;
    Math = Math;

    // Actividad por Hora
    hourlyActivity = [
        { hour: '00:00', conversations: 45 },
        { hour: '03:00', conversations: 23 },
        { hour: '06:00', conversations: 67 },
        { hour: '09:00', conversations: 234 },
        { hour: '12:00', conversations: 456 },
        { hour: '15:00', conversations: 389 },
        { hour: '18:00', conversations: 512 },
        { hour: '21:00', conversations: 378 }
    ];

    // Crecimiento Mensual
    monthlyGrowth = [
        { month: 'Ene', merchants: 8, revenue: 28500 },
        { month: 'Feb', merchants: 9, revenue: 32100 },
        { month: 'Mar', merchants: 10, revenue: 38700 },
        { month: 'Abr', merchants: 12, revenue: 45890 }
    ];

    private route = inject(ActivatedRoute);
    private supabaseService = inject(SupabaseService);

    constructor() { }

    async ngOnInit(): Promise<void> {
        // Cargar lista de comercios reales
        const { data } = await this.supabaseService.getMerchants();
        if (data && data.length > 0) {
            this.merchants = [
                { id: 'all', name: 'Todas las Empresas' },
                ...data.map(m => ({ id: m.id, name: m.name }))
            ];
        }

        this.route.queryParams.subscribe(params => {
            if (params['merchantId']) {
                this.selectedMerchant = params['merchantId'];
            }
            this.onFilterChange();
        });
    }

    formatNumber(num: number): string {
        return new Intl.NumberFormat('es-CO').format(num);
    }

    formatCurrency(num: number): string {
        return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(num);
    }

    getMaxConversations(): number {
        return Math.max(...this.hourlyActivity.map(h => h.conversations));
    }

    onFilterChange(): void {
        // Factor de variación por comercio (para que no se vea igual)
        let merchantFactor = 1;
        if (this.selectedMerchant !== 'all') {
            // Usar el primer caracter del ID para generar una variación determinista
            const idChar = this.selectedMerchant.toString().charCodeAt(0) || 0;
            merchantFactor = 0.1 + (idChar % 5) * 0.15; // Entre 0.1 y 0.7
        }

        let periodMultiplier = 1;
        switch (this.selectedPeriod) {
            case 'today': periodMultiplier = 0.05; break;
            case '7d': periodMultiplier = 0.25; break;
            case '30d': periodMultiplier = 1; break;
            case 'custom': periodMultiplier = 0.5; break;
        }

        const finalMultiplier = merchantFactor * periodMultiplier;

        this.globalMetrics = {
            ...this.globalMetrics,
            total_conversations: Math.floor(8547 * finalMultiplier),
            total_ai_tokens: Math.floor(2847593 * finalMultiplier),
            total_revenue: Math.floor(45890 * finalMultiplier)
        };

        this.aiConsumption = {
            ...this.aiConsumption,
            total_tokens: Math.floor(2847593 * finalMultiplier),
            conversations_handled: Math.floor(6234 * finalMultiplier)
        };

        let filtered = [...this.allMerchantsData];
        if (this.selectedMerchant !== 'all') {
            filtered = filtered.filter(m => m.id === this.selectedMerchant);

            // Si no está en el mockup, agregar una fila ficticia basada en el real
            if (filtered.length === 0) {
                const realMerchant = this.merchants.find(m => m.id === this.selectedMerchant);
                if (realMerchant) {
                    filtered = [{
                        id: realMerchant.id,
                        name: realMerchant.name,
                        conversations: Math.floor(1000 * merchantFactor),
                        ai_tokens: Math.floor(500000 * merchantFactor),
                        avg_response_time: 2.1,
                        total_orders: Math.floor(200 * merchantFactor),
                        revenue: Math.floor(6000 * merchantFactor),
                        plan: 'Pro'
                    }];
                }
            }
        }

        // Aplicar multiplicador del periodo
        filtered = filtered.map(m => ({
            ...m,
            conversations: Math.floor(m.conversations * periodMultiplier),
            revenue: Math.floor(m.revenue * periodMultiplier)
        }));

        // Aplicar Ordenación
        filtered.sort((a, b) => {
            const valA = a[this.sortKey];
            const valB = b[this.sortKey];

            if (valA < valB) return this.sortDirection === 'asc' ? -1 : 1;
            if (valA > valB) return this.sortDirection === 'asc' ? 1 : -1;
            return 0;
        });

        this.topMerchants = filtered;
        this.currentPage = 1;
    }

    exportReport(): void {
        const merchantName = this.merchants.find(m => m.id === this.selectedMerchant)?.name || 'General';
        alert(`📊 Generando informe para: ${merchantName}\nPeriodo: ${this.selectedPeriod}\n\nEspere un momento...`);

        // Simular lógica de generación
        setTimeout(() => {
            alert(`✅ Informe "${merchantName}_Analytics.pdf" generado y descargado correctamente.`);
        }, 1500);
    }

    get paginatedTopMerchants(): MerchantStats[] {
        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        return this.topMerchants.slice(startIndex, startIndex + this.itemsPerPage);
    }

    get totalPages(): number {
        return Math.ceil(this.topMerchants.length / this.itemsPerPage);
    }

    get pagesArray(): number[] {
        return Array.from({ length: this.totalPages }, (_, i) => i + 1);
    }

    toggleSort(key: keyof MerchantStats): void {
        if (this.sortKey === key) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortKey = key;
            this.sortDirection = 'asc';
        }
        this.onFilterChange();
    }

    changePage(page: number): void {
        if (page >= 1 && page <= this.totalPages) {
            this.currentPage = page;
        }
    }
}
