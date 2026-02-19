import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../supabase.service';
import { NotificationService } from '../notification.service';
import { FormsModule } from '@angular/forms';
import {
    DragDropModule,
    CdkDragDrop,
    moveItemInArray,
    transferArrayItem
} from '@angular/cdk/drag-drop';

interface OrderItem {
    product_name: string;
    quantity: number;
    unit_price: number;
}

interface Order {
    uuid: string; // El ID real de Supabase
    id: string; // El ID corto para mostrar
    customer_name: string;
    channel: 'whatsapp' | 'telegram' | 'instagram' | 'web';
    items: OrderItem[];
    total: number;
    status: 'pending' | 'cooking' | 'ready' | 'delivered' | 'cancelled';
    created_at: Date;
    delivery_address: string;
    processing?: boolean; // Para estado de carga local
}

@Component({
    selector: 'app-order-management',
    standalone: true,
    imports: [CommonModule, DragDropModule, FormsModule],
    templateUrl: './order-management.component.html',
    styleUrl: './order-management.component.css'
})
export class OrderManagementComponent implements OnInit {
    orders: Order[] = [];
    selectedOrder: Order | null = null;
    merchantId: string = '';
    isLoading: boolean = false;
    viewMode: 'kanban' | 'list' = (localStorage.getItem('order_view_mode') as 'kanban' | 'list') || 'list';

    // Búsqueda y Filtros
    searchTerm: string = '';
    selectedStatus: string = 'all';

    // Paginación
    currentPage: number = 1;
    itemsPerPage: number = 10;

    get filteredOrders() {
        let filtered = this.orders;

        if (this.selectedStatus !== 'all') {
            filtered = filtered.filter(o => o.status === this.selectedStatus);
        }

        if (this.searchTerm) {
            const query = this.searchTerm.toLowerCase();
            filtered = filtered.filter(o =>
                o.id.toLowerCase().includes(query) ||
                o.customer_name.toLowerCase().includes(query)
            );
        }

        return filtered;
    }

    get paginatedOrders() {
        const start = (this.currentPage - 1) * this.itemsPerPage;
        return this.filteredOrders.slice(start, start + this.itemsPerPage);
    }

    get totalPages() {
        return Math.ceil(this.filteredOrders.length / this.itemsPerPage);
    }

    get statusCounts() {
        return {
            all: this.orders.length,
            pending: this.orders.filter(o => o.status === 'pending').length,
            cooking: this.orders.filter(o => o.status === 'cooking').length,
            ready: this.orders.filter(o => o.status === 'ready').length,
            delivered: this.orders.filter(o => o.status === 'delivered').length,
            cancelled: this.orders.filter(o => o.status === 'cancelled').length
        };
    }

    onSearch() {
        this.currentPage = 1;
    }

    setStatusFilter(status: string) {
        this.selectedStatus = status;
        this.currentPage = 1;
    }

    get pagesArray(): number[] {
        return Array.from({ length: this.totalPages }, (_, i) => i + 1);
    }

    setPage(page: number) {
        if (page >= 1 && page <= this.totalPages) {
            this.currentPage = page;
        }
    }

    Math = Math;

    private cdr = inject(ChangeDetectorRef);

    private supabaseService = inject(SupabaseService);
    private notificationService = inject(NotificationService);

    constructor() { }

    async ngOnInit() {
        this.merchantId = localStorage.getItem('active_merchant_id') || '';
        if (this.merchantId) {
            await this.loadOrders();
        }
    }

    async loadOrders() {
        this.isLoading = true;
        this.cdr.detectChanges();

        try {
            const { data, error } = await this.supabaseService.getOrders(this.merchantId);
            if (data) {
                const oldSelectedUuid = this.selectedOrder?.uuid;

                this.orders = data.map((o: any) => ({
                    uuid: o.id,
                    id: '#' + String(o.order_number || 0).padStart(3, '0'),
                    customer_name: o.customers?.full_name || 'Cliente sin nombre',
                    channel: o.channel || 'web',
                    total: o.total,
                    status: o.status,
                    created_at: new Date(o.created_at),
                    delivery_address: o.delivery_address || 'Sin dirección',
                    items: o.order_items.map((item: any) => ({
                        product_name: item.products?.name || 'Producto eliminado',
                        quantity: item.quantity,
                        unit_price: item.unit_price
                    }))
                }));

                // Re-sincronizar el pedido seleccionado con el objeto fresco de la lista
                if (oldSelectedUuid) {
                    this.selectedOrder = this.orders.find(o => o.uuid === oldSelectedUuid) || this.orders[0] || null;
                } else if (this.orders.length > 0) {
                    this.selectedOrder = this.orders[0];
                }
            }
        } finally {
            this.isLoading = false;
            this.cdr.detectChanges();
        }
    }

