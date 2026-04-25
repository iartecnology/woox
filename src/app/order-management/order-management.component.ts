import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../supabase.service';
import { NotificationService } from '../notification.service';
import { MobileService } from '../mobile.service';
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
    notes?: string;
    extras?: string;
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
    notes?: string;
    metadata?: any;
    processing?: boolean; // Para estado de carga local
}

@Component({
    selector: 'app-order-management',
    standalone: true,
    imports: [CommonModule, DragDropModule, FormsModule],
    templateUrl: './order-management.component.html',
    styleUrl: './order-management.component.css'
})
export class OrderManagementComponent implements OnInit, OnDestroy {
    orders: Order[] = [];
    selectedOrder: Order | null = null;
    merchantId: string = '';
    isLoading: boolean = false;
    isSuperAdmin: boolean = false;
    showDeleteOrderModal: boolean = false;
    orderToDelete: Order | null = null;
    viewMode: 'kanban' | 'list' = (localStorage.getItem('order_view_mode') as 'kanban' | 'list') || 'list';

    // Búsqueda y Filtros
    searchTerm: string = '';
    selectedStatus: string = 'all';

    // Paginación
    currentPage: number = 1;
    itemsPerPage: number = 10;

    get pendingCount() {
        return this.orders.filter(o => o.status === 'pending').length;
    }

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

    get ordersByStatus() {
        const source = this.filteredOrders;
        return {
            all: source.length,
            pending: source.filter(o => o.status === 'pending'),
            cooking: source.filter(o => o.status === 'cooking'),
            ready: source.filter(o => o.status === 'ready'),
            delivered: source.filter(o => o.status === 'delivered'),
            cancelled: source.filter(o => o.status === 'cancelled')
        };
    }

    Math = Math;

    private cdr = inject(ChangeDetectorRef);

    private supabaseService = inject(SupabaseService);
    private notificationService = inject(NotificationService);
    private mobileService = inject(MobileService);
    isMobile = this.mobileService.isMobile;

    constructor() {
        effect(() => {
            if (this.isMobile()) {
                this.viewMode = 'list';
            }
        });
    }

    private orderSubscription: any;

    async ngOnInit() {
        this.merchantId = localStorage.getItem('active_merchant_id') || localStorage.getItem('merchant_id') || '';
        this.isSuperAdmin = localStorage.getItem('user_role') === 'superadmin';

        if (this.merchantId) {
            // Normalizar ID
            const { data: m } = await this.supabaseService.getMerchantByAnyId(this.merchantId);
            if (m && m.id !== this.merchantId) {
                console.log('🔄 [OrderManagement] Normalizando Merchant ID de', this.merchantId, 'a', m.id);
                this.merchantId = m.id;
            }
            await this.loadOrders();
            this.setupRealtime();
        }

        if (this.isMobile()) {
            this.viewMode = 'list';
            this.mobileService.setHeader('Pedidos', false);
        }
        this.mobileService.setImmersive(false);
    }

    setupRealtime() {
        console.log('📡 [OrderManagement] Configurando Realtime para merchant:', this.merchantId);
        this.orderSubscription = this.supabaseService.subscribeToOrders(this.merchantId, () => {
            console.log('🔔 [OrderManagement] Cambio detectado en pedidos, recargando...');
            this.loadOrders();
        });
    }

    ngOnDestroy() {
        if (this.orderSubscription) {
            console.log('🔌 [OrderManagement] Desconectando Realtime');
            this.orderSubscription.unsubscribe();
        }
    }

