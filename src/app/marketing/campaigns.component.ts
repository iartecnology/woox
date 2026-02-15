import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface Campaign {
    id: string;
    name: string;
    type: 'whatsapp' | 'email' | 'sms';
    status: 'scheduled' | 'running' | 'completed' | 'draft';
    audience: string;
    sent_count: number;
    open_rate?: number;
    click_rate?: number;
    created_at: Date;
}

@Component({
    selector: 'app-campaigns',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './campaigns.component.html',
    styleUrl: './campaigns.component.css'
})
export class CampaignsComponent implements OnInit {
    campaignsList: Campaign[] = [
        { id: '1', name: 'Promoción Fin de Semana', type: 'whatsapp', status: 'completed', audience: 'Clientes VIP', sent_count: 542, open_rate: 85, click_rate: 12, created_at: new Date('2024-03-20') },
        { id: '2', name: 'Recuperación de Carritos', type: 'whatsapp', status: 'running', audience: 'Abandono 24h', sent_count: 125, created_at: new Date('2024-03-25') },
        { id: '3', name: 'Lanzamiento Nueva Carta', type: 'email', status: 'scheduled', audience: 'Todos', sent_count: 2450, created_at: new Date('2024-03-28') },
        { id: '4', name: 'Cupón Cumpleaños', type: 'sms', status: 'completed', audience: 'Cumpleañeros Mar', sent_count: 85, open_rate: 98, click_rate: 25, created_at: new Date('2024-03-01') },
        { id: '5', name: 'Oferta Flash 2x1', type: 'whatsapp', status: 'completed', audience: 'Zona Norte', sent_count: 1200, open_rate: 92, click_rate: 18, created_at: new Date('2024-03-15') },
        { id: '6', name: 'Newsletter Mensual', type: 'email', status: 'draft', audience: 'Suscritos', sent_count: 0, created_at: new Date('2024-03-27') },
        { id: '7', name: 'Encuesta Satisfacción', type: 'whatsapp', status: 'completed', audience: 'Última semana', sent_count: 430, open_rate: 78, click_rate: 5, created_at: new Date('2024-03-10') },
        { id: '8', name: 'Reactivación Inactivos', type: 'sms', status: 'running', audience: '> 60 días', sent_count: 850, created_at: new Date('2024-03-26') }
    ];

    campaigns: Campaign[] = [];

    // Paginación y Ordenación
    sortKey: keyof Campaign = 'created_at';
    sortDirection: 'asc' | 'desc' = 'desc';
    currentPage: number = 1;
    itemsPerPage: number = 5;
    Math = Math;

    showCreateModal = false;
    newCampaign = {
        name: '',
        type: 'whatsapp' as const,
        audience: 'all'
    };

    ngOnInit(): void {
        this.updateCampaigns();
    }

    updateCampaigns() {
        let filtered = [...this.campaignsList];

        // Aplicar Ordenación
        filtered.sort((a, b) => {
            const valA = a[this.sortKey] || '';
            const valB = b[this.sortKey] || '';

            if (valA < valB) return this.sortDirection === 'asc' ? -1 : 1;
            if (valA > valB) return this.sortDirection === 'asc' ? 1 : -1;
            return 0;
        });

        this.campaigns = filtered;
    }

    get paginatedCampaigns(): Campaign[] {
        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        return this.campaigns.slice(startIndex, startIndex + this.itemsPerPage);
    }

    get totalPages(): number {
        return Math.ceil(this.campaigns.length / this.itemsPerPage);
    }

    get pagesArray(): number[] {
        return Array.from({ length: this.totalPages }, (_, i) => i + 1);
    }

    toggleSort(key: keyof Campaign): void {
        if (this.sortKey === key) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortKey = key;
            this.sortDirection = 'asc';
        }
        this.updateCampaigns();
        this.currentPage = 1;
    }

    changePage(page: number): void {
        if (page >= 1 && page <= this.totalPages) {
            this.currentPage = page;
        }
    }

    getStatusClass(status: string) {
        return `status-${status}`;
    }

    createCampaign() {
        alert('Campaña creada con éxito');
        this.showCreateModal = false;
    }
}
