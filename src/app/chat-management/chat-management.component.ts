import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewChecked, ChangeDetectorRef, inject, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { marked } from 'marked';
import { SupabaseService } from '../supabase.service';
import { ChatSimulatorComponent } from '../chat-simulator/chat-simulator.component';
import { CatalogService } from '../catalog.service';
import { NotificationService } from '../notification.service';
import { MobileService } from '../mobile.service';

interface Message {
    id: string;
    sender_type: 'ai' | 'human_agent' | 'customer';
    content: string;
    created_at: Date;
    formattedContent?: SafeHtml;
}

interface Conversation {
    id: string;
    customer_id?: string;
    customer_name: string;
    platform: string;
    channel: string;
    last_message: string;
    last_message_at: Date;
    ai_active: boolean;
    status: 'open' | 'closed';
    messages: Message[];
    unread_count: number;
    customer_name_initial?: string;
    justUpdated?: boolean;
    assigned_agent_id?: string;
}

@Component({
    selector: 'app-chat-management',
    standalone: true,
    imports: [CommonModule, FormsModule, ChatSimulatorComponent],
    templateUrl: './chat-management.component.html',
    styleUrl: './chat-management.component.css'
})
export class ChatManagementComponent implements OnInit, OnDestroy, AfterViewChecked {
    @ViewChild('chatBody') private chatBody!: ElementRef;
    @ViewChild('scrollAnchor') private scrollAnchor!: ElementRef;
    private mutationObserver?: MutationObserver;

    public mobileService = inject(MobileService);
    isMobile = this.mobileService.isMobile;

    conversations: Conversation[] = [];
    selectedConversation: Conversation | null = null;
    searchQuery: string = '';
    newMessage: string = '';
    isAILoading: boolean = false;
    merchantId: string = '';
    selectedChannel: 'all' | 'whatsapp' | 'telegram' | 'instagram' | 'messenger' | 'simulator' = 'all';

    // CRM & Details
    customerCRM: any = {};
    sessionCart: any[] = [];
    cartTotal: number = 0;
    showSessionCartPanel: boolean = false;
    internalNotes: any[] = [];
    newNote: string = '';
    currentTags: any[] = [];
    availableTags: any[] = [];
    showTagMenu: boolean = false;
    isLoadingList: boolean = false;
    isLoadingDetails: boolean = false;
    lastRefreshTime: number = 0;
    merchantName: string = 'Mi Comercio';

    // Order Creation
    showOrderModal: boolean = false;
    merchantProducts: any[] = [];
    isLoadingProducts: boolean = false;
    orderDraft: { product: any, quantity: number }[] = [];
    orderTotal: number = 0;
    productSearchQuery: string = '';

    // Delete Confirmation
    showDeleteModal: boolean = false;
    chatToDeleteId: string | null = null;
    deleteMode: 'single' | 'all' = 'single';
    isDeleting: boolean = false;

    showSimulator: boolean = false;
    isPreparingSimulator: boolean = false;

    // Agent & Inbox Management
    inboxTab: 'mine' | 'unassigned' | 'all' = 'all';
    operationalFilter: 'all' | 'ai' | 'human' = 'all';
    isInternalNote: boolean = false;
    isAgentTyping: boolean = false;
    typingAgentName: string = '';
    merchantData: any = null;

    // Pull-to-refresh
    touchStartY: number = 0;
    touchMoveY: number = 0;
    isRefreshing: boolean = false;

    private cdr = inject(ChangeDetectorRef);
    private supabaseService = inject(SupabaseService);
    private notificationService = inject(NotificationService);
    private catalogService = inject(CatalogService);
    private sanitizer = inject(DomSanitizer);
    private route = inject(ActivatedRoute);
    private router = inject(Router);
    private ngZone = inject(NgZone);

    showCrmPanel: boolean = false;

    backToList() {
        this.selectedConversation = null;
        this.mobileService.setImmersive(false);
        this.mobileService.setHeader('Chats', false);
        this.cdr.detectChanges();
    }

    agentStatus = this.supabaseService.agentStatus;

    private activeSubscription: any = null;
    private sessionSubscription: any = null;
    private merchantSubscription: any = null;
    private shouldScrollToBottom: boolean = false;

    totalNotifications: number = 0;

    getSenderName(msg: any): string {
        if (!msg) return 'Sistema';

        if (msg.sender_type === 'customer') {
            return this.selectedConversation?.customer_name || 'Cliente';
        } else if (msg.sender_type === 'ai') {
            return this.merchantName || 'Asistente IA';
        } else if (msg.sender_type === 'human_agent') {
            return 'Agente Humano';
        }
        return 'Sistema';
    }

