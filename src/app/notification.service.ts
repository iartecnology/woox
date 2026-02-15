import { Injectable, signal } from '@angular/core';

export interface Toast {
    id: number;
    message: string;
    type: 'success' | 'error' | 'info' | 'warning';
}

@Injectable({
    providedIn: 'root'
})
export class NotificationService {
    toasts = signal<Toast[]>([]);
    private nextId = 0;

    show(message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info') {
        const id = this.nextId++;
        this.toasts.update(t => [...t, { id, message, type }]);

        setTimeout(() => {
            this.remove(id);
        }, 5000);
    }

    remove(id: number) {
        this.toasts.update(t => t.filter(toast => toast.id !== id));
    }
}
