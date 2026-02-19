import { Component, signal, effect, inject } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { NotificationService } from './notification.service';
import { SupabaseService } from './supabase.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('woox-frontend');
  private notificationService = inject(NotificationService);
  private supabaseService = inject(SupabaseService);
  private titleService = inject(Title);

  toasts = this.notificationService.toasts;
  unreadCount = this.supabaseService.unreadCount;
  isSoundEnabled = this.supabaseService.isSoundEnabled;
  agentStatus = this.supabaseService.agentStatus;
  isLoading = signal(true);
  private merchantSubscription: any = null;

  async updateStatus(status: 'online' | 'busy' | 'offline') {
    await this.supabaseService.updateAgentStatus(status);
    this.notificationService.show(`Estado cambiado a ${status}`, 'info');
  }

  sidebarOpen = false;
  profileMenuOpen = false;
  showProfileModal = false;

  userData = {
    full_name: '',
    email: '',
    password: '',
    confirm_password: ''
  };

  constructor(private router: Router) {
    // Efecto para actualizar el título de la pestaña con (N) Plataforma - Comercio
    effect(() => {
      const count = this.unreadCount();
      const prefix = count > 0 ? `(${count}) ` : '';
      this.titleService.setTitle(`${prefix}${this.platformName} - ${this.merchantName}`);
    });

    setTimeout(() => {
      this.isLoading.set(false);
    }, 1500);
  }

  openGlobalSimulator() {
    this.router.navigate(['/chats'], {
      queryParams: { action: 'simulator', t: Date.now() }
    });
  }

  toggleSound() {
    this.supabaseService.toggleSound();
  }

  async ngOnInit() {
    this.userData.full_name = localStorage.getItem('user_name') || 'Usuario';
    const merchantId = localStorage.getItem('active_merchant_id');

    if (merchantId) {
      // Carga inicial
      await this.supabaseService.refreshGlobalUnreadCount(merchantId);

      // Suscripción a cambios
      this.merchantSubscription = this.supabaseService.subscribeToMerchantConversations(merchantId, async (payload) => {
        await this.supabaseService.refreshGlobalUnreadCount(merchantId);

        // Play sound if unread_count increased OR it's a NEW conversation with unread messages
        const isNewCustomerMessage =
          (payload.eventType === 'UPDATE' && payload.new.unread_count > (payload.old?.unread_count || 0)) ||
          (payload.eventType === 'INSERT' && payload.new.unread_count > 0);

        if (isNewCustomerMessage) {
          this.supabaseService.playSound();
        }
      });
    }
  }

  ngOnDestroy() {
    if (this.merchantSubscription) {
      this.supabaseService.unsubscribe(this.merchantSubscription);
    }
  }

  get isLoginPage() {
    return this.router.url === '/login' || this.router.url === '/';
  }

  get isBioLinkPage() {
    return this.router.url.startsWith('/bio/');
  }

  get isSuperAdmin() {
    return localStorage.getItem('user_role') === 'superadmin';
  }

  get merchantName() {
    return localStorage.getItem('merchant_name') || 'Super Admin';
  }

  get merchantLogo() {
    return this.isSuperAdmin
      ? 'https://images.unsplash.com/photo-1599305445671-ac291c95aaa9?w=100&h=100&fit=crop'
      : 'https://images.unsplash.com/photo-1571091718767-18b5b1457add?w=100&h=100&fit=crop';
  }

  get activeMerchantId() {
    return localStorage.getItem('active_merchant_id');
  }

  get platformName() {
    return localStorage.getItem('platform_name') || 'Woox';
  }

  get appVersion() {
    return '1.0.0'; // Sincronizado con package.json
  }

  get platformLogoUrl() {
    return localStorage.getItem('platform_logo_url') || '';
  }

  get usePlatformLogoImage() {
    return localStorage.getItem('use_logo_image') === 'true';
  }

  toggleSidebar() {
    this.sidebarOpen = !this.sidebarOpen;
  }

  closeSidebar() {
    this.sidebarOpen = false;
  }

  toggleProfileMenu() {
    this.profileMenuOpen = !this.profileMenuOpen;
  }

  closeProfileMenu() {
    this.profileMenuOpen = false;
  }

  openProfileModal() {
    this.showProfileModal = true;
    this.closeProfileMenu();
  }

  saveProfile() {
    if (this.userData.password && this.userData.password !== this.userData.confirm_password) {
      this.notificationService.show('Las contraseñas no coinciden', 'error');
      return;
    }

    this.notificationService.show('Perfil actualizado correctamente', 'success');
    this.showProfileModal = false;

    // Limpiar contraseñas por seguridad después de guardar
    this.userData.password = '';
    this.userData.confirm_password = '';
  }

  exitMerchantView() {
    localStorage.removeItem('active_merchant_id');
    localStorage.removeItem('merchant_name');
    localStorage.removeItem('merchant_slug');
    this.router.navigate(['/super-admin']);
    this.closeSidebar();
    this.closeProfileMenu();
    this.notificationService.show('Has vuelto al panel de Super Admin', 'info');
  }

  logout() {
    localStorage.removeItem('user_role');
    localStorage.removeItem('merchant_name');
    localStorage.removeItem('merchant_slug');
    localStorage.removeItem('active_merchant_id');
    this.router.navigate(['/login']);
    this.closeSidebar();
    this.closeProfileMenu();
  }
}