    trackByConversationId(index: number, conv: Conversation): string {
        return conv.id;
    }

    formatMessage(content: string): SafeHtml {
        if (!content) return '';
        // Protección contra mensajes extremadamente largos que bloqueen el parser
        if (content.length > 200000) {
            console.warn('Mensaje muy largo truncado para visualización:', content.length);
            content = content.substring(0, 200000) + '... [Mensaje truncado]';
        }

        // 1. Parse Markdown first
        let html = '';
        try {
            html = marked.parse(content, { breaks: true }) as string;
        } catch (e) {
            console.error('Error parsing markdown:', e);
            html = content; // Fallback
        }

        // 2. Custom Parsing for [PDF:url:caption] AFTER markdown
        // We use a regex that matches the pattern in the resulting HTML
        html = html.replace(/\[PDF:(.*?)\]/g, (match, inner) => {
            let safeUrl = '';
            let safeCaption = 'Documento PDF';
            
            // Try to find the last colon which separates URL from Caption
            // Format is [PDF:https://url.com/file.pdf:My Caption]
            const lastColonIdx = inner.lastIndexOf(':');
            
            if (lastColonIdx !== -1 && lastColonIdx > 8) { // > 8 to skip https://
                safeUrl = inner.substring(0, lastColonIdx).trim();
                safeCaption = inner.substring(lastColonIdx + 1).trim() || 'Documento PDF';
            } else {
                safeUrl = inner.trim();
            }

            return `
                <div class="pdf-attachment" style="background: #f1f5f9; padding: 12px; border-radius: 8px; margin: 10px 0; border: 1px solid #e2e8f0; display: flex; align-items: center; gap: 12px; clear: both;">
                    <div style="background: #ef4444; color: white; border-radius: 6px; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; font-size: 1.2rem;">
                        📄
                    </div>
                    <div style="flex: 1;">
                        <div style="font-weight: 600; font-size: 0.95rem; color: #1e293b; margin-bottom: 2px;">${safeCaption}</div>
                        <a href="${safeUrl}" target="_blank" style="font-size: 0.85rem; color: #3b82f6; text-decoration: none; font-weight: 500; display: inline-block;">Abrir Documento →</a>
                    </div>
                </div>
            `;
        });

        return this.sanitizer.bypassSecurityTrustHtml(html);
    }

    get filteredGroupedProducts(): { category: string, products: any[] }[] {
        if (!this.merchantProducts) return [];

        let filtered = this.merchantProducts;
        if (this.productSearchQuery.trim()) {
            const query = this.productSearchQuery.toLowerCase();
            filtered = this.merchantProducts.filter(p =>
                p.name.toLowerCase().includes(query) ||
                (p.description && p.description.toLowerCase().includes(query)) ||
                (p.categories?.name && p.categories.name.toLowerCase().includes(query))
            );
        }

        const groups: { category: string, products: any[] }[] = [];
        filtered.forEach(p => {
            const catName = p.categories?.name || 'Sin Categoría';
            let group = groups.find(g => g.category === catName);
            if (!group) {
                group = { category: catName, products: [] };
                groups.push(group);
            }
            group.products.push(p);
        });

        // Ordenar categorías: 'Sin Categoría' al final
        return groups.sort((a, b) => {
            if (a.category === 'Sin Categoría') return 1;
            if (b.category === 'Sin Categoría') return -1;
            return a.category.localeCompare(b.category);
        });
    }

