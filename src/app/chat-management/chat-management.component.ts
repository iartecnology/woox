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
    status?: 'sent' | 'delivered' | 'read';
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

    // Status filter: all | open | closed
    chatStatusFilter: 'all' | 'open' | 'closed' = 'all';

    // Emoji Picker state
    showEmojiPicker: boolean = false;
    emojiList: string[] = ['👋', '😊', '👍', '🙏', '🔥', '✅', '❤️', '🚀', '📦', '🛒', '💳', '✨', '📍', '⏰', '🎉', '🤝', '💯', '💬', '📞', '💡', '🏷️', '🎯', '⭐', '🙌'];

    // Quoted / Reply Message
    replyingToMessage: Message | null = null;

    // Scroll to bottom indicator
    showScrollBottomBtn: boolean = false;

    // Snippets Management Modal
    showSnippetsManagerModal: boolean = false;
    newSnippetCode: string = '';
    newSnippetTitle: string = '';
    newSnippetText: string = '';

    // Quick Snippets
    quickSnippets: Array<{ code: string; title: string; text: string }> = [
        { code: 'banco', title: '🏦 Datos Bancarios', text: 'Para transferencias: Bancolombia Ahorros #123-456789-00 a nombre de nuestro comercio.' },
        { code: 'horario', title: '⏰ Horarios de Atención', text: 'Nuestro horario de atención es de Lunes a Sábado de 8:00 AM a 8:00 PM.' },
        { code: 'ubicacion', title: '📍 Ubicación y Envíos', text: 'Estamos ubicados en Calle Principal #10-20. Hacemos envíos express a toda la ciudad.' },
        { code: 'catalogo', title: '🛍️ Catálogo Web', text: 'Puedes consultar todo nuestro catálogo de productos y ordenar en línea desde nuestro enlace oficial.' },
        { code: 'soporte', title: '🧑‍💻 Contacto con Especialista', text: 'Te he transferido con un asesor especialista para resolver tu solicitud personalizada de inmediato.' },
        { code: 'pago', title: '💳 Link de Pago Digital', text: 'Puedes completar tu pago en línea de forma segura con tarjeta, PSE o transferencia bancaria.' }
    ];

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

    showCrmPanel: boolean = true;
    showSnippetsMenu: boolean = false;

    // Slash Commands State
    showSlashMenu: boolean = false;
    slashQuery: string = '';
    slashSelectedIndex: number = 0;

    // AI Copilot State
    isAICopilotBusy: boolean = false;
    aiCopilotAction: string = '';

    // File Upload State
    isUploadingFile: boolean = false;

    // Audio Voice Note State
    isRecordingVoice: boolean = false;
    voiceRecordingDuration: number = 0;
    private mediaRecorder: any = null;
    private audioChunks: Blob[] = [];
    private recordingTimer: any = null;

    get filteredSlashSnippets() {
        if (!this.slashQuery) return this.quickSnippets;
        const q = this.slashQuery.toLowerCase();
        return this.quickSnippets.filter(s => s.code.toLowerCase().includes(q) || s.title.toLowerCase().includes(q) || s.text.toLowerCase().includes(q));
    }

    toggleCrmPanel() {
        this.showCrmPanel = !this.showCrmPanel;
    }

    loadCustomSnippets() {
        try {
            const saved = localStorage.getItem(`custom_snippets_${this.merchantId}`);
            if (saved) {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    this.quickSnippets = parsed;
                }
            }
        } catch (e) {
            console.warn('Error loading custom snippets:', e);
        }
    }

    saveSnippetToStorage() {
        if (!this.newSnippetCode.trim() || !this.newSnippetText.trim()) {
            this.notificationService.show('Código y texto de plantilla requeridos', 'error');
            return;
        }
        const cleanCode = this.newSnippetCode.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
        const title = this.newSnippetTitle.trim() || `/${cleanCode}`;
        
        // Comprobar si ya existe para reemplazar o añadir
        const existingIdx = this.quickSnippets.findIndex(s => s.code === cleanCode);
        if (existingIdx >= 0) {
            this.quickSnippets[existingIdx] = { code: cleanCode, title, text: this.newSnippetText.trim() };
        } else {
            this.quickSnippets.push({ code: cleanCode, title, text: this.newSnippetText.trim() });
        }

        localStorage.setItem(`custom_snippets_${this.merchantId}`, JSON.stringify(this.quickSnippets));
        this.newSnippetCode = '';
        this.newSnippetTitle = '';
        this.newSnippetText = '';
        this.showSnippetsManagerModal = false;
        this.notificationService.show('Plantilla guardada con éxito ⚡', 'success');
        this.cdr.detectChanges();
    }

    deleteSnippet(code: string) {
        this.quickSnippets = this.quickSnippets.filter(s => s.code !== code);
        localStorage.setItem(`custom_snippets_${this.merchantId}`, JSON.stringify(this.quickSnippets));
        this.notificationService.show('Plantilla eliminada', 'info');
        this.cdr.detectChanges();
    }

    insertEmoji(emoji: string) {
        this.newMessage = (this.newMessage || '') + emoji;
        this.showEmojiPicker = false;
        this.onInputChange();
    }

    copyMessageContent(content: string) {
        if (!content) return;
        // Limpiar tags tipo [IMAGE:...] si aplica
        const clean = content.replace(/\[IMAGE:.*?\]/g, '').replace(/\[AUDIO:.*?\]/g, '').replace(/\[PDF:.*?\]/g, '').trim();
        navigator.clipboard.writeText(clean || content).then(() => {
            this.notificationService.show('Mensaje copiado al portapapeles 📋', 'success');
        }).catch(() => {
            this.notificationService.show('Error al copiar texto', 'error');
        });
    }

    replyToMessage(msg: Message) {
        this.replyingToMessage = msg;
        this.cdr.detectChanges();
    }

    cancelReply() {
        this.replyingToMessage = null;
        this.cdr.detectChanges();
    }

    onChatScroll(event: Event) {
        const el = event.target as HTMLElement;
        if (!el) return;
        const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        this.showScrollBottomBtn = distanceFromBottom > 150;
    }

    async toggleConversationStatus() {
        if (!this.selectedConversation) return;
        const newStatus = this.selectedConversation.status === 'open' ? 'closed' : 'open';
        
        try {
            await this.supabaseService.rpc('update_conversation_status', {
                p_conversation_id: this.selectedConversation.id,
                p_status: newStatus
            }).catch(() => null);

            // Actualización directa en supabase
            const { error } = await (this.supabaseService as any).updateConversationStatus?.(this.selectedConversation.id, newStatus) 
                || await this.supabaseService.saveInternalNote(this.selectedConversation.id, `📌 [ESTADO]: Conversación ${newStatus === 'closed' ? 'resuelta y cerrada' : 'reabierta'}`);
            
            this.selectedConversation.status = newStatus;
            const updated = this.conversations.find(c => c.id === this.selectedConversation?.id);
            if (updated) updated.status = newStatus;

            this.notificationService.show(newStatus === 'closed' ? 'Conversación marcada como RESUELTA ✅' : 'Conversación REABIERTA 💬', 'success');
            this.cdr.detectChanges();
        } catch (e) {
            console.error('Error toggling status:', e);
            this.selectedConversation.status = newStatus;
            this.notificationService.show('Estado actualizado', 'success');
        }
    }

    exportChatHistory() {
        if (!this.selectedConversation || !this.selectedConversation.messages.length) {
            this.notificationService.show('No hay mensajes para exportar.', 'info');
            return;
        }

        const lines: string[] = [
            `HISTORIAL DE CONVERSACIÓN - WOOX`,
            `Cliente: ${this.selectedConversation.customer_name}`,
            `Canal: ${this.selectedConversation.channel}`,
            `Fecha de exportación: ${new Date().toLocaleString()}`,
            `-------------------------------------------------------`,
            ''
        ];

        this.selectedConversation.messages.forEach(m => {
            const time = new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const sender = this.getSenderName(m);
            lines.push(`[${time}] ${sender}: ${m.content}`);
        });

        const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `chat_${this.selectedConversation.customer_name.replace(/\s+/g, '_')}_${Date.now()}.txt`;
        a.click();
        URL.revokeObjectURL(url);
        this.notificationService.show('Historial exportado con éxito 📄', 'success');
    }

    insertSnippet(text: string) {
        this.newMessage = text;
        this.showSnippetsMenu = false;
        this.showSlashMenu = false;
        this.slashQuery = '';
    }

    selectSlashSnippet(snippet: any) {
        this.insertSnippet(snippet.text);
    }

    onInputKeydown(event: KeyboardEvent) {
        if (this.showSlashMenu && this.filteredSlashSnippets.length > 0) {
            if (event.key === 'ArrowDown') {
                event.preventDefault();
                this.slashSelectedIndex = (this.slashSelectedIndex + 1) % this.filteredSlashSnippets.length;
                return;
            } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                this.slashSelectedIndex = (this.slashSelectedIndex - 1 + this.filteredSlashSnippets.length) % this.filteredSlashSnippets.length;
                return;
            } else if (event.key === 'Enter' || event.key === 'Tab') {
                event.preventDefault();
                this.selectSlashSnippet(this.filteredSlashSnippets[this.slashSelectedIndex]);
                return;
            } else if (event.key === 'Escape') {
                this.showSlashMenu = false;
                return;
            }
        }
    }

    // Copiloto IA del Agente Humano
    async triggerAICopilot(mode: 'suggest' | 'rewrite' | 'summarize') {
        if (!this.selectedConversation || this.isAICopilotBusy) return;
        this.isAICopilotBusy = true;
        this.aiCopilotAction = mode;

        try {
            const lastMsgs = this.selectedConversation.messages.slice(-6).map(m => `${m.sender_type}: ${m.content}`).join('\n');
            let prompt = '';

            if (mode === 'suggest') {
                prompt = `Eres el copiloto comercial del agente humano en Woox para el comercio "${this.merchantName}".
Basándote en el historial de la conversación y las necesidades del cliente, redacta la respuesta recomendada perfecta que el agente humano debe enviar.
Sé amable, claro, orientado a solucionar y vender. Solo entrega el texto final que el agente enviará al cliente (sin comillas ni explicaciones adicionales).
Historial reciente:
${lastMsgs}`;
            } else if (mode === 'rewrite') {
                if (!this.newMessage.trim()) {
                    this.notificationService.show('Escribe primero un borrador en el chat para mejorarlo con IA.', 'info');
                    this.isAICopilotBusy = false;
                    return;
                }
                prompt = `Eres un editor de comunicaciones comerciales de alto nivel. Toma el siguiente borrador redactado por el asesor para el cliente en WhatsApp y reescríbelo para que sea más claro, empático, profesional y persuasivo, manteniendo la intención original. Solo responde con el texto mejorado:
Borrador: "${this.newMessage}"`;
            } else if (mode === 'summarize') {
                prompt = `Genera un resumen ultra-ejecutivo (máximo 3 bullets clave) del estado de este chat para el equipo interno:
${lastMsgs}`;
            }

            const modelName = (this.merchantData?.ai_model || 'gemini-1.5-flash').trim();
            const apiKey = this.merchantData?.ai_api_key || '';

            let resultText = '';

            if (apiKey) {
                // Invocación directa rápida
                const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ role: 'user', parts: [{ text: prompt }] }],
                        generationConfig: { temperature: 0.6, maxOutputTokens: 300 }
                    })
                });

                if (response.ok) {
                    const data = await response.json();
                    resultText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
                }
            }

            // Fallback con RPC supabase si no hubo apiKey directa
            if (!resultText) {
                const { data } = await this.supabaseService.rpc('generate_ai_response', {
                    p_prompt: prompt,
                    p_merchant_id: this.merchantId
                });
                resultText = data || '';
            }

            if (resultText) {
                if (mode === 'summarize') {
                    // Guardar como nota interna
                    await this.supabaseService.saveInternalNote(this.selectedConversation.id, `📋 [RESUMEN IA]:\n${resultText}`);
                    await this.loadFullDeepDetails(this.selectedConversation.id);
                    this.notificationService.show('Resumen IA guardado en notas internas', 'success');
                } else {
                    this.newMessage = resultText;
                    this.onInputChange();
                    this.notificationService.show('✨ Borrador generado por Copiloto IA', 'success');
                }
            } else {
                this.notificationService.show('No se pudo generar respuesta con IA.', 'error');
            }
        } catch (err) {
            console.error('Error en triggerAICopilot:', err);
            this.notificationService.show('Error al procesar con Copiloto IA.', 'error');
        } finally {
            this.isAICopilotBusy = false;
            this.aiCopilotAction = '';
            this.cdr.detectChanges();
        }
    }

    // Subida de Archivos (Imágenes, PDF, Documentos)
    async onFileUpload(event: Event) {
        const input = event.target as HTMLInputElement;
        if (!input.files || input.files.length === 0 || !this.selectedConversation) return;

        const file = input.files[0];
        const isImage = file.type.startsWith('image/');
        const isPdf = file.type === 'application/pdf' || file.name.endsWith('.pdf');

        this.isUploadingFile = true;
        this.notificationService.show(`Subiendo ${file.name}...`, 'info');

        try {
            const ext = file.name.split('.').pop();
            const filePath = `chat_attachments/${this.selectedConversation.id}/${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;

            const { data, error } = await this.supabaseService.uploadFile('merchant-data', filePath, file);
            if (error) throw error;

            const publicUrl = data.publicUrl;
            let formattedAttachment = '';

            if (isImage) {
                formattedAttachment = `[IMAGE:${publicUrl}:${file.name}]`;
            } else if (isPdf) {
                formattedAttachment = `[PDF:${publicUrl}:${file.name}]`;
            } else {
                formattedAttachment = `📎 Archivo adjunto: [${file.name}](${publicUrl})`;
            }

            // Enviar inmediatamente como mensaje al cliente o nota
            if (this.isInternalNote) {
                await this.supabaseService.saveInternalNote(this.selectedConversation.id, formattedAttachment);
                await this.loadFullDeepDetails(this.selectedConversation.id);
            } else {
                await this.supabaseService.sendHumanMessage(this.selectedConversation.id, formattedAttachment);
            }

            this.notificationService.show('Archivo enviado con éxito', 'success');
        } catch (err: any) {
            console.error('Error subiendo archivo:', err);
            this.notificationService.show('Error al subir archivo: ' + (err.message || 'Error desconocido'), 'error');
        } finally {
            this.isUploadingFile = false;
            input.value = '';
            this.cdr.detectChanges();
        }
    }

    // Grabación de Notas de Voz
    async toggleVoiceRecording() {
        if (this.isRecordingVoice) {
            this.stopVoiceRecording(true);
        } else {
            await this.startVoiceRecording();
        }
    }

    async startVoiceRecording() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            this.notificationService.show('Tu navegador no soporta grabación de voz.', 'error');
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.audioChunks = [];
            this.mediaRecorder = new MediaRecorder(stream);

            this.mediaRecorder.ondataavailable = (e: any) => {
                if (e.data && e.data.size > 0) {
                    this.audioChunks.push(e.data);
                }
            };

            this.mediaRecorder.onstop = async () => {
                // Detener todas las pistas de audio del micrófono
                stream.getTracks().forEach(track => track.stop());
                clearInterval(this.recordingTimer);

                if (this.audioChunks.length > 0 && this.voiceRecordingDuration >= 1) {
                    await this.uploadAndSendVoiceNote();
                }
                this.voiceRecordingDuration = 0;
                this.isRecordingVoice = false;
                this.cdr.detectChanges();
            };

            this.mediaRecorder.start(200);
            this.isRecordingVoice = true;
            this.voiceRecordingDuration = 0;

            this.recordingTimer = setInterval(() => {
                this.voiceRecordingDuration++;
                this.cdr.detectChanges();
            }, 1000);

            this.notificationService.show('Grabando nota de voz... 🎙️ Presiona de nuevo para enviar.', 'info');
        } catch (err) {
            console.error('Error accediendo al micrófono:', err);
            this.notificationService.show('No se pudo acceder al micrófono.', 'error');
            this.isRecordingVoice = false;
        }
    }

    stopVoiceRecording(send: boolean) {
        if (this.mediaRecorder && this.isRecordingVoice) {
            if (!send) {
                this.audioChunks = [];
            }
            this.mediaRecorder.stop();
        }
    }

    cancelVoiceRecording() {
        this.stopVoiceRecording(false);
        this.notificationService.show('Nota de voz cancelada', 'info');
    }

    private async uploadAndSendVoiceNote() {
        if (!this.selectedConversation) return;

        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        const audioFile = new File([audioBlob], `voice_${Date.now()}.webm`, { type: 'audio/webm' });

        this.isUploadingFile = true;
        this.notificationService.show('Enviando nota de voz...', 'info');

        try {
            const filePath = `voice_notes/${this.selectedConversation.id}/${Date.now()}.webm`;
            const { data, error } = await this.supabaseService.uploadFile('merchant-data', filePath, audioFile);
            if (error) throw error;

            const audioUrl = data.publicUrl;
            const messageText = `[AUDIO:${audioUrl}:Nota de voz (${this.voiceRecordingDuration}s)]`;

            if (this.isInternalNote) {
                await this.supabaseService.saveInternalNote(this.selectedConversation.id, messageText);
                await this.loadFullDeepDetails(this.selectedConversation.id);
            } else {
                await this.supabaseService.sendHumanMessage(this.selectedConversation.id, messageText);
            }

            this.notificationService.show('Nota de voz enviada ✅', 'success');
        } catch (err) {
            console.error('Error enviando nota de voz:', err);
            this.notificationService.show('Error al enviar nota de voz', 'error');
        } finally {
            this.isUploadingFile = false;
            this.cdr.detectChanges();
        }
    }

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

        // 2. Custom Parsing for [IMAGE:url:caption]
        html = html.replace(/\[IMAGE:(.*?)\]/g, (match, inner) => {
            const parts = inner.split(':');
            const safeUrl = parts.length > 2 ? parts.slice(0, -1).join(':').trim() : parts[0].trim();
            const safeCaption = parts.length > 2 ? parts[parts.length - 1].trim() : (parts[1] || 'Imagen adjunta').trim();
            return `
                <div class="chat-media-attachment image-attachment" style="margin: 8px 0; max-width: 320px; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; background: #000;">
                    <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="display: block;">
                        <img src="${safeUrl}" alt="${safeCaption}" style="width: 100%; max-height: 260px; object-fit: cover; display: block; cursor: pointer; transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'" />
                    </a>
                    ${safeCaption ? `<div style="padding: 6px 10px; background: rgba(0,0,0,0.6); color: #fff; font-size: 0.75rem;">${safeCaption}</div>` : ''}
                </div>
            `;
        });

        // 3. Custom Parsing for [AUDIO:url:duration]
        html = html.replace(/\[AUDIO:(.*?)\]/g, (match, inner) => {
            const parts = inner.split(':');
            const safeUrl = parts.length > 2 ? parts.slice(0, -1).join(':').trim() : parts[0].trim();
            const safeLabel = parts.length > 2 ? parts[parts.length - 1].trim() : (parts[1] || 'Nota de voz').trim();
            return `
                <div class="chat-media-attachment audio-attachment" style="margin: 8px 0; padding: 8px 12px; background: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; max-width: 320px; display: flex; flex-direction: column; gap: 6px;">
                    <div style="display: flex; align-items: center; gap: 6px; font-size: 0.75rem; font-weight: 700; color: #475569;">
                        <span>🎙️</span> <span>${safeLabel}</span>
                    </div>
                    <audio controls style="width: 100%; height: 36px; border-radius: 6px; outline: none;">
                        <source src="${safeUrl}" type="audio/webm">
                        <source src="${safeUrl}" type="audio/mp4">
                        <source src="${safeUrl}" type="audio/mpeg">
                        Tu navegador no soporta reproducción de audio.
                    </audio>
                </div>
            `;
        });

        // 4. Custom Parsing for [PDF:url:caption] AFTER markdown
        html = html.replace(/\[PDF:(.*?)\]/g, (match, inner) => {
            let safeUrl = '';
            let safeCaption = 'Documento PDF';
            
            const lastColonIdx = inner.lastIndexOf(':');
            if (lastColonIdx !== -1 && lastColonIdx > 8) {
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
            this.loadCustomSnippets();
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

        // Detectar Slash Commands
        if (this.newMessage.startsWith('/')) {
            this.showSlashMenu = true;
            this.slashQuery = this.newMessage.substring(1).trim();
            this.slashSelectedIndex = 0;
        } else {
            this.showSlashMenu = false;
            this.slashQuery = '';
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

        // 4. Filtro de Estado (Abiertos vs Resueltos)
        if (this.chatStatusFilter === 'open') {
            list = list.filter(c => c.status !== 'closed');
        } else if (this.chatStatusFilter === 'closed') {
            list = list.filter(c => c.status === 'closed');
        }

        // 5. Búsqueda
        if (this.searchQuery) {
            const query = this.searchQuery.toLowerCase();
            list = list.filter(c =>
                c.customer_name.toLowerCase().includes(query) ||
                c.last_message?.toLowerCase().includes(query)
            );
        }
        return list;
    }

    setStatusFilter(status: 'all' | 'open' | 'closed') {
        this.chatStatusFilter = status;
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

        let content = this.newMessage.trim();
        this.newMessage = '';

        // Si estamos respondiendo a un mensaje anterior, adjuntar la cita
        if (this.replyingToMessage) {
            const quotedAuthor = this.getSenderName(this.replyingToMessage);
            const shortSnippet = this.replyingToMessage.content.length > 80 
                ? this.replyingToMessage.content.substring(0, 80) + '...' 
                : this.replyingToMessage.content;
            content = `> 💬 *${quotedAuthor}*: "${shortSnippet}"\n\n${content}`;
            this.replyingToMessage = null;
        }

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

    scrollToBottom(): void {
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
