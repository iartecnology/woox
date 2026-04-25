import { Injectable } from '@angular/core';

/**
 * LogService — Sistema de Logging Centralizado
 * 
 * Reemplaza los console.log dispersos por un sistema con niveles,
 * timestamps, contexto de módulo y capacidad de almacenar logs críticos.
 * 
 * Uso:
 *   private log = inject(LogService);
 *   this.log.info('ChatService', 'Mensaje cargado', { id: '123' });
 *   this.log.error('BotEngine', 'Nodo no encontrado', { nodeId });
 */

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

interface LogEntry {
    timestamp: string;
    level: LogLevel;
    module: string;
    message: string;
    data?: any;
}

@Injectable({ providedIn: 'root' })
export class LogService {

    private readonly MAX_BUFFER = 500;
    private buffer: LogEntry[] = [];
    private minLevel: LogLevel = 'DEBUG';

    private readonly LEVELS: Record<LogLevel, number> = {
        'DEBUG': 0,
        'INFO': 1,
        'WARN': 2,
        'ERROR': 3,
    };

    /** Configurar nivel mínimo de logging */
    setLevel(level: LogLevel) {
        this.minLevel = level;
    }

    /** Log de depuración — solo visible en desarrollo */
    debug(module: string, message: string, data?: any) {
        this.log('DEBUG', module, message, data);
    }

    /** Log informativo — flujo normal del sistema */
    info(module: string, message: string, data?: any) {
        this.log('INFO', module, message, data);
    }

    /** Log de advertencia — comportamiento inesperado pero no crítico */
    warn(module: string, message: string, data?: any) {
        this.log('WARN', module, message, data);
    }

    /** Log de error — fallo que requiere atención */
    error(module: string, message: string, data?: any) {
        this.log('ERROR', module, message, data);
    }

    /** Obtener los últimos N logs del buffer */
    getRecentLogs(count: number = 50): LogEntry[] {
        return this.buffer.slice(-count);
    }

    /** Obtener logs filtrados por nivel */
    getLogsByLevel(level: LogLevel): LogEntry[] {
        return this.buffer.filter(l => l.level === level);
    }

    /** Obtener logs filtrados por módulo */
    getLogsByModule(module: string): LogEntry[] {
        return this.buffer.filter(l => l.module === module);
    }

    /** Limpiar el buffer */
    clear() {
        this.buffer = [];
    }

    /** Exportar logs como texto para diagnóstico */
    exportAsText(): string {
        return this.buffer.map(e =>
            `[${e.timestamp}] [${e.level}] [${e.module}] ${e.message}${e.data ? ' | ' + JSON.stringify(e.data) : ''}`
        ).join('\n');
    }

    private log(level: LogLevel, module: string, message: string, data?: any) {
        if (this.LEVELS[level] < this.LEVELS[this.minLevel]) return;

        const entry: LogEntry = {
            timestamp: new Date().toISOString(),
            level,
            module,
            message,
            data,
        };

        // Buffer circular
        this.buffer.push(entry);
        if (this.buffer.length > this.MAX_BUFFER) {
            this.buffer.shift();
        }

        // Console output con colores
        const prefix = `[${module}]`;
        switch (level) {
            case 'DEBUG': console.debug(`🔍 ${prefix}`, message, data || ''); break;
            case 'INFO':  console.info(`ℹ️ ${prefix}`, message, data || ''); break;
            case 'WARN':  console.warn(`⚠️ ${prefix}`, message, data || ''); break;
            case 'ERROR': console.error(`❌ ${prefix}`, message, data || ''); break;
        }
    }
}
