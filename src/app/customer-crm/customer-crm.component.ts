import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface Customer {
    id: string;
    name: string;
    phone: string;
    email: string;
    total_orders: number;
    total_spent: number;
    last_order_date: Date;
    channel_preference: 'whatsapp' | 'telegram' | 'instagram' | 'web';
    sentiment: 'happy' | 'neutral' | 'angry';
    labels: string[];
    is_vip: boolean;
}

@Component({
    selector: 'app-customer-crm',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './customer-crm.component.html',
    styleUrl: './customer-crm.component.css'
})
export class CustomerCrmComponent implements OnInit {
    customers: Customer[] = [
        {
            id: '1',
            name: 'Carlos Ruiz',
            phone: '+57 300 123 4567',
            email: 'carlos@example.com',
            total_orders: 12,
            total_spent: 450000,
            last_order_date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2), // 2 days ago
            channel_preference: 'whatsapp',
            sentiment: 'happy',
            labels: ['Fiel', 'Fan de Burgers'],
            is_vip: true
        },
        {
            id: '2',
            name: 'Ana García',
            phone: '+57 310 987 6543',
            email: 'ana@example.com',
            total_orders: 1,
            total_spent: 35000,
            last_order_date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 15), // 15 days ago
            channel_preference: 'instagram',
            sentiment: 'neutral',
            labels: ['Nuevo'],
            is_vip: false
        },
        {
            id: '3',
            name: 'Luis Martínez',
            phone: '+57 315 555 4433',
            email: 'luis@example.com',
            total_orders: 8,
            total_spent: 280000,
            last_order_date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 1), // 1 day ago
            channel_preference: 'whatsapp',
            sentiment: 'angry',
            labels: ['Queja Pendiente'],
            is_vip: false
        }
    ];

    filteredCustomers: Customer[] = [];
    searchTerm: string = '';
    selectedCustomer: Customer | null = null;
    showCampaignModal = false;

    campaign = {
        name: '',
        message: '',
        segment: 'all'
    };

    constructor() { }

    ngOnInit(): void {
        this.filteredCustomers = [...this.customers];
    }

    search() {
        this.filteredCustomers = this.customers.filter(c =>
            c.name.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
            c.phone.includes(this.searchTerm)
        );
    }

    selectCustomer(customer: Customer) {
        this.selectedCustomer = customer;
    }

    getSentimentEmoji(sentiment: string): string {
        switch (sentiment) {
            case 'happy': return '😊';
            case 'neutral': return '😐';
            case 'angry': return '😡';
            default: return '😐';
        }
    }

    getChannelIcon(channel: string): string {
        switch (channel) {
            case 'whatsapp': return '💬';
            case 'telegram': return '✈️';
            case 'instagram': return '📸';
            case 'web': return '🌐';
            default: return '💬';
        }
    }

    openCampaignModal() {
        this.showCampaignModal = true;
    }

    sendCampaign() {
        alert(`Campaña "${this.campaign.name}" enviada a segmento: ${this.campaign.segment}`);
        this.showCampaignModal = false;
    }

    formatCurrency(value: number) {
        return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(value);
    }
}
