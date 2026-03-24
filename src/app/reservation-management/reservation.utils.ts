export const STATUS_CONFIG: { [key: string]: { text: string, class: string } } = {
    'confirmed': { text: 'Confirmado', class: 'confirmed' },
    'pending': { text: 'Pendiente', class: 'pending' },
    'cancelled': { text: 'Cancelado', class: 'cancelled' },
    'completed': { text: 'Completado', class: 'completed' },
    'no_show': { text: 'No asistió', class: 'no-show' }
};

export const SERVICE_COLORS: { [key: string]: string } = {
    'Limpieza Dental': '#4F46E5',
    'Blanqueamiento': '#10B981',
    'Ortodoncia': '#EC4899',
    'Consulta General': '#F59E0B',
    'Corte Cabello': '#4F46E5',
    'Barba': '#D946EF',
    'Color de Pelo': '#F97316'
};

export function getStatusText(status: string): string {
    return STATUS_CONFIG[status]?.text || 'Pendiente';
}

export function getStatusClass(status: string): string {
    return STATUS_CONFIG[status]?.class || 'pending';
}

export function getServiceColor(service: string): string {
    return SERVICE_COLORS[service] || '#64748B';
}
