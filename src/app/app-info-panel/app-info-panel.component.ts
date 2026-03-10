import { Component, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface ChangelogEntry {
    version: string;
    date: string;
    type: 'feature' | 'fix' | 'improvement' | 'security';
    changes: string[];
}

export interface FeatureCategory {
    icon: string;
    title: string;
    description: string;
    features: string[];
}

@Component({
    selector: 'app-info-panel',
    standalone: true,
    imports: [CommonModule],
    template: `
    <div class="info-overlay" (click)="close()">
        <div class="info-panel" (click)="$event.stopPropagation()">
            <!-- SIDEBAR NAVEGACIÓN -->
            <nav class="info-nav">
                <div class="info-brand">
                    <span class="brand-logo">🌊</span>
                    <div>
                        <h2>Woox</h2>
                        <span class="version-badge">v{{ currentVersion }}</span>
                    </div>
                </div>
                <div class="nav-links">
                    <button *ngFor="let tab of tabs" class="nav-link" [class.active]="activeTab === tab.id" (click)="activeTab = tab.id">
                        {{ tab.icon }} {{ tab.label }}
                    </button>
                </div>
                <button class="close-panel-btn" (click)="close()">✕ Cerrar</button>
            </nav>

            <!-- CONTENIDO -->
            <main class="info-content">
                <button class="top-close-btn" (click)="close()">✕</button>

                <!-- TAB: RESUMEN -->
                <div *ngIf="activeTab === 'overview'" class="tab-content">
                    <h1 class="content-title">🌊 Plataforma Woox</h1>
                    <p class="content-subtitle">Sistema multicanal de IA para gestión de ventas, reservaciones y atención al cliente.</p>

                    <div class="overview-grid">
                        <div class="overview-stat">
                            <span class="stat-num">7</span>
                            <span class="stat-lbl">Módulos Core</span>
                        </div>
                        <div class="overview-stat">
                            <span class="stat-num">5+</span>
                            <span class="stat-lbl">Canales Integrados</span>
                        </div>
                        <div class="overview-stat">
                            <span class="stat-num">6</span>
                            <span class="stat-lbl">Edge Functions</span>
                        </div>
                        <div class="overview-stat">
                            <span class="stat-num">∞</span>
                            <span class="stat-lbl">Comercios</span>
                        </div>
                    </div>

                    <h3 class="section-title">Stack Tecnológico</h3>
                    <div class="tech-stack">
                        <div *ngFor="let tech of techStack" class="tech-pill" [style.background]="tech.color">
                            {{ tech.icon }} {{ tech.name }}
                        </div>
                    </div>

                    <h3 class="section-title">Arquitectura del Sistema</h3>
                    <div class="arch-diagram">
                        <div class="arch-layer">
                            <span class="layer-label">CANALES</span>
                            <div class="layer-items">
                                <span class="arch-item">WhatsApp</span>
                                <span class="arch-item">Telegram</span>
                                <span class="arch-item">Facebook</span>
                                <span class="arch-item">Web</span>
                            </div>
                        </div>
                        <div class="arch-arrow">↓</div>
                        <div class="arch-layer highlight">
                            <span class="layer-label">MOTOR IA</span>
                            <div class="layer-items">
                                <span class="arch-item">Python + FastAPI</span>
                                <span class="arch-item">Gemini 1.5 Flash</span>
                                <span class="arch-item">RAG + Skills</span>
                            </div>
                        </div>
                        <div class="arch-arrow">↓</div>
                        <div class="arch-layer">
                            <span class="layer-label">BACKEND</span>
                            <div class="layer-items">
                                <span class="arch-item">Supabase</span>
                                <span class="arch-item">Edge Functions</span>
                                <span class="arch-item">Realtime</span>
                            </div>
                        </div>
                        <div class="arch-arrow">↓</div>
                        <div class="arch-layer">
                            <span class="layer-label">FRONTEND</span>
                            <div class="layer-items">
                                <span class="arch-item">Angular 18</span>
                                <span class="arch-item">Zoneless</span>
                                <span class="arch-item">Standalone</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- TAB: FUNCIONALIDADES -->
                <div *ngIf="activeTab === 'features'" class="tab-content">
                    <h1 class="content-title">⚡ Funcionalidades</h1>
                    <div class="features-grid">
                        <div *ngFor="let cat of featureCategories" class="feature-card">
                            <div class="feature-card-header">
                                <span class="feature-icon">{{ cat.icon }}</span>
                                <div>
                                    <h3>{{ cat.title }}</h3>
                                    <p>{{ cat.description }}</p>
                                </div>
                            </div>
                            <ul class="feature-list">
                                <li *ngFor="let f of cat.features">✓ {{ f }}</li>
                            </ul>
                        </div>
                    </div>
                </div>

                <!-- TAB: CHANGELOG -->
                <div *ngIf="activeTab === 'changelog'" class="tab-content">
                    <h1 class="content-title">📋 Changelog</h1>
                    <p class="content-subtitle">Historial de versiones y cambios implementados.</p>

                    <div class="changelog-list">
                        <div *ngFor="let entry of changelog" class="changelog-entry">
                            <div class="changelog-header">
                                <div class="changelog-version">
                                    <span class="v-tag" [class]="entry.type">
                                        {{ typeLabels[entry.type] }}
                                    </span>
                                    <strong>{{ entry.version }}</strong>
                                </div>
                                <span class="changelog-date">{{ entry.date }}</span>
                            </div>
                            <ul class="changelog-changes">
                                <li *ngFor="let change of entry.changes">{{ change }}</li>
                            </ul>
                        </div>
                    </div>
                </div>

                <!-- TAB: EDGE FUNCTIONS -->
                <div *ngIf="activeTab === 'functions'" class="tab-content">
                    <h1 class="content-title">⚡ Edge Functions</h1>
                    <p class="content-subtitle">Funciones serverless desplegadas en Supabase.</p>

                    <div class="functions-list">
                        <div *ngFor="let fn of edgeFunctions" class="function-card">
                            <div class="fn-header">
                                <span class="fn-status active"></span>
                                <strong class="fn-name">{{ fn.name }}</strong>
                                <span class="fn-badge">ACTIVE</span>
                            </div>
                            <p class="fn-desc">{{ fn.description }}</p>
                            <div class="fn-triggers">
                                <span *ngFor="let t of fn.triggers" class="fn-trigger">{{ t }}</span>
                            </div>
                        </div>
                    </div>
                </div>

            </main>
        </div>
    </div>
    `,
    styles: [`
    .info-overlay {
        position: fixed; inset: 0;
        background: rgba(0,0,0,0.65);
        z-index: 2000;
        display: flex; align-items: center; justify-content: center;
        padding: 24px;
        backdrop-filter: blur(6px);
        animation: fadeIn 0.2s ease;
    }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

    .info-panel {
        background: var(--bg-secondary);
        border-radius: 24px;
        border: 1px solid var(--border-color);
        width: 100%; max-width: 1100px;
        height: 85vh;
        display: grid;
        grid-template-columns: 220px 1fr;
        overflow: hidden;
        box-shadow: 0 32px 80px rgba(0,0,0,0.5);
        animation: slideUp 0.25s ease;
    }
    @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

    /* NAV */
    .info-nav {
        background: var(--bg-primary);
        display: flex; flex-direction: column;
        padding: 24px 16px;
        border-right: 1px solid var(--border-color);
        gap: 4px;
    }
    .info-brand { display: flex; align-items: center; gap: 12px; margin-bottom: 28px; padding: 0 8px; }
    .brand-logo { font-size: 2rem; }
    .info-brand h2 { margin: 0; font-size: 1.3rem; font-weight: 900; color: var(--text-primary); }
    .version-badge { font-size: 0.7rem; background: #6366f1; color: white; padding: 2px 8px; border-radius: 99px; font-weight: 700; }

    .nav-link {
        display: flex; align-items: center; gap: 8px;
        padding: 10px 12px; border-radius: 10px;
        border: none; background: transparent;
        color: var(--text-secondary);
        font-size: 0.85rem; font-weight: 600;
        cursor: pointer; transition: all 0.15s; text-align: left; width: 100%;
    }
    .nav-link:hover { background: var(--bg-secondary); color: var(--text-primary); }
    .nav-link.active { background: #6366f1; color: white; }

    .close-panel-btn {
        margin-top: auto;
        padding: 10px 12px; border-radius: 10px;
        border: 1px solid var(--border-color);
        color: var(--text-secondary); font-size: 0.8rem;
        background: transparent; cursor: pointer; transition: all 0.15s;
    }
    .close-panel-btn:hover { border-color: #ef4444; color: #ef4444; }

    /* CONTENT */
    .info-content { overflow-y: auto; padding: 32px; background: var(--bg-secondary); position: relative; }
    .top-close-btn {
        position: absolute; right: 24px; top: 24px;
        width: 36px; height: 36px; border-radius: 50%;
        border: 1px solid var(--border-color); background: var(--bg-primary);
        color: var(--text-secondary); cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        transition: all 0.2s; font-size: 1.1rem;
    }
    .top-close-btn:hover { background: #ef4444; color: white; border-color: #ef4444; transform: rotate(90deg); }
    .tab-content { animation: fadeIn 0.2s ease; }
    .content-title { font-size: 1.8rem; font-weight: 900; color: var(--text-primary); margin: 0 0 8px; }
    .content-subtitle { color: var(--text-secondary); margin: 0 0 32px; font-size: 0.95rem; }
    .section-title { font-size: 1rem; font-weight: 800; color: var(--text-secondary); margin: 28px 0 14px; text-transform: uppercase; letter-spacing: 0.06em; }

    /* OVERVIEW */
    .overview-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 32px; }
    .overview-stat { background: rgba(99,102,241,0.1); border: 1px solid rgba(99,102,241,0.2); border-radius: 16px; padding: 20px; text-align: center; }
    .stat-num { display: block; font-size: 2rem; font-weight: 900; color: #6366f1; }
    .stat-lbl { font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; }

    .tech-stack { display: flex; flex-wrap: wrap; gap: 8px; }
    .tech-pill { padding: 6px 14px; border-radius: 8px; font-size: 0.8rem; font-weight: 700; color: white; }

    .arch-diagram { display: flex; flex-direction: column; align-items: flex-start; gap: 0; }
    .arch-layer { background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 12px; padding: 14px 20px; width: 100%; }
    .arch-layer.highlight { border-color: #6366f1; background: rgba(99,102,241,0.05); }
    .layer-label { font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-secondary); font-weight: 800; display: block; margin-bottom: 8px; }
    .layer-items { display: flex; gap: 8px; flex-wrap: wrap; }
    .arch-item { background: var(--bg-secondary); padding: 4px 10px; border-radius: 6px; font-size: 0.8rem; color: var(--text-primary); border: 1px solid var(--border-color); }
    .arch-arrow { text-align: center; color: var(--text-secondary); font-size: 1.2rem; margin: 4px 0; width: 100%; }

    /* FEATURES */
    .features-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 20px; }
    .feature-card { background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 16px; padding: 20px; }
    .feature-card-header { display: flex; gap: 14px; align-items: flex-start; margin-bottom: 14px; }
    .feature-icon { font-size: 2rem; flex-shrink: 0; }
    .feature-card-header h3 { margin: 0 0 4px; font-size: 0.95rem; font-weight: 800; color: var(--text-primary); }
    .feature-card-header p { margin: 0; font-size: 0.8rem; color: var(--text-secondary); }
    .feature-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }
    .feature-list li { font-size: 0.82rem; color: var(--text-secondary); padding-left: 4px; }

    /* CHANGELOG */
    .changelog-list { display: flex; flex-direction: column; gap: 24px; }
    .changelog-entry { border-left: 3px solid #6366f1; padding-left: 20px; }
    .changelog-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .changelog-version { display: flex; align-items: center; gap: 10px; color: var(--text-primary); }
    .v-tag { font-size: 0.65rem; font-weight: 800; padding: 3px 8px; border-radius: 6px; text-transform: uppercase; letter-spacing: 0.05em; }
    .v-tag.feature { background: rgba(99,102,241,0.15); color: #6366f1; }
    .v-tag.fix { background: rgba(239,68,68,0.15); color: #ef4444; }
    .v-tag.improvement { background: rgba(34,197,94,0.15); color: #22c55e; }
    .v-tag.security { background: rgba(245,158,11,0.15); color: #f59e0b; }
    .changelog-date { font-size: 0.78rem; color: var(--text-secondary); }
    .changelog-changes { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }
    .changelog-changes li { font-size: 0.85rem; color: var(--text-primary); padding-left: 2px; }
    .changelog-changes li::before { content: '→ '; color: #6366f1; }

    /* FUNCTIONS */
    .functions-list { display: flex; flex-direction: column; gap: 16px; }
    .function-card { background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 14px; padding: 18px 20px; }
    .fn-header { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
    .fn-status { width: 8px; height: 8px; border-radius: 50%; background: #22c55e; box-shadow: 0 0 8px #22c55e; flex-shrink: 0; }
    .fn-name { font-size: 0.95rem; font-weight: 800; color: var(--text-primary); font-family: monospace; }
    .fn-badge { margin-left: auto; font-size: 0.65rem; background: rgba(34,197,94,0.15); color: #22c55e; padding: 2px 8px; border-radius: 6px; font-weight: 800; }
    .fn-desc { font-size: 0.82rem; color: var(--text-secondary); margin: 0 0 10px; }
    .fn-triggers { display: flex; gap: 6px; flex-wrap: wrap; }
    .fn-trigger { font-size: 0.72rem; background: rgba(99,102,241,0.1); border: 1px solid rgba(99,102,241,0.2); color: #6366f1; padding: 2px 8px; border-radius: 6px; }
    `]
})
export class AppInfoPanelComponent {
    currentVersion = '2.5.0';
    activeTab = 'overview';

    tabs = [
        { id: 'overview', icon: '🏠', label: 'Resumen' },
        { id: 'features', icon: '⚡', label: 'Funcionalidades' },
        { id: 'changelog', icon: '📋', label: 'Changelog' },
        { id: 'functions', icon: '🔌', label: 'Edge Functions' },
    ];

    typeLabels: Record<string, string> = {
        feature: '🆕 Feature',
        fix: '🔧 Fix',
        improvement: '🚀 Mejora',
        security: '🔒 Seguridad'
    };

    techStack = [
        { name: 'Angular 18', icon: '🅰️', color: 'rgba(220,53,69,0.4)' },
        { name: 'Supabase', icon: '🌿', color: 'rgba(63,182,100,0.35)' },
        { name: 'FastAPI', icon: '🐍', color: 'rgba(99,102,241,0.4)' },
        { name: 'Gemini AI', icon: '🤖', color: 'rgba(66,133,244,0.4)' },
        { name: 'Evolution API', icon: '💬', color: 'rgba(37,211,102,0.35)' },
        { name: 'PostgreSQL', icon: '🐘', color: 'rgba(51,103,145,0.5)' },
        { name: 'TypeScript', icon: '🔵', color: 'rgba(49,120,198,0.4)' },
        { name: 'Docker', icon: '🐳', color: 'rgba(0,151,210,0.4)' },
    ];

    featureCategories: FeatureCategory[] = [
        {
            icon: '🤖',
            title: 'Motor de IA Multicanal',
            description: 'Respuestas inteligentes en todos los canales',
            features: [
                'Integración con Google Gemini 1.5 Flash',
                'Sistema de Skills modular (catálogo, reservaciones, etc.)',
                'Memoria de conversación por sesión',
                'Extracción automática de intención y pedidos',
                'Soporte para Ollama (modelos locales)',
                'Análisis de sentimiento del cliente',
            ]
        },
        {
            icon: '🛒',
            title: 'Ventas & Pedidos',
            description: 'Gestión completa del ciclo de venta',
            features: [
                'Catálogo de productos con variantes y stock',
                'Captura automática de pedidos vía IA',
                'Panel de gestión de órdenes en tiempo real',
                'Integración con WooCommerce (sync bidireccional)',
                'Historial de pedidos por cliente',
                'Notificaciones de pedidos confirmados',
            ]
        },
        {
            icon: '📡',
            title: 'Monitoreo en Tiempo Real',
            description: 'Visibilidad total de las operaciones',
            features: [
                'Carritos en formación (typing_data) via Supabase Realtime',
                'Monitor de WhatsApp Activity en vivo',
                'Indicadores de sentimiento del cliente (😊😐😡)',
                'Dashboard de órdenes activas',
                'Monitor del motor IA (latencia, errores)',
                'Historial de auditoría de acciones',
            ]
        },
        {
            icon: '👥',
            title: 'CRM Inteligente 2.0',
            description: 'Gestión de clientes con IA proactiva',
            features: [
                'Niveles de lealtad automáticos (Bronce → Platino)',
                'Detección de riesgo de abandono (Churn Risk)',
                'Customer Lifetime Value (CLV) calculado en tiempo real',
                'Perfilamiento automático por IA (preferencias, alergias)',
                'Filtros inteligentes: VIP, En Riesgo, Nuevos, Inactivos',
                'Campañas de remarketing por WhatsApp con 1 click',
            ]
        },
        {
            icon: '📅',
            title: 'Reservaciones & Bookings',
            description: 'Motor de agenda inteligente',
            features: [
                '6 tipos de negocio: Restaurantes, Hoteles, Beauty, etc.',
                'Disponibilidad en tiempo real',
                'Bloqueos y excepciones de horario',
                'Reservas manuales desde el panel',
                'Vista de Calendario (Día, Semana, Mes, Lista)',
                'Creación automática de clientes al reservar',
            ]
        },
        {
            icon: '⚙️',
            title: 'Super Admin & Multi-Tenant',
            description: 'Gestión global de la plataforma SaaS',
            features: [
                'Gestión multi-comercio (merchants)',
                'Gestor de agentes IA por comercio',
                'Configuración de plataforma centralizada',
                'Monitor del motor IA en tiempo real',
                'Gestión de usuarios y roles',
                'Inicialización automática de base de datos',
            ]
        },
        {
            icon: '📱',
            title: 'Omnicanalidad',
            description: 'Conectado a todos los canales de mensajería',
            features: [
                'WhatsApp Business (via Evolution API o Meta)',
                'Telegram Bot',
                'Facebook Messenger',
                'Simulador de chat integrado',
                'Conexión por QR o número de teléfono',
                'Configuración por instancia por comercio',
            ]
        },
        {
            icon: '🔗',
            title: 'Biolink & Landing Pages',
            description: 'Páginas de destino para cada negocio',
            features: [
                'Generador de Biolink con editor visual',
                'Personalización de colores y logo',
                'Botones de acción configurables',
                'URL pública por comercio',
                'Integración con catálogo de productos',
                'Enlace directo a WhatsApp con mensaje pre-cargado',
            ]
        },
    ];

    edgeFunctions = [
        {
            name: 'remarketing-campaign',
            description: 'Envío masivo de mensajes WhatsApp segmentados por comportamiento del cliente (VIP, churn, inactivos, etc.).',
            triggers: ['REST API', 'CRM Frontend', 'Cron Job (futuro)']
        },
        {
            name: 'evolution-webhook',
            description: 'Recibe mensajes entrantes de WhatsApp via Evolution API, los procesa con el motor IA y responde automáticamente.',
            triggers: ['Evolution API Webhook', 'POST request']
        },
        {
            name: 'whatsapp-webhook',
            description: 'Soporte para WhatsApp Business API oficial de Meta (Cloud API).',
            triggers: ['Meta Webhook', 'Verificación GET', 'Mensajes POST']
        },
        {
            name: 'telegram-webhook',
            description: 'Recibe y procesa mensajes de Telegram, conectado al motor IA para respuestas automáticas.',
            triggers: ['Telegram Bot API Webhook']
        },
        {
            name: 'deliver-message',
            description: 'Función genérica para entregar mensajes salientes a cualquier canal (WhatsApp, Telegram, etc.).',
            triggers: ['Supabase Triggers', 'REST API']
        },
        {
            name: 'sync-woocommerce',
            description: 'Sincronización bidireccional de productos entre WooCommerce y el catálogo interno de Woox.',
            triggers: ['REST API', 'Cron Job', 'WooCommerce Webhook']
        },
    ];

    changelog: ChangelogEntry[] = [
        {
            version: 'v2.5.0',
            date: '08 Mar 2026',
            type: 'feature',
            changes: [
                'CRM 2.0: Niveles de lealtad automáticos (Bronce/Plata/Oro/Platino)',
                'CRM 2.0: Detección de Churn Risk (riesgo de abandono) por IA',
                'CRM 2.0: Customer Lifetime Value (CLV) calculado con triggers DB',
                'CRM 2.0: Campañas de Remarketing con 1 click via Edge Function',
                'CRM 2.0: Filtros inteligentes (VIP, En Riesgo, Nuevos, Inactivos)',
                'Monitoreo de Carritos en Tiempo Real via Supabase Realtime',
                'IA Profiling: análisis de preferencias del cliente en cada conversación',
                'Edge Function: remarketing-campaign desplegada en Supabase',
                'Super Admin: Panel de Info y Changelog (este panel)',
            ]
        },
        {
            version: 'v2.4.0',
            date: '08 Mar 2026',
            type: 'feature',
            changes: [
                'Integración con WooCommerce: sync bidireccional de productos',
                'Catálogo: búsqueda semántica con embeddings vectoriales',
                'Catálogo: historial de precios con gráfico de tendencias',
                'Catálogo: importación masiva vía CSV',
                'Catálogo: variantes de producto (talla, color, etc.)',
            ]
        },
        {
            version: 'v2.3.0',
            date: '02 Mar 2026',
            type: 'feature',
            changes: [
                'Motor de Reservaciones: 6 tipos de negocio soportados',
                'Calendario de disponibilidad en tiempo real por recurso',
                'Bloqueos y excepciones de horario',
                'Reservas manuales desde el panel administrativo',
                'Integración de reservaciones con el motor IA de WhatsApp',
            ]
        },
        {
            version: 'v2.2.0',
            date: '26 Feb 2026',
            type: 'improvement',
            changes: [
                'Sistema de Skills modular para el agente IA',
                'Configuración de Skills por agente desde el panel',
                'WhatsApp: soporte para conexión por QR y por número',
                'Omnichannel: gestor de instancias de Evolution API',
                'Biolink: actualización del editor visual con más opciones',
            ]
        },
        {
            version: 'v2.1.0',
            date: '24 Feb 2026',
            type: 'fix',
            changes: [
                'Fix: Modal de AI Config no abría desde el Super Admin',
                'Fix: Iconos de configuración en Super Admin no respondían',
                'Fix: Configuración de Omnichannel se perdía al guardar',
                'Mejora: Feedback visual en botones de la barra de super admin',
            ]
        },
        {
            version: 'v2.0.0',
            date: '10 Feb 2026',
            type: 'feature',
            changes: [
                'Arquitectura multi-tenant: soporte para múltiples comercios',
                'Motor IA refactorizado a Python + FastAPI independiente',
                'Supabase como backend principal (migración desde Firebase)',
                'Sistema de roles: SuperAdmin, Merchant Admin, Operador',
                'Monitor de WhatsApp Activity en tiempo real',
                'Panel de Auditoría de acciones del sistema',
            ]
        },
    ];

    @Output() closePanel = new EventEmitter<void>();

    close() {
        this.closePanel.emit();
    }
}
