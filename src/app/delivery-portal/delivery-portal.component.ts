import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

interface DeliveryOrder {
    id: string;
    customer_name: string;
    address: string;
    total: number;
    status: 'ready' | 'shipped' | 'delivered';
    items_count: number;
}

@Component({
    selector: 'app-delivery-portal',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './delivery-portal.component.html',
    styleUrl: './delivery-portal.component.css'
})
export class DeliveryPortalComponent implements OnInit {
    orders: DeliveryOrder[] = [
        { id: 'WOX-1003', customer_name: 'Daniela R.', address: 'Carrera 10 #5-20', total: 35.00, status: 'ready', items_count: 2 },
        { id: 'WOX-1004', customer_name: 'Mateo S.', address: 'Calle 80 #15-40', total: 12.50, status: 'ready', items_count: 1 }
    ];

    ngOnInit(): void { }

    startDelivery(order: DeliveryOrder) {
        order.status = 'shipped';
        // Notificar al cliente automáticamente
        console.log(`Pedido ${order.id} en camino.`);
    }

    completeDelivery(order: DeliveryOrder) {
        order.status = 'delivered';
        // Eliminar de la lista local
        this.orders = this.orders.filter(o => o.id !== order.id);
        console.log(`Pedido ${order.id} entregado.`);
    }
}