    get ordersBySearch() {
        if (!this.searchTerm) return this.orders;
        const query = this.searchTerm.toLowerCase();
        return this.orders.filter(o =>
            o.id.toLowerCase().includes(query) ||
            o.customer_name.toLowerCase().includes(query)
        );
    }

    get ordersByStatus() {
        const source = this.ordersBySearch;
        return {
            all: source.length,
            pending: source.filter(o => o.status === 'pending'),
            cooking: source.filter(o => o.status === 'cooking'),
            ready: source.filter(o => o.status === 'ready'),
            delivered: source.filter(o => o.status === 'delivered'),
            cancelled: source.filter(o => o.status === 'cancelled')
        };
    }

    selectOrder(order: Order) {
        this.selectedOrder = order;
    }

    async updateStatus(order: Order, newStatus: any) {
        if (!order.uuid) {
            this.notificationService.show('ID de pedido no válido', 'error');
            return;
        }

        this.isLoading = true;
        this.cdr.detectChanges();

        const originalStatus = order.status;
        try {
            // Actualización local inmediata
            order.status = newStatus;
            order.processing = true;
            this.orders = [...this.orders];
            this.cdr.detectChanges();

            const { error } = await this.supabaseService.updateOrderStatus(order.uuid, newStatus);

            if (error) {
                console.error('Error al actualizar estado:', error);
                order.status = originalStatus;
                this.notificationService.show('No se pudo actualizar el estado: ' + error.message, 'error');
                return;
            }

            this.notificationService.show(`Pedido actualizado a: ${this.getStatusLabel(newStatus)}`, 'success');
            this.notifyCustomer(order);
            await this.loadOrders();
        } catch (err: any) {
            console.error('Excepción en updateStatus:', err);
            order.status = originalStatus;
            this.notificationService.show('Ocurrió un error inesperado', 'error');
        } finally {
            order.processing = false;
            this.isLoading = false;
            this.cdr.detectChanges();
        }
    }

    async onDrop(event: CdkDragDrop<Order[]>, newStatus: string) {
        if (event.previousContainer === event.container) {
            moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
        } else {
            const order = event.previousContainer.data[event.previousIndex];
            await this.updateStatus(order, newStatus);
        }
    }

    async moveBack(order: Order) {
        const prevStatus = this.getBackStatus(order.status);
        if (prevStatus) {
            await this.updateStatus(order, prevStatus);
        }
    }

    private getBackStatus(current: string): string | null {
        const statuses: any = {
            'cooking': 'pending',
            'ready': 'cooking',
            'delivered': 'ready',
            'cancelled': 'pending'
        };
        return statuses[current] || null;
    }

    notifyCustomer(order: Order) {
        const statusMessages: { [key: string]: string } = {
            cooking: '👨‍🍳 ¡Tu pedido ya está en la cocina!',
            ready: '✅ ¡Tu pedido está listo y en camino!',
            delivered: '📦 ¡Pedido entregado! ¡Que lo disfrutes!',
            cancelled: '❌ Tu pedido ha sido cancelado.'
        };
        console.log(`Mensaje enviado a ${order.customer_name} via ${order.channel}: ${statusMessages[order.status]}`);
    }

    getStatusLabel(status: string): string {
        const labels: { [key: string]: string } = {
            'pending': 'Pendiente',
            'cooking': 'En Cocina',
            'ready': 'Listo',
            'delivered': 'Entregado',
            'cancelled': 'Cancelado'
        };
        return labels[status] || status;
    }

    toggleView(mode: 'kanban' | 'list') {
        this.viewMode = mode;
        localStorage.setItem('order_view_mode', mode);
    }
}
