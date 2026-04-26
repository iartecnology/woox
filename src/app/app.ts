import { Component, signal, effect, inject } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { NotificationService } from './notification.service';
import { SupabaseService } from './supabase.service';
import { MobileService } from './mobile.service';
import { PushNotificationService } from './push-notification.service';
import { UpdateService } from './update.service';

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
  public mobileService = inject(MobileService);
  private pushNotificationService = inject(PushNotificationService);
  public updateService = inject(UpdateService);

  toasts = this.notificationService.toasts;
  unreadCount = this.supabaseService.unreadCount;
  unreadOrdersCount = this.supabaseService.unreadOrdersCount;
  isSoundEnabled = this.supabaseService.isSoundEnabled;
  agentStatus = this.supabaseService.agentStatus;
  isLoading = signal(true);
  isMobile = this.mobileService.isMobile;
  private merchantSubscription: any = null;
  private ordersSubscription: any = null;

  private checkMobile() {
    if (this.isMobile()) {
      this.closeSidebar();
    }
  }

  async updateStatus(status: 'online' | 'busy' | 'offline') {
    await this.supabaseService.updateAgentStatus(status);
    this.notificationService.show(`Estado cambiado a ${status}`, 'info');
  }

  sidebarOpen = false;
  profileMenuOpen = false;
  showProfileModal = false;
  darkMode = signal(false);

  userData = {
    full_name: '',
    email: '',
    password: '',
    confirm_password: ''
  };

  constructor(public router: Router) {
    // Efecto para actualizar el título de la pestaña con (N) Plataforma - Comercio
    effect(() => {
      const count = this.unreadCount();
      const prefix = count > 0 ? `(${count}) ` : '';
      this.titleService.setTitle(`${prefix}${this.platformName} - ${this.merchantName}`);
    });

    setTimeout(() => {
      this.isLoading.set(false);
    }, 1500);

    this.checkMobile();

    // Theme setup
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        this.darkMode.set(true);
        document.body.setAttribute('data-theme', 'dark');
    }
  }

  toggleDarkMode() {
      const isDark = !this.darkMode();
      this.darkMode.set(isDark);
      if (isDark) {
          document.body.setAttribute('data-theme', 'dark');
          localStorage.setItem('theme', 'dark');
      } else {
          document.body.removeAttribute('data-theme');
          localStorage.setItem('theme', 'light');
      }
  }


  toggleSound() {
    this.supabaseService.toggleSound();
  }

  async ngOnInit() {
    const userId = localStorage.getItem('user_id');
    const rawMerchantId = localStorage.getItem('active_merchant_id');

    if (userId) {
      // Cargar perfil completo desde Supabase
      const { data: profile } = await this.supabaseService.getProfile(userId);
      if (profile) {
        this.userData.full_name = profile.full_name || '';
        this.userData.email = profile.email || '';
      }

      this.pushNotificationService.init(userId).catch(err => {
        console.warn('Error inicializando notificaciones push:', err);
      });
    }

    if (rawMerchantId) {
      if (this.supabaseService.isValidUUID(rawMerchantId)) {
        const merchantId = rawMerchantId;
        
        // Limpiar suscripción previa si existe (ej. al cambiar de comercio)
        if (this.merchantSubscription) {
          this.supabaseService.unsubscribe(this.merchantSubscription);
        }

        // Carga inicial 
        await this.supabaseService.refreshGlobalUnreadCount(merchantId);
        await this.supabaseService.refreshGlobalUnreadOrdersCount(merchantId);

        // Suscripción a cambios en conversaciones
        this.merchantSubscription = this.supabaseService.subscribeToMerchantConversations(merchantId, async (payload) => {
          console.log('[App] Merchant conversation changed, refreshing count...', payload.eventType);
          await this.supabaseService.refreshGlobalUnreadCount(merchantId);

          const isNewCustomerMessage =
            (payload.eventType === 'UPDATE' && payload.new.unread_count > (payload.old?.unread_count || 0)) ||
            (payload.eventType === 'INSERT' && payload.new.unread_count > 0);

          if (isNewCustomerMessage) {
            console.log('[App] New message detected! Playing sound...');
            this.supabaseService.playSound();
          }
        });

        // Suscripción a cambios en pedidos (INSERT)
        this.ordersSubscription = this.supabaseService.subscribeToMerchantOrders(merchantId, async (payload) => {
           console.log('[App] New order detected! Refreshing count and playing sound...');
           await this.supabaseService.refreshGlobalUnreadOrdersCount(merchantId);
           this.supabaseService.playSound();
        });
      } else {
        console.warn('[App] Limpiando active_merchant_id inválido (no UUID):', rawMerchantId);
        this.clearMerchantSession();
      }
    }
  }

  private clearMerchantSession() {
    localStorage.removeItem('active_merchant_id');
    localStorage.removeItem('merchant_name');
    localStorage.removeItem('merchant_slug');
    localStorage.removeItem('merchant_industry_type');
  }

  ngOnDestroy() {
    if (this.merchantSubscription) {
      this.supabaseService.unsubscribe(this.merchantSubscription);
    }
    if (this.ordersSubscription) {
      this.supabaseService.unsubscribe(this.ordersSubscription);
    }
  }

  get isLoginPage() {
    return this.router.url === '/login' || this.router.url === '/';
  }

  get isBioLinkPage() {
    return this.router.url.startsWith('/bio/');
  }

  get isImmersivePage() {
    const url = this.router.url;
    return url.startsWith('/chats') || 
           url.startsWith('/orders') || 
           url.startsWith('/reservations') ||
           url.startsWith('/crm');
  }

  get isSuperAdmin() {
    return localStorage.getItem('user_role') === 'superadmin';
  }

  get merchantName() {
    return localStorage.getItem('merchant_name') || 'Super Admin';
  }

  get merchantLogo() {
    // Si tenemos logo de plataforma global configurado, usarlo
    const platformLogo = localStorage.getItem('platform_logo_url');
    if (platformLogo) return platformLogo;

    // Placeholders neutrales para evitar dependencias de Unsplash en producción
    return this.isSuperAdmin
      ? '/assets/icons/platform-logo-default.png' // Debería existir o ser un SVG
      : '/assets/icons/merchant-logo-default.png';
  }

  get activeMerchantId() {
    return localStorage.getItem('active_merchant_id');
  }

  get merchantIndustryType() {
    return localStorage.getItem('merchant_industry_type') || 'retail';
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

  async saveProfile() {
    if (this.userData.password && this.userData.password !== this.userData.confirm_password) {
      this.notificationService.show('Las contraseñas no coinciden', 'error');
      return;
    }

    const userId = localStorage.getItem('user_id');
    if (!userId) {
      this.notificationService.show('Error de sesión. Por favor, vuelva a conectarse', 'error');
      return;
    }

    const profileData: any = {
      id: userId,
      full_name: this.userData.full_name
    };

    if (this.userData.password) {
      profileData.password = this.userData.password;
    }

    const { error } = await this.supabaseService.saveProfile(profileData);

    if (error) {
      console.error('Error al guardar perfil:', error);
      this.notificationService.show('Error al guardar perfil', 'error');
    } else {
      this.notificationService.show('Perfil actualizado correctamente', 'success');
      localStorage.setItem('user_name', this.userData.full_name);
      this.showProfileModal = false;
      this.userData.password = '';
      this.userData.confirm_password = '';
    }
  }

  exitMerchantView() {
    localStorage.removeItem('active_merchant_id');
    localStorage.removeItem('merchant_name');
    localStorage.removeItem('merchant_slug');
    localStorage.removeItem('merchant_industry_type');
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
    localStorage.removeItem('merchant_industry_type');
    this.router.navigate(['/login']);
    this.closeSidebar();
    this.closeProfileMenu();
  }
}