    async ngOnInit() {
        this.mobileService.setImmersive(false);
        this.merchantId = localStorage.getItem('active_merchant_id') || localStorage.getItem('merchant_id') || '';

        this.route.queryParams.subscribe(params => {
            if (params['action'] === 'simulator' && !this.showSimulator) {
                this.openSimulator(true);
                // Limpiar parámetros para evitar que se abra al refrescar
                this.router.navigate([], {
                    relativeTo: this.route,
                    queryParams: { action: null, t: null },
                    queryParamsHandling: 'merge',
                    replaceUrl: true
                });
            }
        });

        if (this.merchantId) {
            // Load merchant name for labels
            const { data: m } = await this.supabaseService.getMerchantByAnyId(this.merchantId);
            if (m) {
                this.merchantName = m.name;
                this.merchantData = m;
                // Si venía por código, lo actualizamos al UUID real para consistencia interna
                if (m.id !== this.merchantId) {
                    this.merchantId = m.id;
                }
            }

            await this.loadConversations();
            this.mobileService.setHeader('Chats', false);
            await this.loadAvailableTags();
            await this.supabaseService.requestNotificationPermission();

            // Suscribirse a cambios en tiempo real para opciones de lista
            console.log('Suscribiendo a cambios del merchant:', this.merchantId);
            this.merchantSubscription = this.supabaseService.subscribeToMerchantConversations(this.merchantId, (payload) => {
                this.ngZone.run(async () => {
                    console.log('Realtime Event:', payload.eventType, payload.new?.id);
                    const eventType = payload.eventType;

                    // Notificaciones, Sonido y REFRESO INMEDIATO
                    if (eventType === 'INSERT' || (eventType === 'UPDATE' && payload.new.last_message_at !== payload.old?.last_message_at)) {
                        console.log('Realtime: Evento de mensaje detectado, refrescando lista...');

                        // Refrescar lista al mismo tiempo que el sonido para respuesta instantánea
                        await this.loadConversations(true);

                        if (this.selectedConversation?.id !== payload.new.id) {
                            this.supabaseService.sendBrowserNotification('Nuevo mensaje', {
                                body: payload.new.last_message || 'Nuevo chat iniciado',
                                icon: '/assets/icons/chat-icon.png'
                            });
                        }
                    }

                    // Lógica de refuerzo para INSERTS con protección de debounce interno
                    if (eventType === 'INSERT') {
                        const now = Date.now();
                        if (now - this.lastRefreshTime < 1000) return; // Ya refrescamos recientemente
                        this.lastRefreshTime = now;

                        console.log('Realtime: Iniciando refuerzo de carga para nuevo chat...');
                        await new Promise(r => setTimeout(r, 1500));
                        await this.loadConversations(true);
                    }

                    this.updateGlobalNotificationCount();
                    this.cdr.markForCheck();
                    this.cdr.detectChanges();

                    // Encontrar el chat actualizado y marcarlo para animación visual (opcional)
                    if (payload.new && payload.new.id) {
                        const updatedChat = this.conversations.find(c => c.id === payload.new.id);
                        if (updatedChat) {
                            updatedChat.justUpdated = true;
                            this.cdr.detectChanges();
                            setTimeout(() => {
                                if (updatedChat) updatedChat.justUpdated = false;
                                this.cdr.detectChanges();
                            }, 3000);
                        }
                    }
                });
            });

        }
    }

    private setupMutationObserver() {
        // Removiendo MutationObserver para evitar bucles infinitos con CD
        // Ahora usamos ngAfterViewChecked con la bandera shouldScrollToBottom
        console.log('setupMutationObserver: Skipping for stability (using ngAfterViewChecked)');
    }

    // --- Pull to Refresh Logic ---
    onTouchStart(e: TouchEvent) {
        if (!this.isMobile() || this.isLoadingList) return;
        const target = e.currentTarget as HTMLElement;
        // Sólo permitir refresh si estamos arriba del todo
        if (target.scrollTop === 0) {
            this.touchStartY = e.touches[0].clientY;
            this.touchMoveY = this.touchStartY;
        } else {
            this.touchStartY = 0;
        }
    }

    onTouchMove(e: TouchEvent) {
        if (!this.touchStartY || !this.isMobile() || this.isLoadingList) return;
        this.touchMoveY = e.touches[0].clientY;
    }

    async onTouchEnd(e?: TouchEvent) {
        if (!this.touchStartY || !this.isMobile() || this.isLoadingList || this.isRefreshing) return;
        const pullDistance = this.touchMoveY - this.touchStartY;
        if (pullDistance > 80) { // Umbral de 80px para recargar
            this.isRefreshing = true;
            await this.loadConversations(true);
            this.isRefreshing = false;
        }
        this.touchStartY = 0;
        this.touchMoveY = 0;
    }

    ngOnDestroy() {
        if (this.mutationObserver) {
            this.mutationObserver.disconnect();
        }
        if (this.activeSubscription) {
            this.supabaseService.unsubscribe(this.activeSubscription);
        }
        if (this.merchantSubscription) {
            this.supabaseService.unsubscribe(this.merchantSubscription);
        }
    }

    ngAfterViewChecked() {
        if (this.shouldScrollToBottom) {
            console.log('ngAfterViewChecked: triggering scroll');
            this.scrollToBottom();
            this.shouldScrollToBottom = false;
        }
    }

    updateGlobalNotificationCount() {
        const total = this.conversations.reduce((acc, conv) => acc + (conv.unread_count || 0), 0);
        this.totalNotifications = total;
        // Actualizar el estado global en el servicio sin hacer fetch extra
        this.supabaseService.refreshGlobalUnreadCount(this.merchantId, total);
    }

