import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../supabase.service';
import { NotificationService } from '../notification.service';

@Component({
    selector: 'app-omnichannel',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './omnichannel.component.html',
    styleUrl: './omnichannel.component.css'
})
export class OmnichannelComponent implements OnInit, OnDestroy {
    private supabase = inject(SupabaseService);
    private notificationService = inject(NotificationService);

    merchantId: string = '';
    merchant: any = null;
    platformConfig: any = null;
    activeTab: 'whatsapp' | 'telegram' | 'facebook' = 'whatsapp';

    verifyingChannel: string = '';
    isValidatingEvolution: boolean = false;
    waStatusInterval: any = null;

    // --- MEJORAS UI & TIMERS ---
    qrCountdown: number = 60;
    private qrCountdownInterval: any = null;
    isQrExpired: boolean = false;
    showDisconnectConfirm: boolean = false;

    // Visibilidad de tokens
    showTokens: { [key: string]: boolean } = {
        wa_token: false,
        tg_token: false,
        fb_token: false
    };

    // Feedback de copiado
    copiedField: string | null = null;

    // Estados de testing / ping
    isTestingChannel: { [key: string]: boolean } = {};
    channelTestResult: { [key: string]: { success: boolean; message: string; data?: any } | null } = {};

    // Guías desplegables
    showGuides: { [key: string]: boolean } = {
        whatsapp_cloud: false,
        telegram: false,
        facebook: false
    };

    // Datos del dispositivo vinculado en WhatsApp (Evolution)
    waDeviceInfo: { number?: string; platform?: string; pushName?: string; lastSync?: Date } | null = null;

    ngOnInit() {
        this.loadMerchantAndConfig();
    }

    ngOnDestroy() {
        this.stopWAStatusPolling();
        this.stopQrTimer();
    }

    toggleTokenVisibility(field: string) {
        this.showTokens[field] = !this.showTokens[field];
    }

    toggleGuide(guide: string) {
        this.showGuides[guide] = !this.showGuides[guide];
    }

    copyToClipboard(text: string, fieldName: string) {
        if (!text) return;
        navigator.clipboard.writeText(text).then(() => {
            this.copiedField = fieldName;
            this.notificationService.show('📋 Enlace copiado al portapapeles', 'success');
            setTimeout(() => {
                if (this.copiedField === fieldName) this.copiedField = null;
            }, 2500);
        }).catch(() => {
            this.notificationService.show('Error al copiar al portapapeles', 'error');
        });
    }

    // --- CANAL STATUS HELPERS PARA BADGES DE PESTAÑAS ---
    getWhatsAppTabStatus(): { status: 'connected' | 'pairing' | 'disconnected'; label: string } {
        if (!this.merchant) return { status: 'disconnected', label: 'Inactivo' };
        if (this.merchant.wa_connector_type === 'whatsapp') {
            const hasCreds = !!(this.merchant.whatsapp_token && this.merchant.whatsapp_phone_number_id);
            return hasCreds ? { status: 'connected', label: 'Cloud API' } : { status: 'disconnected', label: 'Sin configurar' };
        }
        if (this.merchant.wa_status === 'connected') return { status: 'connected', label: 'Conectado' };
        if (this.merchant.wa_status === 'pairing') return { status: 'pairing', label: 'Emparejando...' };
        return { status: 'disconnected', label: 'Desconectado' };
    }

    getTelegramTabStatus(): { status: 'connected' | 'disconnected'; label: string } {
        if (this.merchant?.telegram_bot_token) {
            return { status: 'connected', label: 'Activo' };
        }
        return { status: 'disconnected', label: 'Sin configurar' };
    }

    getFacebookTabStatus(): { status: 'connected' | 'disconnected'; label: string } {
        if (this.merchant?.facebook_page_token) {
            return { status: 'connected', label: 'Activo' };
        }
        return { status: 'disconnected', label: 'Sin configurar' };
    }

    // --- WEBHOOK URL GENERATORS ---
    getWhatsAppCloudWebhookUrl(): string {
        const base = this.platformConfig?.supabase_url || 'https://khgegukjrtyjmonhavan.supabase.co';
        const identifier = this.merchant?.merchant_code || this.merchant?.id || this.merchantId;
        return `${base}/functions/v1/whatsapp-webhook?merchant_id=${identifier}`;
    }

