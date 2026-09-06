import { Routes } from '@angular/router';
import { authGuard, superAdminGuard } from './auth.guard';

export const routes: Routes = [
    // ── Rutas Públicas (sin autenticación) ───────────────────────────────
    { 
        path: 'login', 
        loadComponent: () => import('./login/login.component').then(m => m.LoginComponent) 
    },
    { 
        path: 'register', 
        loadComponent: () => import('./register/register.component').then(m => m.RegisterComponent) 
    },
    { 
        path: 'p/:slug', 
        loadComponent: () => import('./landing-page/landing-page.component').then(m => m.LandingPageComponent) 
    },
    { 
        path: 'bio/:slug', 
        loadComponent: () => import('./biolink-page/biolink-page.component').then(m => m.BiolinkPageComponent) 
    },

    // ── Super Admin (solo superadmin) ─────────────────────────────────────
    { 
        path: 'super-admin', 
        loadComponent: () => import('./super-admin/super-admin.component').then(m => m.SuperAdminComponent),
        canActivate: [superAdminGuard] 
    },
    { 
        path: 'platform-analytics', 
        loadComponent: () => import('./platform-analytics/platform-analytics.component').then(m => m.PlatformAnalyticsComponent),
        canActivate: [superAdminGuard] 
    },
    { 
        path: 'audit-logs', 
        loadComponent: () => import('./audit-logs/audit-logs.component').then(m => m.AuditLogsComponent),
        canActivate: [superAdminGuard] 
    },

    // ── Rutas Protegidas (cualquier usuario autenticado) ──────────────────
    { 
        path: 'chats', 
        loadComponent: () => import('./chat-management/chat-management.component').then(m => m.ChatManagementComponent),
        canActivate: [authGuard] 
    },
    { 
        path: 'metrics', 
        loadComponent: () => import('./metrics-dashboard/metrics-dashboard.component').then(m => m.MetricsDashboardComponent),
        canActivate: [authGuard] 
    },
    { 
        path: 'orders', 
        loadComponent: () => import('./order-management/order-management.component').then(m => m.OrderManagementComponent),
        canActivate: [authGuard] 
    },
    { 
        path: 'products', 
        loadComponent: () => import('./product-management/product-management.component').then(m => m.ProductManagementComponent),
        canActivate: [authGuard] 
    },
    { 
        path: 'crm', 
        loadComponent: () => import('./customer-crm/customer-crm.component').then(m => m.CustomerCrmComponent),
        canActivate: [authGuard] 
    },
    { 
        path: 'reservations', 
        loadComponent: () => import('./reservation-management/reservation-management').then(m => m.ReservationManagement),
        canActivate: [authGuard] 
    },
    { 
        path: 'marketing', 
        loadComponent: () => import('./marketing/campaigns.component').then(m => m.CampaignsComponent),
        canActivate: [authGuard] 
    },
    { 
        path: 'delivery', 
        loadComponent: () => import('./delivery-portal/delivery-portal.component').then(m => m.DeliveryPortalComponent),
        canActivate: [authGuard] 
    },
    { 
        path: 'ai-config', 
        loadComponent: () => import('./ai-config/ai-config.component').then(m => m.AiConfigComponent),
        canActivate: [authGuard] 
    },
    { 
        path: 'omnichannel', 
        loadComponent: () => import('./omnichannel/omnichannel.component').then(m => m.OmnichannelComponent),
        canActivate: [authGuard] 
    },
    { 
        path: 'biolink-admin', 
        loadComponent: () => import('./biolink-admin/biolink-admin').then(m => m.BiolinkAdminComponent),
        canActivate: [authGuard] 
    },
    { 
        path: 'merchant-brain', 
        loadComponent: () => import('./merchant-knowledge/merchant-knowledge.component').then(m => m.MerchantKnowledgeComponent),
        canActivate: [authGuard] 
    },
    { 
        path: 'landing-builder', 
        loadComponent: () => import('./landing-builder/landing-builder.component').then(m => m.LandingBuilderComponent),
        canActivate: [authGuard] 
    },
    { 
        path: 'bot-builder', 
        loadComponent: () => import('./bot-builder/bot-builder.component').then(m => m.BotBuilderComponent),
        canActivate: [authGuard] 
    },

    // ── Ruta por defecto ──────────────────────────────────────────────────
    { path: '', redirectTo: 'login', pathMatch: 'full' }
];
