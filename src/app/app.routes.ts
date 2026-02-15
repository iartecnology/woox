import { Routes } from '@angular/router';
import { ChatManagementComponent } from './chat-management/chat-management.component';
import { AiConfigComponent } from './ai-config/ai-config.component';
import { MetricsDashboardComponent } from './metrics-dashboard/metrics-dashboard.component';
import { ProductManagementComponent } from './product-management/product-management.component';
import { OrderManagementComponent } from './order-management/order-management.component';
import { LoginComponent } from './login/login.component';
import { SuperAdminComponent } from './super-admin/super-admin.component';
import { DeliveryPortalComponent } from './delivery-portal/delivery-portal.component';
import { PlatformAnalyticsComponent } from './platform-analytics/platform-analytics.component';
import { CustomerCrmComponent } from './customer-crm/customer-crm.component';
import { AuditLogsComponent } from './audit-logs/audit-logs.component';
import { CampaignsComponent } from './marketing/campaigns.component';
import { BiolinkPageComponent } from './biolink-page/biolink-page.component';
import { BiolinkAdminComponent } from './biolink-admin/biolink-admin';

export const routes: Routes = [
    { path: 'login', component: LoginComponent },
    { path: 'super-admin', component: SuperAdminComponent },
    { path: 'platform-analytics', component: PlatformAnalyticsComponent },
    { path: 'audit-logs', component: AuditLogsComponent },
    { path: 'crm', component: CustomerCrmComponent },
    { path: 'marketing', component: CampaignsComponent },
    { path: 'delivery', component: DeliveryPortalComponent },
    { path: 'chats', component: ChatManagementComponent },
    { path: 'ai-config', component: AiConfigComponent },
    { path: 'biolink-admin', component: BiolinkAdminComponent },
    { path: 'metrics', component: MetricsDashboardComponent },
    { path: 'products', component: ProductManagementComponent },
    { path: 'orders', component: OrderManagementComponent },
    { path: 'bio/:slug', component: BiolinkPageComponent },
    { path: '', redirectTo: 'login', pathMatch: 'full' }
];