    getTelegramWebhookUrl(): string {
        const base = this.platformConfig?.supabase_url || 'https://khgegukjrtyjmonhavan.supabase.co';
        const identifier = this.merchant?.merchant_code || this.merchant?.id || this.merchantId;
        return `${base}/functions/v1/telegram-webhook?merchant_id=${identifier}`;
    }

    getFacebookWebhookUrl(): string {
        const base = this.platformConfig?.supabase_url || 'https://khgegukjrtyjmonhavan.supabase.co';
        const identifier = this.merchant?.merchant_code || this.merchant?.id || this.merchantId;
        return `${base}/functions/v1/facebook-webhook?merchant_id=${identifier}`;
    }

    async loadMerchantAndConfig() {
        try {
            const activeId = localStorage.getItem('active_merchant_id');
            if (activeId) {
                this.merchantId = activeId;
                
                // Cargar datos del comercio
                const merchantRes = await this.supabase.getMerchantById(this.merchantId);
                if (merchantRes.data) {
                    this.merchant = merchantRes.data;
                    this.merchant.wa_connector_type = this.merchant.wa_connector_type || 'web_qr';
                }

                // Cargar configuraciones globales
                const settingsRes = await this.supabase.getPlatformSettings();
                if (settingsRes.data) {
                    this.platformConfig = settingsRes.data;
                }

                // Iniciar polling de estado de WhatsApp si es web_qr
                if (this.merchant?.wa_connector_type === 'web_qr') {
                    if (this.merchant.wa_status === 'connected') {
                        this.fetchWADeviceInfo();
                    } else if (this.merchant.wa_status === 'pairing') {
                        this.startWAStatusPolling();
                        this.startQrTimer();
                    }
                }
            }
        } catch (e) {
            console.error('Error loading config:', e);
            this.notificationService.show('Error al cargar la configuración', 'error');
        }
    }

    async saveConfig() {
        if (!this.merchant) return;

        try {
            const updates = {
                whatsapp_token: this.merchant.whatsapp_token,
                whatsapp_phone_number_id: this.merchant.whatsapp_phone_number_id,
                whatsapp_verify_token: this.merchant.whatsapp_verify_token,
                telegram_bot_token: this.merchant.telegram_bot_token,
                facebook_page_token: this.merchant.facebook_page_token,
                wa_connector_type: this.merchant.wa_connector_type
            };

            const { error } = await this.supabase.updateMerchant(this.merchantId, updates);
            if (error) throw error;

            this.notificationService.show('Configuración de canales guardada', 'success');
        } catch (e) {
            console.error('Error saving config:', e);
            this.notificationService.show('Error al guardar configuración', 'error');
        }
    }

    // --- WhatsApp Web/QR Management (Evolution API Integration) ---
    async generateWAQR() {
        if (!this.merchant || !this.platformConfig) return;

        const apiUrl = this.platformConfig.evolution_api_url;
        const apiKey = this.platformConfig.evolution_api_key;

        if (!apiUrl || !apiKey) {
            this.notificationService.show('Error: El administrador no ha configurado Evolution API en la plataforma.', 'error');
            return;
        }

        this.merchant.wa_status = 'pairing';
        this.notificationService.show('Iniciando vinculación...', 'info');

        const instanceName = (this.merchant.merchant_code || this.merchant.slug || this.merchant.id || 'unknown').replace(/[^a-zA-Z0-9-]/g, '_');

        try {
            // 0. Limpieza
            await fetch(`${apiUrl}/instance/delete/${instanceName}`, {
                method: 'DELETE',
                headers: { 'apikey': apiKey }
            }).catch(() => { });

            // 1. Crear instancia
            const createRes = await fetch(`${apiUrl}/instance/create`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': apiKey
                },
                body: JSON.stringify({
                    instanceName: instanceName,
                    token: '',
                    integration: 'WHATSAPP-BAILEYS',
                    qrcode: true
                })
            });

            const createData = await createRes.json();

            if (createRes.status !== 201 && createRes.status !== 200 && createRes.status !== 403) {
                throw new Error(createData.message || 'Error al conectar');
            }

            // 2. Obtener QR
            const connectRes = await fetch(`${apiUrl}/instance/connect/${instanceName}`, {
                method: 'GET',
                headers: { 'apikey': apiKey }
            });

