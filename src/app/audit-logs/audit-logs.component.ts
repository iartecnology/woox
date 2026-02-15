import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface AuditLog {
    id: string;
    timestamp: Date;
    user: string;
    action: string;
    entity: string;
    details: string;
    severity: 'info' | 'warning' | 'error';
    ip_address: string;
}

@Component({
    selector: 'app-audit-logs',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './audit-logs.component.html',
    styleUrl: './audit-logs.component.css'
})
export class AuditLogsComponent implements OnInit {
    // Filtros
    selectedMerchant: string = 'all';
    selectedPeriod: string = 'all';
    startDate: string = '';
    endDate: string = '';

    merchants = [
        { id: 'all', name: 'Todas las Entidades' },
        { id: 'Burgers & Co', name: 'Burgers & Co' },
        { id: 'Pizza Woox', name: 'Pizza Woox' },
        { id: 'Taco Fest', name: 'Taco Fest' },
        { id: 'system', name: 'Sistema' }
    ];

    periods = [
        { id: 'all', name: 'Cualquier fecha' },
        { id: 'today', name: 'Hoy' },
        { id: '7d', name: 'Últimos 7 días' },
        { id: '30d', name: 'Últimos 30 días' },
        { id: 'custom', name: 'Rango Personalizado' }
    ];

    allLogs: AuditLog[] = [
        { id: '1', timestamp: new Date(), user: 'ric@woox.app', action: 'UPDATE_CONFIG', entity: 'Burgers & Co', details: 'Cambio de IA Provider a GPT-4o', severity: 'info', ip_address: '192.168.1.1' },
        { id: '2', timestamp: new Date(Date.now() - 1000 * 60 * 30), user: 'system@woox.app', action: 'SUBSCRIPTION_EXPIRED', entity: 'Pizza Woox', details: 'La suscripción básica ha expirado.', severity: 'warning', ip_address: 'localhost' },
        { id: '3', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2), user: 'admin@woox.app', action: 'DELETE_MERCHANT', entity: 'Taco Fest', details: 'Eliminación completa de la empresa.', severity: 'error', ip_address: '186.29.15.22' },
        { id: '4', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2), user: 'ric@woox.app', action: 'LOGIN_SUCCESS', entity: 'Sistema', details: 'Inicio de sesión exitoso.', severity: 'info', ip_address: '192.168.1.1' },
        { id: '5', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3), user: 'maria@burgers.com', action: 'CREATE_API_KEY', entity: 'Burgers & Co', details: 'Nueva API Key generada.', severity: 'info', ip_address: '190.24.55.12' },
        { id: '6', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 25), user: 'admin@woox.app', action: 'UPDATE_PLAN', entity: 'Sushi Express', details: 'Upgrade a Plan Enterprise.', severity: 'info', ip_address: '186.29.15.22' },
        { id: '7', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 48), user: 'system@woox.app', action: 'BACKUP_SUCCESS', entity: 'Sistema', details: 'Backup diario completado.', severity: 'info', ip_address: 'localhost' },
        { id: '8', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 72), user: 'juan@burgers.com', action: 'DANGER_ZONE_ACCESS', entity: 'Burgers & Co', details: 'Intento de acceso a configuración crítica.', severity: 'warning', ip_address: '192.168.1.5' },
        { id: '9', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 120), user: 'admin@woox.app', action: 'REVOKE_ACCESS', entity: 'Cafe Aroma', details: 'Acceso revocado por falta de pago.', severity: 'error', ip_address: '186.29.15.22' },
        { id: '10', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 150), user: 'system@woox.app', action: 'AI_THRESHOLD_REACHED', entity: 'Pizza Woox', details: 'Límite de tokens alcanzado (80%).', severity: 'warning', ip_address: 'localhost' }
    ];

    logs: AuditLog[] = [];

    // Paginación y Ordenación
    sortKey: keyof AuditLog = 'timestamp';
    sortDirection: 'asc' | 'desc' = 'desc';
    currentPage: number = 1;
    itemsPerPage: number = 5;
    Math = Math;

    constructor() { }

    ngOnInit(): void {
        this.onFilterChange();
    }

    onFilterChange(): void {
        let filtered = [...this.allLogs];

        if (this.selectedMerchant !== 'all') {
            filtered = filtered.filter(log => log.entity === this.selectedMerchant);
        }

        const now = new Date();
        if (this.selectedPeriod === 'today') {
            filtered = filtered.filter(log => new Date(log.timestamp).toDateString() === now.toDateString());
        } else if (this.selectedPeriod === '7d') {
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(now.getDate() - 7);
            filtered = filtered.filter(log => new Date(log.timestamp) >= sevenDaysAgo);
        } else if (this.selectedPeriod === '30d') {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(now.getDate() - 30);
            filtered = filtered.filter(log => new Date(log.timestamp) >= thirtyDaysAgo);
        } else if (this.selectedPeriod === 'custom' && this.startDate && this.endDate) {
            const start = new Date(this.startDate);
            const end = new Date(this.endDate);
            end.setHours(23, 59, 59);
            filtered = filtered.filter(log => {
                const date = new Date(log.timestamp);
                return date >= start && date <= end;
            });
        }

        // Aplicar Ordenación
        filtered.sort((a, b) => {
            const valA = a[this.sortKey];
            const valB = b[this.sortKey];

            if (valA < valB) return this.sortDirection === 'asc' ? -1 : 1;
            if (valA > valB) return this.sortDirection === 'asc' ? 1 : -1;
            return 0;
        });

        this.logs = filtered;
        this.currentPage = 1; // Reset a primera página al filtrar o reordenar
    }

    get paginatedLogs(): AuditLog[] {
        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        return this.logs.slice(startIndex, startIndex + this.itemsPerPage);
    }

    get totalPages(): number {
        return Math.ceil(this.logs.length / this.itemsPerPage);
    }

    get pagesArray(): number[] {
        return Array.from({ length: this.totalPages }, (_, i) => i + 1);
    }

    toggleSort(key: keyof AuditLog): void {
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

    getSeverityClass(severity: string) {
        return `badge-${severity}`;
    }
}
