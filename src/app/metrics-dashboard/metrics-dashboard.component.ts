import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../supabase.service';
import { supabase } from '../supabase-config';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartData, ChartType } from 'chart.js';

interface MetricCard {
    title: string;
    value: string;
    change: string;
    isPositive: boolean;
    icon: string;
}

import { FormsModule } from '@angular/forms';

@Component({
    selector: 'app-metrics-dashboard',
    standalone: true,
    imports: [CommonModule, BaseChartDirective, FormsModule],
    templateUrl: './metrics-dashboard.component.html',
    styleUrl: './metrics-dashboard.component.css'
})
export class MetricsDashboardComponent implements OnInit, OnDestroy {
    merchantId: string = '';
    merchantName: string = '';
    isLoading: boolean = true;
    private realtimeChannel: any;

    cards: MetricCard[] = [];
    allOrders: any[] = [];
    recentOrders: any[] = [];

    // --- CHART CONFIGURATION ---

    // 1. Line Chart: Ventas (Sales Trend)
    public lineChartData: ChartConfiguration['data'] = {
        datasets: [],
        labels: []
    };
    public lineChartOptions: ChartConfiguration['options'] = {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
            mode: 'index',
            intersect: false,
        },
        plugins: {
            legend: { display: true, position: 'top' }
        },
        scales: {
            y: {
                type: 'linear',
                display: true,
                position: 'left',
                beginAtZero: true,
                grid: { color: 'rgba(0,0,0,0.05)' },
                title: { display: true, text: 'Ventas ($)' }
            },
            y1: {
                type: 'linear',
                display: true,
                position: 'right',
                beginAtZero: true,
                grid: { drawOnChartArea: false },
                title: { display: true, text: 'Pedidos (#)' }
            },
            x: {
                grid: { display: false }
            }
        }
    };
    public lineChartType: ChartType = 'line';

    // 2. Doughnut Chart: IA vs Humanos
    public doughnutChartData: ChartData<'doughnut'> = {
        labels: ['IA (Automático)', 'Humano (Manual)'],
        datasets: [
            {
                data: [0, 0],
                backgroundColor: ['#4F46E5', '#10B981'],
                hoverBackgroundColor: ['#4338ca', '#059669'],
                hoverOffset: 4
            }
        ]
    };
    public doughnutChartOptions: any = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { position: 'bottom' }
        },
        cutout: '70%'
    };
    public doughnutChartType: ChartType = 'doughnut';

    // 3. Bar Chart: Omnicanalidad (Channels)
    public barChartData: ChartData<'bar'> = {
        labels: ['WhatsApp', 'Telegram', 'Instagram', 'Web'],
        datasets: [
            {
                data: [0, 0, 0, 0],
                label: 'Pedidos por Canal',
                backgroundColor: ['#25D366', '#0088cc', '#E1306C', '#4F46E5'],
                borderRadius: 8
            }
        ]
    };
    public barChartOptions: ChartConfiguration['options'] = {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: {
            legend: { display: false }
        },
        scales: {
            x: { beginAtZero: true, grid: { display: false } },
            y: { grid: { display: false } }
        }
    };
    public barChartType: ChartType = 'bar';


    // Paginación y Ordenación
    sortKey: string = 'created_at';
    sortDirection: 'asc' | 'desc' = 'desc';
    currentPage: number = 1;
    itemsPerPage: number = 10;
    searchTerm: string = '';
    Math = Math;

    // Filtro de Tiempo
    selectedTimeRange: '24h' | '7d' | '30d' | '12m' | 'custom' = '7d';
    customStartDate: string = '';
    customEndDate: string = '';

    private supabaseService = inject(SupabaseService);
    private cdr = inject(ChangeDetectorRef);

    async ngOnInit() {
        this.merchantId = localStorage.getItem('active_merchant_id') || '';
        this.merchantName = localStorage.getItem('merchant_name') || 'Mi Comercio';

        if (this.merchantId) {
            await this.loadData();
            this.setupRealtime();
        }
    }

    ngOnDestroy() {
        if (this.realtimeChannel) {
            this.supabaseService.unsubscribeChannel(this.realtimeChannel);
        }
    }

    setupRealtime() {
        // Suscribirse a cambios en la tabla orders para este comercio
        this.realtimeChannel = supabase
            .channel(`metrics-orders-${this.merchantId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'orders',
                    filter: `merchant_id=eq.${this.merchantId}`
                },
                (payload) => {
                    console.log('Cambio detectado en órdenes (Realtime Metrics):', payload);
                    // Recargar datos suavemente sin mostrar el spinner global
                    this.refreshDataSilent();
                }
            )
            .subscribe();
    }

    async refreshDataSilent() {
        const { data } = await this.supabaseService.getOrders(this.merchantId);
        if (data) {
            this.allOrders = data.map((o: any) => ({
                id: o.id.substring(0, 8).toUpperCase(),
                customer: o.customers?.full_name || 'Cliente Anon',
                total: o.total,
                status: o.status,
                created_at: o.created_at,
                closing_agent_type: o.closing_agent_type,
                channel: o.channel || 'web',
                time: new Date(o.created_at).toLocaleTimeString(),
                date: new Date(o.created_at).toLocaleDateString(),
                agent: o.closing_agent_type === 'ai' ? '🤖 IA' : '👤 Humano'
            }));

            this.applyPeriodFilter();
            this.cdr.detectChanges();
        }
    }

    async loadData() {
        this.isLoading = true;
        this.cdr.detectChanges();

        const { data, error } = await this.supabaseService.getOrders(this.merchantId);

        if (data) {
            this.allOrders = data.map((o: any) => ({
                id: o.id.substring(0, 8).toUpperCase(),
                customer: o.customers?.full_name || 'Cliente Anon',
                total: o.total,
                status: o.status,
                created_at: o.created_at,
                closing_agent_type: o.closing_agent_type,
                channel: o.channel || 'web',
                time: new Date(o.created_at).toLocaleTimeString(),
                date: new Date(o.created_at).toLocaleDateString(),
                agent: o.closing_agent_type === 'ai' ? '🤖 IA' : '👤 Humano'
            }));

            this.applyPeriodFilter();
        }

        this.isLoading = false;
        this.cdr.detectChanges();
    }

    setChartRange(range: '24h' | '7d' | '30d' | '12m' | 'custom') {
        this.selectedTimeRange = range;
        if (range !== 'custom') {
            this.applyPeriodFilter();
        }
    }

    applyPeriodFilter() {
        if (!this.allOrders || this.allOrders.length === 0) return;

        const now = new Date();
        let cutoff: Date;

        switch (this.selectedTimeRange) {
            case '24h': cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000); break;
            case '7d': cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); break;
            case '30d': cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); break;
            case '12m': cutoff = new Date(now.getFullYear(), now.getMonth() - 11, 1); break;
            case 'custom': cutoff = this.customStartDate ? new Date(this.customStartDate) : new Date(0); break;
        }

        let filtered = this.allOrders.filter(o => {
            const orderDate = new Date(o.created_at);
            if (this.selectedTimeRange === 'custom' && this.customEndDate) {
                const endLimit = new Date(this.customEndDate);
                endLimit.setHours(23, 59, 59, 999);
                return orderDate >= cutoff && orderDate <= endLimit;
            }
            return orderDate >= cutoff;
        });

        // 1. Calcular Cards
        const totalSales = filtered.reduce((acc, curr) => acc + Number(curr.total), 0);
        const totalOrders = filtered.length;
        const aiOrders = filtered.filter(o => o.closing_agent_type === 'ai').length;
        const conversionRate = totalOrders > 0 ? Math.round((aiOrders / totalOrders) * 100) : 0;

        this.cards = [
            { title: 'Ventas Periodo', value: `$${totalSales.toLocaleString()}`, change: 'En este periodo', isPositive: true, icon: '💰' },
            { title: 'Pedidos Periodo', value: totalOrders.toString(), change: 'En este periodo', isPositive: true, icon: '📦' },
            { title: 'Conversión IA', value: `${conversionRate}%`, change: 'En este periodo', isPositive: true, icon: '🤖' },
            { title: 'Tiempo Promedio (Est.)', value: '24 min', change: 'Estable', isPositive: true, icon: '⏱️' }
        ];

        // 2. Actualizar Doughnut
        this.doughnutChartData = {
            ...this.doughnutChartData,
            datasets: [{
                ...this.doughnutChartData.datasets[0],
                data: [aiOrders, totalOrders - aiOrders]
            }]
        };

        // 3. Calcular Omnicanalidad
        const channels = {
            whatsapp: filtered.filter(o => o.channel === 'whatsapp').length,
            telegram: filtered.filter(o => o.channel === 'telegram').length,
            instagram: filtered.filter(o => o.channel === 'instagram').length,
            web: filtered.filter(o => o.channel === 'web').length
        };

        this.barChartData = {
            ...this.barChartData,
            datasets: [{
                ...this.barChartData.datasets[0],
                data: [channels.whatsapp, channels.telegram, channels.instagram, channels.web]
            }]
        };

        // 4. Procesar Gráfica de Tendencia y Tabla
        this.processSalesChart();
        this.updateOrders();

        this.cdr.detectChanges();
    }


    processSalesChart() {
        if (!this.allOrders || this.allOrders.length === 0) return;

        const now = new Date();
        let filteredOrders: any[] = [];
        let labels: string[] = [];

        let salesMap = new Map<string, number>();
        let countMap = new Map<string, number>();

        // 1. Filtrar y Agrupar
        if (this.selectedTimeRange === '24h') {
            const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            filteredOrders = this.allOrders.filter(o => new Date(o.created_at) >= cutoff);

            filteredOrders.forEach(o => {
                const d = new Date(o.created_at);
                const label = `${d.getHours().toString().padStart(2, '0')}:00`;
                salesMap.set(label, (salesMap.get(label) || 0) + o.total);
                countMap.set(label, (countMap.get(label) || 0) + 1);
            });
            labels = Array.from(salesMap.keys()).sort();

        } else if (this.selectedTimeRange === '7d' || this.selectedTimeRange === '30d') {
            const days = this.selectedTimeRange === '7d' ? 7 : 30;
            const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
            filteredOrders = this.allOrders.filter(o => new Date(o.created_at) >= cutoff);

            filteredOrders.forEach(o => {
                const d = new Date(o.created_at);
                const label = `${d.getDate()}/${d.getMonth() + 1}`;
                salesMap.set(label, (salesMap.get(label) || 0) + o.total);
                countMap.set(label, (countMap.get(label) || 0) + 1);
            });

            labels = Array.from(salesMap.keys()).sort((a, b) => {
                const [da, ma] = a.split('/').map(Number);
                const [db, mb] = b.split('/').map(Number);
                return (ma - mb) || (da - db);
            });

        } else if (this.selectedTimeRange === '12m') {
            const cutoff = new Date(now.getFullYear(), now.getMonth() - 11, 1);
            filteredOrders = this.allOrders.filter(o => new Date(o.created_at) >= cutoff);

            const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
            filteredOrders.forEach(o => {
                const d = new Date(o.created_at);
                const sortKey = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
                const label = monthNames[d.getMonth()];
                salesMap.set(sortKey + '|' + label, (salesMap.get(sortKey + '|' + label) || 0) + o.total);
                countMap.set(sortKey + '|' + label, (countMap.get(sortKey + '|' + label) || 0) + 1);
            });

            const sortedKeys = Array.from(salesMap.keys()).sort();
            labels = sortedKeys.map(k => k.split('|')[1]);

            // Rebuild maps in order
            const newSalesMap = new Map<string, number>();
            const newCountMap = new Map<string, number>();
            sortedKeys.forEach(k => {
                const lbl = k.split('|')[1];
                newSalesMap.set(lbl, salesMap.get(k)!);
                newCountMap.set(lbl, countMap.get(k)!);
            });
            salesMap = newSalesMap;
            countMap = newCountMap;
        }

        // 2. Actualizar Gráfica
        this.lineChartData = {
            ...this.lineChartData,
            labels: labels,
            datasets: [
                {
                    data: labels.map(l => salesMap.get(l) || 0),
                    label: 'Ventas ($)',
                    yAxisID: 'y',
                    backgroundColor: 'rgba(79, 70, 229, 0.2)',
                    borderColor: '#4F46E5',
                    pointBackgroundColor: '#4F46E5',
                    pointBorderColor: '#fff',
                    fill: 'origin',
                },
                {
                    data: labels.map(l => countMap.get(l) || 0),
                    label: 'Pedidos (#)',
                    yAxisID: 'y1',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    borderColor: '#10B981',
                    pointBackgroundColor: '#10B981',
                    pointBorderColor: '#fff',
                    borderDash: [5, 5],
                    fill: false,
                    type: 'line'
                }
            ]
        };
    }

    getStatusLabel(status: string): string {
        const labels: { [key: string]: string } = {
            'pending': 'Pendiente',
            'cooking': 'En Cocina',
            'preparing': 'Preparando',
            'ready': 'Listo',
            'delivered': 'Entregado',
            'cancelled': 'Cancelado'
        };
        return labels[status] || status;
    }

    updateOrders() {
        let filtered = [...this.allOrders];

        // Aplicar Filtro de Búsqueda
        if (this.searchTerm) {
            const term = this.searchTerm.toLowerCase();
            filtered = filtered.filter(o =>
                o.id.toLowerCase().includes(term) ||
                o.customer.toLowerCase().includes(term)
            );
        }

        // Aplicar Ordenación
        filtered.sort((a, b) => {
            const valA = a[this.sortKey];
            const valB = b[this.sortKey];

            if (valA < valB) return this.sortDirection === 'asc' ? -1 : 1;
            if (valA > valB) return this.sortDirection === 'asc' ? 1 : -1;
            return 0;
        });

        this.recentOrders = filtered;
    }

    onSearch() {
        this.currentPage = 1;
        this.updateOrders();
    }

    get paginatedOrders(): any[] {
        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        return this.recentOrders.slice(startIndex, startIndex + this.itemsPerPage);
    }

    get totalPages(): number {
        return Math.ceil(this.recentOrders.length / this.itemsPerPage);
    }

    get pagesArray(): number[] {
        return Array.from({ length: this.totalPages }, (_, i) => i + 1);
    }

    toggleSort(key: string): void {
        if (this.sortKey === key) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortKey = key;
            this.sortDirection = 'asc';
        }
        this.updateOrders();
        this.currentPage = 1;
    }

    changePage(page: number): void {
        if (page >= 1 && page <= this.totalPages) {
            this.currentPage = page;
        }
    }
}