            const connectData = await connectRes.json();
            if (connectRes.status === 200 && connectData.code) {
                this.merchant.wa_qr_code = connectData.code;
                this.merchant.wa_status = 'pairing';
                this.isQrExpired = false;
                this.startQrTimer();
                
                // Guardar QR en BD
                await this.supabase.updateMerchant(this.merchantId, {
                    wa_qr_code: connectData.code,
                    wa_status: 'pairing',
                    wa_session_id: instanceName
                });

                this.startWAStatusPolling();
            } else {
                throw new Error('No se pudo obtener el código QR');
            }
        } catch (e: any) {
            console.error('Error generating QR:', e);
            this.merchant.wa_status = 'disconnected';
            this.stopQrTimer();
            this.notificationService.show(e.message || 'Error al conectar con WhatsApp', 'error');
        }
    }

    private startQrTimer() {
        this.stopQrTimer();
        this.qrCountdown = 60;
        this.isQrExpired = false;
        this.qrCountdownInterval = setInterval(() => {
            if (this.qrCountdown > 0) {
                this.qrCountdown--;
            } else {
                this.isQrExpired = true;
                this.stopQrTimer();
                this.stopWAStatusPolling();
            }
        }, 1000);
    }

    private stopQrTimer() {
        if (this.qrCountdownInterval) {
            clearInterval(this.qrCountdownInterval);
            this.qrCountdownInterval = null;
        }
    }

    private stopWAStatusPolling() {
        if (this.waStatusInterval) {
            clearInterval(this.waStatusInterval);
            this.waStatusInterval = null;
        }
    }

    async disconnectWA() {
        this.showDisconnectConfirm = false;
        if (!this.merchant || !this.platformConfig) return;

        const apiUrl = this.platformConfig.evolution_api_url;
        const apiKey = this.platformConfig.evolution_api_key;
        const instanceName = this.merchant.wa_session_id || (this.merchant.merchant_code || this.merchant.slug || this.merchant.id || 'unknown').replace(/[^a-zA-Z0-9-]/g, '_');

        if (!apiUrl || !apiKey) return;

        this.notificationService.show('Desconectando WhatsApp...', 'info');

        try {
            await fetch(`${apiUrl}/instance/logout/${instanceName}`, {
                method: 'DELETE',
                headers: { 'apikey': apiKey }
            }).catch(() => { });

            await fetch(`${apiUrl}/instance/delete/${instanceName}`, {
                method: 'DELETE',
                headers: { 'apikey': apiKey }
            }).catch(() => { });

            this.merchant.wa_status = 'disconnected';
            this.merchant.wa_qr_code = null;
            this.merchant.wa_session_id = null;
            this.waDeviceInfo = null;
            this.stopQrTimer();
            this.stopWAStatusPolling();

            await this.supabase.updateMerchant(this.merchantId, {
                wa_status: 'disconnected',
                wa_qr_code: null,
                wa_session_id: null
            });

            this.notificationService.show('WhatsApp desconectado', 'success');
        } catch (e) {
            console.error('Error disconnecting:', e);
            this.notificationService.show('Error al desconectar', 'error');
        }
    }

    // --- TELEGRAM WEBHOOK ACTIVATION & REGISTRATION ---
    async setupTelegramWebhook() {
        const token = this.merchant?.telegram_bot_token?.trim();
        if (!token) {
            this.notificationService.show('Por favor ingresa primero el token de tu bot de Telegram.', 'warning');
            return;
        }

        const webhookUrl = this.getTelegramWebhookUrl();
        this.notificationService.show('Vinculando webhook oficial con Telegram...', 'info');
        this.isTestingChannel['telegram'] = true;

        try {
            const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: webhookUrl,
                    drop_pending_updates: false,
                    allowed_updates: ["message", "edited_message", "callback_query"]
                })
            });

            const data = await res.json();
            this.isTestingChannel['telegram'] = false;

            if (data.ok) {
                this.notificationService.show('🚀 ¡Bot de Telegram vinculado y activo con éxito!', 'success');
                this.channelTestResult['telegram'] = {
                    success: true,
                    message: 'Webhook activo: ' + (data.description || 'URL registrada correctamente')
                };
                await this.saveConfig();
            } else {
                this.notificationService.show(`Error Telegram: ${data.description}`, 'error');
                this.channelTestResult['telegram'] = {
                    success: false,
                    message: data.description || 'Error desconocido al enlazar con Telegram'
                };
            }
        } catch (err: any) {
            this.isTestingChannel['telegram'] = false;
            this.notificationService.show(`Error de red con Telegram: ${err.message}`, 'error');
        }
    }

    async deleteTelegramWebhook() {
        const token = this.merchant?.telegram_bot_token?.trim();
        if (!token) return;

        try {
            const res = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`, {
                method: 'POST'
            });
            const data = await res.json();
            if (data.ok) {
                this.notificationService.show('Webhook de Telegram desactivado', 'info');
                this.channelTestResult['telegram'] = null;
            }
        } catch (e: any) {
            this.notificationService.show('Error al desactivar webhook: ' + e.message, 'error');
        }
    }

    // --- TEST / PING DIAGNOSTICS FOR CHANNELS ---
    async testChannelConnection(channel: 'whatsapp_cloud' | 'telegram' | 'facebook') {
        this.isTestingChannel[channel] = true;
        this.channelTestResult[channel] = null;

        try {
            if (channel === 'telegram') {
                const token = this.merchant?.telegram_bot_token?.trim();
                if (!token) throw new Error('Token de bot no especificado.');

                const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
                const data = await res.json();
                if (data.ok) {
                    this.channelTestResult[channel] = {
                        success: true,
                        message: `Bot verificado: @${data.result.username} (${data.result.first_name})`
                    };
                    this.notificationService.show(`✅ Telegram Bot @${data.result.username} responde correctamente`, 'success');
                } else {
                    throw new Error(data.description || 'Token inválido');
                }
            } else if (channel === 'whatsapp_cloud') {
                const token = this.merchant?.whatsapp_token?.trim();
                const phoneId = this.merchant?.whatsapp_phone_number_id?.trim();
                if (!token || !phoneId) throw new Error('Ingresa el token de acceso y el Phone Number ID de Meta.');

                const res = await fetch(`https://graph.facebook.com/v19.0/${phoneId}?access_token=${token}`);
                const data = await res.json();
                if (data.id) {
                    this.channelTestResult[channel] = {
                        success: true,
                        message: `Teléfono verificado: ${data.display_phone_number || data.id} (${data.verified_name || 'Nombre oficial'})`
                    };
                    this.notificationService.show(`✅ Meta Cloud API verificada correctamente: ${data.display_phone_number || data.id}`, 'success');
                } else {
                    throw new Error(data.error?.message || 'Error validando con Graph API de Meta');
                }
            } else if (channel === 'facebook') {
                const token = this.merchant?.facebook_page_token?.trim();
                if (!token) throw new Error('Ingresa el Page Access Token de Facebook.');

                const res = await fetch(`https://graph.facebook.com/v19.0/me?access_token=${token}`);
                const data = await res.json();
                if (data.id) {
                    this.channelTestResult[channel] = {
                        success: true,
                        message: `Página verificada: ${data.name} (ID: ${data.id})`
                    };
                    this.notificationService.show(`✅ Página de Facebook verificada: ${data.name}`, 'success');
                } else {
                    throw new Error(data.error?.message || 'Token de página inválido o expirado');
                }
            }
        } catch (err: any) {
            this.channelTestResult[channel] = {
                success: false,
                message: err.message || 'Fallo de conexión'
            };
            this.notificationService.show(`Error: ${err.message}`, 'error');
        } finally {
            this.isTestingChannel[channel] = false;
        }
    }

    async syncEvolutionWebhook() {
        if (!this.merchant || !this.platformConfig) return;
        const instanceName = this.merchant.wa_session_id || (this.merchant.merchant_code || this.merchant.slug || this.merchant.id || 'unknown').replace(/[^a-zA-Z0-9-]/g, '_');
        
        this.notificationService.show('Sincronizando webhook...', 'info');
        
        const apiUrl = this.platformConfig.evolution_api_url;
        const apiKey = this.platformConfig.evolution_api_key;
        const supabaseUrl = this.platformConfig.supabase_url;
        const supabaseKey = this.platformConfig.supabase_key;

        if (!apiUrl || !apiKey || !supabaseUrl || !supabaseKey) {
            this.notificationService.show('Faltan configuraciones globales de la plataforma', 'error');
            return;
        }

        const webhookUrl = `${supabaseUrl}/functions/v1/evolution-webhook?merchant_id=${this.merchantId}`;

        try {
            const res = await fetch(`${apiUrl}/webhook/set/${instanceName}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': apiKey
                },
                body: JSON.stringify({
                    webhook: {
                        enabled: true,
                        url: webhookUrl,
                        webhook_by_events: false,
                        webhook_base64: true,
                        events: [
                            "APPLICATION_STARTUP",
                            "QRCODE_UPDATED",
                            "MESSAGES_UPSERT",
                            "MESSAGES_UPDATE",
                            "MESSAGES_DELETE",
                            "SEND_MESSAGE",
                            "CONNECTION_UPDATE",
                            "CHATS_SET",
                            "CHATS_UPSERT",
                            "CHATS_UPDATE",
                            "CHATS_DELETE",
                            "PRESENCE_UPDATE",
                            "CONTACTS_UPSERT",
                            "CONTACTS_UPDATE"
                        ]
                    }
                })
            });

            if (res.status === 200) {
                this.notificationService.show('Webhook sincronizado correctamente', 'success');
            } else {
                throw new Error('Error al configurar webhook');
            }
        } catch (e) {
            console.error('Error syncing webhook:', e);
            this.notificationService.show('Error al sincronizar webhook', 'error');
        }
    }

    private startWAStatusPolling() {
        if (this.waStatusInterval) clearInterval(this.waStatusInterval);

        const instanceName = this.merchant.wa_session_id || (this.merchant.merchant_code || this.merchant.slug || this.merchant.id || 'unknown').replace(/[^a-zA-Z0-9-]/g, '_');
        const apiUrl = this.platformConfig.evolution_api_url;
        const apiKey = this.platformConfig.evolution_api_key;

        if (!apiUrl || !apiKey) return;

        this.waStatusInterval = setInterval(async () => {
            try {
                const res = await fetch(`${apiUrl}/instance/connectionState/${instanceName}`, {
                    method: 'GET',
                    headers: { 'apikey': apiKey }
                });

                const data = await res.json();
                if (res.status === 200 && data.instance?.state === 'open') {
                    this.merchant.wa_status = 'connected';
                    this.merchant.wa_qr_code = null;
                    this.stopQrTimer();
                    this.stopWAStatusPolling();

                    await this.supabase.updateMerchant(this.merchantId, {
                        wa_status: 'connected',
                        wa_qr_code: null
                    });

                    // Cargar info del dispositivo conectado
                    await this.fetchWADeviceInfo(instanceName);

                    // Sincronizar webhook automáticamente
                    await this.setupEvolutionWebhook(this.merchant, instanceName);

                    this.notificationService.show('¡WhatsApp conectado exitosamente!', 'success');
                }
            } catch (e) {
                console.error('Error polling status:', e);
            }
        }, 4000);
    }

    async fetchWADeviceInfo(instanceName?: string) {
        if (!this.merchant || !this.platformConfig) return;
        const inst = instanceName || this.merchant.wa_session_id || (this.merchant.merchant_code || this.merchant.slug || this.merchant.id || 'unknown').replace(/[^a-zA-Z0-9-]/g, '_');
        const apiUrl = this.platformConfig.evolution_api_url;
        const apiKey = this.platformConfig.evolution_api_key;
        if (!apiUrl || !apiKey) return;

        try {
            const res = await fetch(`${apiUrl}/instance/connectionState/${inst}`, {
                method: 'GET',
                headers: { 'apikey': apiKey }
            });
            const data = await res.json();
            if (data?.instance) {
                this.waDeviceInfo = {
                    number: data.instance.ownerJid?.split('@')[0] || data.instance.profileName || 'Dispositivo vinculado',
                    platform: data.instance.platform || 'WhatsApp Baileys',
                    pushName: data.instance.profileName || '',
                    lastSync: new Date()
                };
            }
        } catch { }
    }

    private async setupEvolutionWebhook(merchant: any, instanceName: string) {
        const apiUrl = this.platformConfig.evolution_api_url;
        const apiKey = this.platformConfig.evolution_api_key;
        const supabaseUrl = this.platformConfig.supabase_url;

        if (!apiUrl || !apiKey || !supabaseUrl) return;

        const webhookUrl = `${supabaseUrl}/functions/v1/evolution-webhook?merchant_id=${this.merchantId}`;

        try {
            await fetch(`${apiUrl}/webhook/set/${instanceName}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': apiKey
                },
                body: JSON.stringify({
                    webhook: {
                        enabled: true,
                        url: webhookUrl,
                        webhook_by_events: false,
                        webhook_base64: true,
                        events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"]
                    }
                })
            });
        } catch (e) {
            console.error('Error setting webhook:', e);
        }
    }
}
