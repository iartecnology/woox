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

    ngOnInit() {
        this.loadMerchantAndConfig();
    }

    ngOnDestroy() {
        if (this.waStatusInterval) {
            clearInterval(this.waStatusInterval);
        }
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
                    this.startWAStatusPolling();
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
            this.notificationService.show(e.message || 'Error al conectar con WhatsApp', 'error');
        }
    }

    async disconnectWA() {
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
                    clearInterval(this.waStatusInterval);

                    await this.supabase.updateMerchant(this.merchantId, {
                        wa_status: 'connected',
                        wa_qr_code: null
                    });

                    // Sincronizar webhook automáticamente
                    await this.setupEvolutionWebhook(this.merchant, instanceName);

                    this.notificationService.show('¡WhatsApp conectado exitosamente!', 'success');
                }
            } catch (e) {
                console.error('Error polling status:', e);
            }
        }, 4000);
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