    async loadMerchantData() {
        const { data } = await this.supabaseService.getMerchantByAnyId(this.merchantId);
        if (data) {
            this.merchantData = data;
            this.merchantId = data.id; // Asegurar que usamos el UUID
        }
    }

    async loadAvailableTags() {
        const { data } = await this.supabaseService.getMerchantTags(this.merchantId);
        if (data) this.availableTags = data;
    }

    // --- DELETE LOGIC ---
    get canDelete(): boolean {
        const role = localStorage.getItem('user_role');
        return role === 'superadmin' || role === 'merchant_admin';
    }

    deleteConversation(id: string, event: Event) {
        if (!this.canDelete) return;
        event.preventDefault();
        event.stopPropagation();
        this.chatToDeleteId = id;
        this.deleteMode = 'single';
        this.showDeleteModal = true;
    }

    async confirmDelete() {
        if (this.deleteMode === 'single' && !this.chatToDeleteId) return;
        if (this.deleteMode === 'all' && !this.merchantId) return;

        this.isDeleting = true;
        this.cdr.detectChanges();

        try {
            if (this.deleteMode === 'single') {
                const deleteOperation = async () => {
                    // 1. Desvincular pedidos
                    const { error: unlinkError } = await this.supabaseService.unlinkOrdersFromConversation(this.chatToDeleteId!);
                    if (unlinkError) console.warn('Advertencia desvinculando pedidos:', unlinkError);

                    // 2. Eliminar chat
                    const { error } = await this.supabaseService.deleteConversation(this.chatToDeleteId!);
                    if (error) throw error;
                };

                // Timeout de seguridad de 5 segundos
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('El servidor tardó demasiado en responder.')), 5000)
                );

                await Promise.race([deleteOperation(), timeoutPromise]);

