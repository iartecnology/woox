import { inject, Injectable, signal } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class UpdateService {
    private swUpdate = inject(SwUpdate);
    updateAvailable = signal(false);

    constructor() {
        console.log('[UpdateService] Inicializado. SW Enabled:', this.swUpdate.isEnabled);
        if (this.swUpdate.isEnabled) {
            this.swUpdate.versionUpdates.pipe(
                filter((evt): evt is VersionReadyEvent => evt.type === 'VERSION_READY')
            ).subscribe(evt => {
                console.log('[UpdateService] Nueva versión lista:', evt.latestVersion.hash);
                this.updateAvailable.set(true);
            });

            // Verificar actualizaciones periódicamente (opcional pero recomendado)
            // Cada 6 horas
            setInterval(() => {
                this.swUpdate.checkForUpdate();
            }, 6 * 60 * 60 * 1000);
        }
    }

    async updateApp() {
        console.log('[UpdateService] Aplicando actualización...');
        try {
            await this.swUpdate.activateUpdate();
            document.location.reload();
        } catch (err) {
            console.error('[UpdateService] Error al actualizar:', err);
            // Si falla, recargar de todas formas suele limpiar el SW
            document.location.reload();
        }
    }
}