    async loadOrders() {
        this.isLoading = true;
        this.cdr.detectChanges();

        try {
            const { data, error } = await this.supabaseService.getOrders(this.merchantId);

            if (error) {
                console.error('❌ Error de Supabase al cargar pedidos:', error);
                this.notificationService.show('Error al cargar pedidos: ' + error.message, 'error');
            }

            if (data) {
                console.log(`📊 [OrderManagement] Recibidos ${data.length} pedidos de Supabase.`);
                const oldSelectedUuid = this.selectedOrder?.uuid;

                this.orders = data.map((o: any) => {
                    // Depuración extrema: Ver todas las claves del objeto
                    console.log(`🔍 [Order ${o.id}] Keys:`, Object.keys(o));

                    // Búsqueda exhaustiva de ítems (joins de Supabase)
                    let rawItems: any[] = [];
                    if (o.items && Array.isArray(o.items) && o.items.length > 0) rawItems = o.items;
                    else if (o.order_items && Array.isArray(o.order_items) && o.order_items.length > 0) rawItems = o.order_items;
                    else {
                        // Búsqueda ciega de cualquier array que parezca contener ítems de pedido
                        const possibleKey = Object.keys(o).find(key =>
                            Array.isArray(o[key]) &&
                            o[key].length > 0 &&
                            (o[key][0].product_name || o[key][0].quantity || o[key][0].product_id || o[key][0].unit_price)
                        );
                        if (possibleKey) {
                            console.log(`💡 [Order ${o.id}] Detectados ítems en clave alternativa: ${possibleKey}`);
                            rawItems = o[possibleKey];
                        }
                    }

                    console.log(`📦 [Order ${o.id}] items final:`, rawItems.length);

                    return {
                        uuid: o.id,
                        id: o.order_number ? '#' + String(o.order_number).padStart(3, '0') : o.id.substring(0, 8).toUpperCase(),
                        customer_name: o.customers?.full_name || o.customer_name || 'Cliente sin nombre',
                        channel: o.channel || 'web',
                        total: Number(o.total || 0),
                        status: o.status || 'pending',
                        created_at: new Date(o.created_at),
                        delivery_address: o.delivery_address || 'Sin dirección',
                        notes: o.notes || '',
                        items: (rawItems || []).map((item: any) => {
                            let pName = item.product_name || '';

                            if (!pName) {
                                pName = item.products?.name ||
                                    (item.products && Array.isArray(item.products) ? item.products[0]?.name : null) ||
                                    item.product?.name ||
                                    'Producto';
                            }

                            return {
                                product_name: pName,
                                quantity: Number(item.quantity || 1),
                                unit_price: Number(item.unit_price || item.price || 0),
                                notes: item.notes || '',
                                extras: item.extras || ''
                            };
                        })
                    };
                });

                // Re-sincronizar el pedido seleccionado con el objeto fresco de la lista
                if (oldSelectedUuid) {
                    this.selectedOrder = this.orders.find(o => o.uuid === oldSelectedUuid) || this.orders[0] || null;
                } else if (!this.isMobile() && this.orders.length > 0) {
                    this.selectedOrder = this.orders[0];
                }
            }
        } finally {
            this.isLoading = false;
            this.cdr.detectChanges();
        }
    }

    selectOrder(order: Order) {
        this.selectedOrder = order;
        if (this.isMobile()) {
            this.mobileService.setHeader('Detalle Pedido', true, () => this.backToList());
            this.mobileService.setImmersive(true);
        }
    }

    backToList() {
        this.selectedOrder = null;
        this.mobileService.setImmersive(false);
        this.mobileService.setHeader('Pedidos', false);
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
            
            // Notificar al cliente via Chat (Supabase -> WhatsApp/etc)
            await this.notifyCustomer(order);
            
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

    async deleteOrder(order: Order) {
        if (!this.isSuperAdmin) return;
        this.orderToDelete = order;
        this.showDeleteOrderModal = true;
    }

    async confirmDeleteOrder() {
        if (!this.orderToDelete) return;

        this.isLoading = true;
        this.cdr.detectChanges();

        try {
            const { error } = await this.supabaseService.deleteOrder(this.orderToDelete.uuid);
            if (error) throw error;

            this.notificationService.show('Pedido eliminado correctamente', 'success');
            this.selectedOrder = null;
            this.showDeleteOrderModal = false;
            this.orderToDelete = null;
            await this.loadOrders();
        } catch (err: any) {
            console.error('Error al eliminar pedido:', err);
            this.notificationService.show('No se pudo eliminar el pedido: ' + err.message, 'error');
        } finally {
            this.isLoading = false;
            this.showDeleteOrderModal = false;
            this.cdr.detectChanges();
        }
    }

    cancelDeleteOrder() {
        this.showDeleteOrderModal = false;
        this.orderToDelete = null;
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

    async notifyCustomer(order: Order) {
        const statusMessages: { [key: string]: string } = {
            cooking: '👨‍🍳 ¡Tu pedido con ID ' + order.id + ' ya está en la cocina!',
            ready: '✅ ¡Tu pedido ' + order.id + ' está listo y en camino!',
            delivered: '📦 ¡Pedido ' + order.id + ' entregado! ¡Que lo disfrutes!',
            cancelled: '❌ Tu pedido ' + order.id + ' ha sido cancelado.'
        };
        
        const message = statusMessages[order.status];
        if (!message) return;

        console.log(`[OrderManagement] Notificando cambio de estado: ${order.status}`);
        
        // Buscar la conversación asociada al pedido para enviarle el mensaje
        const { data: convData } = await this.supabaseService.getConversationByOrderId(order.uuid);
        if (convData && convData.id) {
            await this.supabaseService.saveMessage(convData.id, 'ai', message);
        } else {
            console.warn(`[OrderManagement] No se encontró conversación para el pedido ${order.uuid}`);
        }
    }

    getStatusLabel(status: string): string {
        const labels: { [key: string]: string } = {
            'pending': 'Confirmar Pago',
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