                if (this.selectedConversation?.id === this.chatToDeleteId) {
                    this.selectedConversation = null;
                }
            } else {
                // Modo 'all'
                // 1. Desvincular todos los pedidos del comercio
                await this.supabaseService.unlinkOrdersFromAllConversations(this.merchantId);

                // 2. Eliminar todas las conversaciones
                const { error } = await this.supabaseService.deleteAllConversations(this.merchantId);
                if (error) throw error;

                this.selectedConversation = null;
                this.selectedChannel = 'all';
                this.inboxTab = 'all';
                this.searchQuery = '';
            }

            // Éxito común
            await this.loadConversations();
            this.notificationService.show(
                this.deleteMode === 'single' ? 'Chat eliminado' : 'Todos los chats han sido eliminados',
                'success'
            );

        } catch (err: any) {
            console.error('Error al eliminar:', err);
            this.notificationService.show('Error al eliminar: ' + (err.message || 'Error desconocido'), 'error');
        } finally {
            this.isDeleting = false;
            this.showDeleteModal = false;
            this.chatToDeleteId = null;
            this.cdr.detectChanges();
        }
    }

    cancelDelete() {
        this.showDeleteModal = false;
        this.chatToDeleteId = null;
    }

    async deleteAllConversations() {
        if (!this.canDelete || !this.merchantId) return;
        this.deleteMode = 'all';
        this.showDeleteModal = true;
    }


    async openSimulator(forceOpen: boolean = false) {
        if (this.isPreparingSimulator) return;

        if (this.showSimulator && !forceOpen) {
            this.showSimulator = false;
            this.cdr.detectChanges();
            return;
        }

        if (this.showSimulator && forceOpen) return;

        this.isPreparingSimulator = true;
        this.cdr.detectChanges();

        try {
            if (!this.merchantData) {
                await this.loadMerchantData();
            }

            if (!this.merchantData) {
                this.notificationService.show('No se pudieron cargar los datos del comercio. Verifica tu sesión.', 'error');
                return;
            }

            this.showSimulator = true;
        } catch (error) {
            console.error('Error opening simulator:', error);
            this.notificationService.show('Error al abrir el simulador.', 'error');
        } finally {
            this.isPreparingSimulator = false;
            this.cdr.detectChanges();
        }
    }

    async loadConversations(silent: boolean = false) {
        if (this.isLoadingList) {
            console.log('loadConversations: already loading, skipping...');
            return;
        }

        console.log(`--- START loadConversations(silent=${silent}) ---`);
        if (!silent) {
            this.isLoadingList = true;
            this.cdr.detectChanges();
        }
        try {
            const { data, error } = await this.supabaseService.getConversations(this.merchantId);
            if (error) throw error;

            if (data) {
                this.conversations = data.map((c: any) => ({
                    id: c.id,
                    customer_id: c.customer_id,
                    customer_name: c.platform === 'simulator' ? 'Simulador' : (c.customers?.full_name || c.customers?.name || c.customer_identifier || 'Cliente de Telegram'),
                    platform: c.platform || 'whatsapp',
                    channel: c.channel || c.platform || 'whatsapp',
                    last_message: c.last_message || 'Sin mensajes aún',
                    last_message_at: c.last_message_at ? new Date(c.last_message_at) : new Date(c.created_at),
                    ai_active: !!c.ai_active,
                    status: c.status || 'open',
                    unread_count: c.unread_count || 0,
                    messages: [],
                    customer_name_initial: (c.platform === 'simulator' ? 'S' : (c.customers?.full_name || c.customers?.name || c.customer_identifier || 'T')).charAt(0)
                }));

                this.updateGlobalNotificationCount();

                // Auto-select first chat if none selected (Only on Desktop)
                if (this.conversations.length > 0 && !this.selectedConversation && !this.isMobile()) {
                    this.selectConversation(this.conversations[0]);
                }
            }
        } catch (err) {
            console.error('Error loading conversations:', err);
        } finally {
            this.isLoadingList = false;
            this.cdr.detectChanges();
        }
    }

    async updateStatus(status: 'online' | 'busy' | 'offline') {
        await this.supabaseService.updateAgentStatus(status);
        this.notificationService.show(`Estado cambiado a ${status}`, 'info');
    }

    setInboxTab(tab: 'mine' | 'unassigned' | 'all') {
        this.inboxTab = tab;
        this.cdr.detectChanges();
    }

    async claimConversation() {
        if (!this.selectedConversation) return;
        const agentId = localStorage.getItem('user_id');
        if (!agentId) return;

        const { error } = await this.supabaseService.assignConversation(this.selectedConversation.id, agentId);

        if (error) {
            this.notificationService.show(error.message || 'Error al reclamar conversación', 'error');
        } else {
            this.notificationService.show('Has tomado el control de la conversación', 'success');
            this.selectedConversation.assigned_agent_id = agentId;
            this.loadConversations();
        }
    }

    onInputChange() {
        if (this.selectedConversation) {
            this.supabaseService.sendTypingIndicator(this.selectedConversation.id, this.newMessage.length > 0);
        }
    }

    get filteredConversations() {
        let list = this.conversations;

        // 1. Canal
        if (this.selectedChannel !== 'all') {
            list = list.filter(c => c.channel === this.selectedChannel);
        }

        // 2. Inbox Tab
        const userId = localStorage.getItem('user_id');
        if (this.inboxTab === 'mine') {
            list = list.filter(c => c.assigned_agent_id === userId);
        } else if (this.inboxTab === 'unassigned') {
            list = list.filter(c => !c.assigned_agent_id);
        }

        // 3. Filtro Operativo (IA vs Humano)
        if (this.operationalFilter === 'ai') {
            list = list.filter(c => c.ai_active !== false);
        } else if (this.operationalFilter === 'human') {
            list = list.filter(c => c.ai_active === false || !!c.assigned_agent_id);
        }

        // 4. Búsqueda
        if (this.searchQuery) {
            const query = this.searchQuery.toLowerCase();
            list = list.filter(c =>
                c.customer_name.toLowerCase().includes(query) ||
                c.last_message?.toLowerCase().includes(query)
            );
        }
        return list;
    }

    setOperationalFilter(filter: 'all' | 'ai' | 'human') {
        this.operationalFilter = filter;
    }

    setFilter(channel: 'all' | 'whatsapp' | 'telegram' | 'instagram' | 'messenger' | 'simulator') {
        this.selectedChannel = channel;
    }

    async selectConversation(conv: Conversation) {
        console.log('--- START selectConversation ---', conv.id);
        if (this.activeSubscription) {
            this.supabaseService.unsubscribe(this.activeSubscription);
        }
        if (this.sessionSubscription) {
            this.supabaseService.unsubscribe(this.sessionSubscription);
        }

        this.selectedConversation = conv;
        if (this.isMobile()) {
            this.mobileService.setHeader(conv.customer_name, true, () => this.backToList());
            this.mobileService.setImmersive(true);
        }
        this.isLoadingDetails = true;
        this.cdr.detectChanges();

        try {
            // Load Details (CRM, Tags, Notes)
            console.log('Calling loadFullDeepDetails...');
            await this.loadFullDeepDetails(conv.id);
            console.log('loadFullDeepDetails finished.');

            // Load Messages
            console.log('Calling getMessages...');
            const { data: messages, error: msgErr } = await this.supabaseService.getMessages(conv.id);
            if (msgErr) console.error('Error loading messages:', msgErr);
            
            if (messages) {
                console.log(`Pre-formatting ${messages.length} messages.`);
                this.selectedConversation.messages = messages.map((m: any) => ({
                    id: m.id,
                    sender_type: m.sender_type,
                    content: m.content,
                    created_at: new Date(m.created_at),
                    formattedContent: this.formatMessage(m.content)
                }));
            }
        } catch (err) {
            console.error('Exception in selectConversation:', err);
        } finally {
            console.log('Ending selectConversation, hiding spinner.');
            this.isLoadingDetails = false;
            this.shouldScrollToBottom = true;
            this.cdr.detectChanges();
        }

        // Subscribe Real-time
        console.log('Subscribing to realtime messages...');
        this.activeSubscription = this.supabaseService.subscribeToMessages(conv.id, (payload) => {
            this.ngZone.run(() => {
                console.log('Message received via Realtime:', payload.new.id);
                const newMsg = payload.new;
                if (this.selectedConversation && this.selectedConversation.id === newMsg.conversation_id) {
                    const exists = this.selectedConversation.messages.some(m => m.id === newMsg.id);
                    if (!exists) {
                        this.selectedConversation.messages.push({
                            id: newMsg.id,
                            sender_type: newMsg.sender_type,
                            content: newMsg.content,
                            created_at: new Date(newMsg.created_at),
                            formattedContent: this.formatMessage(newMsg.content)
                        });
                        this.shouldScrollToBottom = true;
                        this.cdr.detectChanges();
                    }
                }
            });
        });

        // Suscribirse a cambios en la sesión del bot (CARRITO EN TIEMPO REAL)
        console.log('Subscribing to bot session updates...');
        this.sessionSubscription = this.supabaseService.subscribeToBotSession(conv.id, (payload) => {
            this.ngZone.run(() => {
                console.log('Bot session update detected via Realtime');
                if (payload.new && payload.new.variables) {
                    this.updateCartFromSessionData(payload.new.variables);
                }
            });
        });

        // Suscribirse a Typing
        try {
          const typingChannel = this.supabaseService.channel(`typing:${conv.id}`);
          typingChannel.on('broadcast', { event: 'typing' }, (payload: any) => {
              this.ngZone.run(() => {
                  if (payload.payload.agentName !== localStorage.getItem('user_name')) {
                      this.isAgentTyping = payload.payload.isTyping;
                      this.typingAgentName = payload.payload.agentName;
                      this.cdr.detectChanges();

                      if (this.isAgentTyping) {
                          setTimeout(() => { this.isAgentTyping = false; this.cdr.detectChanges(); }, 5000);
                      }
                  }
              });
          }).subscribe();
        } catch (e) {
          console.warn('Could not subscribe to typing:', e);
        }

        // Mark as Read
        if (conv.unread_count > 0) {
            console.log('Marking as read...');
            await this.supabaseService.markAsRead(conv.id);
            conv.unread_count = 0;
            this.updateGlobalNotificationCount();
        }

        this.cdr.detectChanges();
        this.setupMutationObserver();
        console.log('--- END selectConversation ---');
    }

    async loadFullDeepDetails(convId: string) {
        console.log('Fetching conversation with customer...', convId);
        const { data, error: convErr } = await this.supabaseService.getConversationWithCustomer(convId);
        if (convErr) console.error('Error fetching conversation with customer:', convErr);
        
        if (data) {
            console.log('Conversation data received:', data.id);
            this.customerCRM = data.customers || {};
            this.currentTags = data.tags?.map((t: any) => t.tags) || [];

            // Cargar estadísticas extra de pedidos
            if (this.customerCRM.id) {
                console.log('Fetching customer stats for:', this.customerCRM.id);
                const { data: stats, error: statsErr } = await this.supabaseService.getCustomerStats(this.customerCRM.id);
                if (statsErr) console.error('Error fetching stats:', statsErr);
                if (stats) {
                    console.log('Stats received:', stats);
                    this.customerCRM.orders_count = stats.orders_count;
                    this.customerCRM.total_spent = stats.total_spent;
                }
            }

            // Sync local selectedConversation with assigned_agent_id
            if (this.selectedConversation) {
                this.selectedConversation.assigned_agent_id = data.assigned_agent_id;
            }
        }

        const { data: sessionData } = await this.supabaseService.getSessionVariables(convId);
        if (sessionData && sessionData.variables) {
            this.updateCartFromSessionData(sessionData.variables);
        }

        console.log('Fetching internal notes...');
        const { data: notes, error: notesErr } = await this.supabaseService.getInternalNotes(convId);
        if (notesErr) console.error('Error fetching notes:', notesErr);
        this.internalNotes = notes || [];
        console.log(`Internal notes loaded: ${this.internalNotes.length}`);
    }

    private updateCartFromSessionData(variables: any) {
        if (variables && variables.cart && Array.isArray(variables.cart)) {
            this.sessionCart = variables.cart;
            this.cartTotal = this.sessionCart.reduce((acc, it) => acc + (it.price * it.qty), 0);
            console.log(`Cart updated: ${this.sessionCart.length} items. Total: ${this.cartTotal}`);
        } else {
            this.sessionCart = [];
            this.cartTotal = 0;
        }
        this.cdr.detectChanges();
    }

    async optimizeCustomerWithIA() {
        if (!this.selectedConversation || this.isAILoading) return;
        this.isAILoading = true;
        try {
            const context = `
                CLIENTE: ${this.customerCRM.full_name || 'Desconocido'}
                NOTAS: ${this.internalNotes.map(n => n.content).join(' | ')}
                PEDIDOS: ${this.customerCRM.orders_count || 0}
                GASTO: $${this.customerCRM.total_spent || 0}
            `;
            
            const prompt = `Analiza estos datos de un cliente en Woox y genera un resumen "VIP" de máximo 2 líneas resaltando su perfil de compra, preferencias detectadas y cómo tratarlo (ej: "Cliente recurrente, prefiere productos de lujo, ser muy formal"). Datos: ${context}`;
            
            // Usamos el servicio de Supabase para llamar a la IA
            const { data, error } = await this.supabaseService.rpc('generate_ai_response', { 
                p_prompt: prompt,
                p_merchant_id: this.merchantId
            });

            if (data) {
                this.customerCRM.ai_summary = data;
                // Guardar en la DB
                if (this.customerCRM.id) {
                    await this.supabaseService.updateCustomerCRM(this.customerCRM.id, { 
                        notes: (this.customerCRM.notes || '') + '\n[AI SUMMARY]: ' + data 
                    });
                }
                this.notificationService.show('✨ Perfil optimizado con éxito', 'success');
            }
        } catch (e) {
            console.error('Error optimizing IA:', e);
        } finally {
            this.isAILoading = false;
        }
    }

    async saveCRM() {
        if (!this.customerCRM.id) return;
        await this.supabaseService.updateCustomerCRM(this.customerCRM.id, {
            full_name: this.customerCRM.full_name,
            phone: this.customerCRM.phone,
            email: this.customerCRM.email,
            city: this.customerCRM.city,
            notes: this.customerCRM.notes
        });
    }

    async saveNote() {
        if (!this.newNote || !this.selectedConversation) return;
        await this.supabaseService.saveInternalNote(this.selectedConversation.id, this.newNote);
        this.newNote = '';
        await this.loadFullDeepDetails(this.selectedConversation.id);
    }

    async removeTag(tagId: string) {
        if (!this.selectedConversation) return;
        await this.supabaseService.removeTagFromConversation(this.selectedConversation.id, tagId);
        await this.loadFullDeepDetails(this.selectedConversation.id);
    }

    async toggleAI() {
        if (!this.selectedConversation) return;

        // Si la IA está apagada globalmente para el comercio, avisar
        if (this.merchantData && this.merchantData.ai_enabled === false) {
            this.notificationService.show('⚠️ La IA está desactivada globalmente. Actívala primero en IA Config.', 'error');
            return;
        }

        // Manejar null como true (activo por defecto)
        const currentState = this.selectedConversation.ai_active !== false;
        const newState = !currentState;

        await this.supabaseService.toggleAI(this.selectedConversation.id, newState);
        this.selectedConversation.ai_active = newState;
        this.notificationService.show(newState ? '🤖 IA activada para esta conversación' : '🤚 IA pausada — control manual', 'info');
    }

    async sendMessage() {
        if (!this.newMessage.trim() || !this.selectedConversation) return;

        const content = this.newMessage;
        this.newMessage = '';

        if (this.isInternalNote) {
            // Enviar como nota interna
            await this.supabaseService.saveInternalNote(this.selectedConversation.id, content, localStorage.getItem('user_id')!);
            await this.loadFullDeepDetails(this.selectedConversation.id);
            this.isInternalNote = false;
        } else {
            // Enviar como mensaje normal
            const { error } = await this.supabaseService.sendHumanMessage(this.selectedConversation.id, content);
            if (error) {
                console.error('Error sending message:', error);
                // Mostrar notificación visual
                if (error.message?.includes('expired') || error.message?.includes('OAuthException')) {
                    this.notificationService.show('⚠️ Error: Tu conexión con WhatsApp ha expirado. Por favor actualiza el Token en Super Admin.', 'error');
                } else {
                    this.notificationService.show(`❌ Error al entregar el mensaje: ${error.message || 'Error desconocido'}`, 'error');
                }
            } else {
                this.shouldScrollToBottom = true;
                this.cdr.detectChanges();
            }
        }
    }

    // --- GESTIÓN DE PEDIDO ---
    async openOrderModal() {
        this.showOrderModal = true;
        this.orderDraft = [];
        this.orderTotal = 0;
        this.productSearchQuery = '';

        if (this.merchantProducts.length === 0) {
            this.isLoadingProducts = true;
            try {
                const { data } = await this.supabaseService.getProducts(this.merchantId);
                this.merchantProducts = data || [];
            } finally {
                this.isLoadingProducts = false;
                this.cdr.detectChanges();
            }
        }
    }

    addToOrder(product: any) {
        const existing = this.orderDraft.find(item => item.product.id === product.id);
        if (existing) {
            existing.quantity++;
        } else {
            this.orderDraft.push({ product, quantity: 1 });
        }
        this.calculateOrderTotal();
    }

    updateQty(productId: string, delta: number) {
        const item = this.orderDraft.find(i => i.product.id === productId);
        if (item) {
            item.quantity += delta;
            if (item.quantity <= 0) {
                this.orderDraft = this.orderDraft.filter(i => i.product.id !== productId);
            }
        }
        this.calculateOrderTotal();
    }

    calculateOrderTotal() {
        this.orderTotal = this.orderDraft.reduce((acc, item) => acc + (item.product.price * item.quantity), 0);
    }

    async submitOrder() {
        if (this.orderDraft.length === 0 || !this.selectedConversation) return;

        this.isDeleting = true;
        this.cdr.detectChanges();

        try {
            const orderData = {
                merchant_id: this.merchantId,
                customer_id: this.selectedConversation.customer_id,
                conversation_id: this.selectedConversation.id,
                total: this.orderTotal,
                status: 'pending',
                closing_agent_type: 'human'
            };

            const { data: newOrder, error } = await this.supabaseService.createOrder(orderData);

            if (error) throw error;
            if (!newOrder) throw new Error('No se pudo obtener el ID del pedido generado');

            const items = this.orderDraft.map(item => ({
                order_id: newOrder.id,
                product_id: item.product.id,
                quantity: item.quantity,
                unit_price: item.product.price,
                subtotal: item.product.price * item.quantity
            }));

            const { error: itemsError } = await this.supabaseService.createOrderItems(items);
            if (itemsError) throw itemsError;

            // Notificar en el chat
            const summary = this.orderDraft.map(i => `${i.quantity}x ${i.product.name}`).join(', ');
            await this.supabaseService.sendHumanMessage(this.selectedConversation.id, `✅ He generado tu pedido: ${summary}. Total: $${this.orderTotal}`);

            this.notificationService.show('Pedido generado correctamente', 'success');
            this.showOrderModal = false;
            this.orderDraft = [];

        } catch (err: any) {
            console.error('Error al crear pedido:', err);
            this.notificationService.show('Error al crear el pedido: ' + (err.message || 'Desconocido'), 'error');
        } finally {
            this.isDeleting = false;
            this.cdr.detectChanges();
        }
    }

    getConsolidatedPrompt(): string {
        // En un caso real, esto vendría de un servicio de Prompting consolidated
        return `Asistente para ${this.merchantData?.name || 'Comercio'}.`;
    }

    private scrollToBottom(): void {
        const el = this.chatBody?.nativeElement;
        if (!el) return;

        const performScroll = () => {
            try {
                // Forzar scroll al fondo inmediatamente
                el.scrollTop = el.scrollHeight;

                // Intento smooth con el ancla
                if (this.scrollAnchor && this.scrollAnchor.nativeElement) {
                    this.scrollAnchor.nativeElement.scrollIntoView({ behavior: 'auto', block: 'end' });
                }
            } catch (err) { }
        };

        // Doble intento: uno inmediato y uno micro-tarea
        performScroll();
        requestAnimationFrame(() => performScroll());
        setTimeout(() => performScroll(), 100);
    }
}
