import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../supabase.service';
import { NotificationService } from '../notification.service';
import { MobileService } from '../mobile.service';

declare const pdfjsLib: any;

@Component({
    selector: 'app-merchant-knowledge',
    standalone: true,
    imports: [CommonModule, FormsModule],
    template: `
    <div class="mk-container">
        <header class="mk-header" *ngIf="!mobileService.isMobile()">
            <div class="mk-header-text">
                <h1>🧠 Cerebro de la Empresa</h1>
                <p>Entrena a tu agente con información exclusiva de tu negocio: horarios, políticas locales, servicios y más. Este conocimiento tiene <strong>prioridad máxima</strong> sobre el agente global.</p>
            </div>
        </header>

        <div class="mk-layout">
            <!-- Columna Izquierda: Formulario -->
            <div class="mk-form-col">
                <div class="mk-card">
                    <div class="mk-card-header">
                        <h3>{{ editingBlockId ? '✏️ Editar Bloque' : '➕ Nuevo Bloque' }}</h3>
                        <button *ngIf="editingBlockId" (click)="cancelEdit()" class="cancel-link">✕ Cancelar</button>
                    </div>
                    <div class="form-group">
                        <label>Título del Concepto</label>
                        <input type="text" [(ngModel)]="newBlock.title" placeholder="Ej: Horario de Atención">
                    </div>
                    <div class="form-group">
                        <label>Contenido del Conocimiento</label>
                        <textarea [(ngModel)]="newBlock.content" rows="5" placeholder="Describe la información que el agente debe conocer sobre tu negocio..."></textarea>
                    </div>
                    <button class="save-btn w-100" (click)="saveBlock()" [disabled]="isSaving || !newBlock.title || !newBlock.content">
                        {{ isSaving ? 'Guardando...' : (editingBlockId ? '💾 Actualizar Bloque' : '💾 Guardar Conocimiento') }}
                    </button>
                </div>

                <!-- Ingesta de Archivos -->
                <div class="mk-card ingest-card">
                    <h3>🪄 Ingesta Inteligente (RAG)</h3>
                    <p class="small-desc">Sube documentos de tu empresa (reglamentos, tarifas, manuales) y la IA extrae y vectoriza la información automáticamente.</p>
                    <div class="ingest-actions">
                        <label class="file-upload-btn" [class.loading]="isProcessingFile">
                            <input type="file" #fileInputRef (change)="onFileSelected($event)" accept=".pdf,.txt,.md,.csv" [disabled]="isProcessingFile">
                            <span *ngIf="!isProcessingFile">📄 Subir PDF / Doc</span>
                            <span *ngIf="isProcessingFile">⚙️ Procesando...</span>
                        </label>
                    </div>
                    <p class="file-status" *ngIf="fileStatus">{{ fileStatus }}</p>
                </div>
            </div>

            <!-- Columna Derecha: Lista de Documentos -->
            <div class="mk-list-col">
                <div class="list-header">
                    <h4>📦 Base de Conocimiento ({{ documents.length }})</h4>
                </div>

                <div class="knowledge-grid" *ngIf="documents.length > 0">
                    <div *ngFor="let doc of documents" class="knowledge-item-card">
                        <div class="k-item-header">
                            <strong>{{ doc.title }}</strong>
                            <div class="k-item-actions">
                                <button class="eye-icon" (click)="viewVector(doc)" title="Ver Fragmentos">👁️</button>
                                <button class="edit-icon" (click)="editBlock(doc)" title="Editar">✏️</button>
                                <button class="reprocess-icon" (click)="reprocessDocument(doc)" title="Re-generar Vectores" [disabled]="isProcessingFile">🔄</button>
                                <button class="delete-icon" (click)="confirmDeleteBlock(doc)" title="Eliminar">🗑️</button>
                            </div>
                        </div>
                        <p>{{ doc.description || doc.title }}</p>
                        <div class="k-item-meta">
                            <span class="v-badge">
                                ✅ RAG Activo (v768)
                            </span>
                            <span class="date" [title]="'Actualizado: ' + (doc.updated_at || doc.created_at | date:'medium')">
                                {{ doc.updated_at || doc.created_at | date:'shortDate' }}
                            </span>
                        </div>
                    </div>
                </div>

                <div *ngIf="documents.length === 0" class="empty-knowledge">
                    <div class="k-icon">🧠</div>
                    <p>La base de conocimiento escalable está vacía.<br>Sube documentos para entrenar a tu IA.</p>
                </div>
            </div>
        </div>
    </div>

    <!-- MODAL DE CONFIRMACIÓN DE ELIMINACIÓN (ESTILO PREMIUM) -->
    <div class="delete-modal-overlay" *ngIf="showDeleteConfirmModal" (click)="showDeleteConfirmModal = false">
        <div class="delete-confirmation-dialog" (click)="$event.stopPropagation()">
            <div class="delete-icon-wrapper danger">🗑️</div>
            <h3>Eliminar Bloque</h3>
            <p>¿Estás seguro de que deseas eliminar <strong>{{ blockToDelete?.title }}</strong>? Esta acción borrará el conocimiento semántico y no se puede deshacer.</p>

            <div class="delete-dialog-actions">
                <button class="dialog-cancel-btn" (click)="showDeleteConfirmModal = false" [disabled]="isSaving">
                    Cancelar
                </button>
                <button class="dialog-confirm-btn" (click)="executeDelete()" [disabled]="isSaving">
                    <span *ngIf="!isSaving">Eliminar Bloque</span>
                    <span *ngIf="isSaving">⌛ Eliminando...</span>
                </button>
            </div>
        </div>
    </div>

    <!-- MODAL DE VISTA DE VECTOR -->
    <div class="delete-modal-overlay" *ngIf="showVectorModal" (click)="showVectorModal = false">
        <div class="delete-confirmation-dialog vector-modal" (click)="$event.stopPropagation()">
            <div class="delete-icon-wrapper" style="background: #eef2ff; color: #6366f1;">🧠</div>
            <h3>Análisis del Conocimiento</h3>
            
            <div class="vector-readable-info">
                <label>Fragmentos Vectorizados ({{ selectedDocumentChunks.length }} partes):</label>
                <div *ngIf="isLoadingChunks" class="chunks-loader">⌛ Cargando fragmentos...</div>
                <div class="chunks-list" *ngIf="!isLoadingChunks">
                    <div *ngFor="let chunk of selectedDocumentChunks; let i = index" class="chunk-item">
                        <div class="chunk-num">#{{ i + 1 }}</div>
                        <div class="chunk-content">
                            <p>{{ chunk.content }}</p>
                            <div class="chunk-vector-tag">Vector: [{{ chunk.embedding?.slice(0, 3) }}... {{ chunk.embedding?.length }} dimensiones]</div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="delete-dialog-actions mt-24">
                <button class="dialog-cancel-btn w-100" (click)="showVectorModal = false">Cerrar Análisis</button>
            </div>
        </div>
    </div>
    `,
    styles: [`
        .mk-container { padding: 24px; max-width: 1200px; margin: 0 auto; font-family: 'Inter', sans-serif; }
        .mk-header { margin-bottom: 28px; }
        .mk-header h1 { font-size: 1.8rem; font-weight: 800; color: #0f172a; margin: 0 0 6px 0; }
        .mk-header p { color: #64748b; font-size: 0.95rem; margin: 0; }
        .mk-layout { display: grid; grid-template-columns: 380px 1fr; gap: 24px; align-items: start; }
        @media (max-width: 768px) { .mk-layout { grid-template-columns: 1fr; } }

        .mk-card { background: white; border-radius: 16px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04); border: 1px solid #f1f5f9; margin-bottom: 20px; }
        .mk-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; }
        .mk-card-header h3 { margin: 0; font-size: 1rem; font-weight: 700; color: #1e293b; }
        .cancel-link { background: none; border: none; color: #ef4444; cursor: pointer; font-size: 0.85rem; font-weight: 600; padding: 0; }

        .form-group { margin-bottom: 16px; }
        .form-group label { display: block; font-size: 0.85rem; font-weight: 600; color: #374151; margin-bottom: 6px; }
        .form-group input, .form-group textarea { width: 100%; padding: 10px 14px; border: 1.5px solid #e2e8f0; border-radius: 10px; font-size: 0.9rem; outline: none; transition: border-color 0.2s; background: #f8fafc; box-sizing: border-box; resize: vertical; }
        .form-group input:focus, .form-group textarea:focus { border-color: #6366f1; background: white; }

        .save-btn { background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; border: none; border-radius: 10px; padding: 12px 20px; font-weight: 700; font-size: 0.9rem; cursor: pointer; width: 100%; transition: all 0.2s; }
        .save-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(99,102,241,0.3); }
        .save-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .w-100 { width: 100%; }

        .ingest-card { background: linear-gradient(135deg, #f0fdf4, #ecfdf5); border-color: #a7f3d0; }
        .ingest-card h3 { color: #065f46; }
        .small-desc { font-size: 0.82rem; color: #047857; margin-bottom: 14px; }
        .ingest-actions { display: flex; gap: 10px; }
        .file-upload-btn { display: inline-flex; align-items: center; gap: 8px; background: #10b981; color: white; border-radius: 10px; padding: 10px 16px; font-size: 0.85rem; font-weight: 600; cursor: pointer; transition: all 0.2s; }
        .file-upload-btn:hover:not(.loading) { background: #059669; }
        .file-upload-btn.loading { opacity: 0.7; cursor: wait; }
        .file-upload-btn input { display: none; }
        .file-status { margin-top: 10px; font-size: 0.8rem; color: #047857; font-weight: 500; }

        .list-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
        .list-header h4 { margin: 0; font-size: 1rem; font-weight: 700; color: #1e293b; }
        .mini-action-btn { background: #f0f9ff; border: 1px solid #bae6fd; color: #0369a1; border-radius: 8px; padding: 6px 12px; font-size: 0.8rem; font-weight: 600; cursor: pointer; transition: all 0.2s; }
        .mini-action-btn:hover:not(:disabled) { background: #e0f2fe; }

        .knowledge-grid { display: flex; flex-direction: column; gap: 12px; }
        .knowledge-item-card { background: white; border-radius: 12px; padding: 16px; border: 1.5px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.05); transition: all 0.2s; }
        .knowledge-item-card:hover { border-color: #6366f1; box-shadow: 0 4px 12px rgba(99,102,241,0.1); }
        .knowledge-item-card.is-offline { border-left: 3px solid #f59e0b; }
        .k-item-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; gap: 8px; }
        .k-item-header strong { font-size: 0.9rem; font-weight: 700; color: #1e293b; line-height: 1.3; }
        .k-item-actions { display: flex; gap: 4px; align-items: center; flex-shrink: 0; }
        .knowledge-item-card p { margin: 0 0 10px 0; font-size: 0.82rem; color: #64748b; line-height: 1.5; }
        .k-item-meta { display: flex; justify-content: space-between; align-items: center; }
        .v-badge { font-size: 0.72rem; padding: 3px 8px; border-radius: 20px; background: #dcfce7; color: #166534; font-weight: 600; }
        .v-badge.no-vector { background: #fef3c7; color: #92400e; }
        .date { font-size: 0.75rem; color: #94a3b8; }
        .sync-mini-btn { background: #f0fdf4; border: 1px solid #bbf7d0; cursor: pointer; border-radius: 6px; padding: 3px 8px; font-size: 0.8rem; transition: all 0.2s; }
        .sync-mini-btn:hover { background: #dcfce7; }
        .edit-icon, .eye-icon, .delete-icon, .reprocess-icon { background: transparent; border: none; cursor: pointer; border-radius: 6px; padding: 5px; font-size: 1rem; transition: all 0.2s; }
        .edit-icon:hover { background: #ede9fe; }
        .eye-icon:hover { background: #e0f2fe; }
        .reprocess-icon:hover { background: #ecfdf5; }
        .delete-icon:hover { background: #fee2e2; }

        .chunks-list { display: flex; flex-direction: column; gap: 10px; max-height: 400px; overflow-y: auto; padding-right: 8px; }
        .chunk-item { display: flex; gap: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; }
        .chunk-num { background: #6366f1; color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 800; flex-shrink: 0; }
        .chunk-content p { margin: 0; font-size: 0.85rem; color: #334155; line-height: 1.4; }
        .chunk-vector-tag { margin-top: 6px; font-family: 'JetBrains Mono', monospace; font-size: 0.7rem; color: #94a3b8; }
        .chunks-loader { padding: 40px; text-align: center; color: #64748b; font-size: 0.9rem; }
        .vector-modal { max-width: 700px; width: 95%; }

        /* MODALES PREMIUM */
        .delete-modal-overlay {
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(8px);
            display: flex; align-items: center; justify-content: center; z-index: 9999;
        }
        .delete-confirmation-dialog {
            background: white; border-radius: 20px; padding: 32px; width: 90%; max-width: 400px;
            text-align: center; box-shadow: 0 10px 40px rgba(0,0,0,0.2); animation: modalSlideUp 0.3s ease-out;
        }
        .vector-modal { max-width: 600px; }
        .vector-readable-info { text-align: left; margin-bottom: 20px; }
        .vector-readable-info label, .vector-math-info label { display: block; font-size: 0.8rem; font-weight: 800; text-transform: uppercase; color: #64748b; margin-bottom: 8px; letter-spacing: 0.5px; }
        .source-text-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; }
        .source-text-box strong { display: block; font-size: 0.95rem; color: #0f172a; margin-bottom: 6px; }
        .source-text-box p { font-size: 0.85rem; color: #475569; margin: 0; line-height: 1.5; white-space: pre-wrap; }
        .vector-math-info { text-align: left; }
        .vector-content { 
            background: #0f172a; color: #38bdf8; padding: 16px; border-radius: 12px; 
            max-height: 150px; overflow-y: auto; text-align: left; font-family: 'JetBrains Mono', monospace; font-size: 0.75rem;
            line-height: 1.4;
        }
        .vector-desc { color: #64748b; font-size: 0.85rem; margin-bottom: 12px; line-height: 1.4; }
        @keyframes modalSlideUp { from { opacity: 0; transform: translateY(20px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
        .delete-icon-wrapper {
            width: 64px; height: 64px; background: #fffbeb; color: #f59e0b;
            border-radius: 16px; display: flex; align-items: center; justify-content: center;
            font-size: 2rem; margin: 0 auto 20px;
        }
        .delete-icon-wrapper.danger { background: #fef2f2; color: #ef4444; }
        .delete-dialog-actions { display: flex; gap: 12px; margin-top: 24px; }
        .dialog-cancel-btn { flex: 1; padding: 12px; border-radius: 12px; border: 1px solid #e2e8f0; background: white; font-weight: 700; cursor: pointer; transition: all 0.2s; }
        .dialog-cancel-btn:hover { background: #f8fafc; border-color: #cbd5e1; }
        .dialog-confirm-btn { flex: 1; padding: 12px; border-radius: 12px; border: none; background: #ef4444; color: white; font-weight: 700; cursor: pointer; transition: all 0.2s; }
        .dialog-confirm-btn:hover { background: #dc2626; transform: translateY(-1px); }

        .empty-knowledge { text-align: center; padding: 60px 20px; background: white; border-radius: 16px; border: 2px dashed #e2e8f0; }
        .k-icon { font-size: 3rem; margin-bottom: 12px; }
        .empty-knowledge p { color: #94a3b8; font-size: 0.9rem; line-height: 1.6; }
        .mt-20 { margin-top: 20px; }
        .mt-24 { margin-top: 24px; }
    `]
})
export class MerchantKnowledgeComponent implements OnInit {
    private supabaseService = inject(SupabaseService);
    private notificationService = inject(NotificationService);
    public mobileService = inject(MobileService);

    merchantId = '';
    blocks: any[] = []; // Compatibilidad o legado si se requiere, pero lo ocultaremos o migraremos
    documents: any[] = [];
    newBlock = { title: '', content: '' };
    editingBlockId: string | null = null;
    isSaving = false;
    isProcessingFile = false;
    fileStatus = '';

    // Modales
    showDeleteConfirmModal = false;
    blockToDelete: any = null;
    showVectorModal = false;
    selectedVectorBlock: any = null;
    selectedDocumentChunks: any[] = [];
    isLoadingChunks = false;

    // API Key y settings para embeddings
    platformSettings: any = null;

    async ngOnInit() {
        this.mobileService.setHeader('Conocimiento', false);
        // Asegurar que tenemos el ID del comercio antes de cargar
        this.merchantId = localStorage.getItem('active_merchant_id') ||
            localStorage.getItem('merchant_id') ||
            '';

        if (!this.merchantId) {
            console.warn('[Cerebro] No merchantId found in localStorage');
            // Reintentar en un momento por si SuperAdmin lo está seteando
            setTimeout(() => {
                this.merchantId = localStorage.getItem('active_merchant_id') || '';
                if (this.merchantId) {
                    this.initializeData();
                }
            }, 100);
        } else {
            this.initializeData();
        }
    }

    async initializeData() {
        await Promise.all([
            this.loadSettings(),
            this.loadBlocks()
        ]);
    }

    async loadSettings() {
        const { data } = await this.supabaseService.getPlatformSettings();
        if (data) this.platformSettings = data;
    }

    async loadBlocks() {
        if (!this.merchantId) return;
        // Cargamos los NUEVOS documentos de la base de conocimiento escalable
        const { data } = await this.supabaseService.getKnowledgeBaseDocuments(this.merchantId);
        this.documents = data || [];
        console.log(`[Cerebro] Loaded ${this.documents.length} pro documents for ${this.merchantId}`);
    }

    async saveBlock() {
        if (!this.merchantId || !this.newBlock.title || !this.newBlock.content) return;
        this.isSaving = true;
        this.fileStatus = 'Procesando conocimiento...';
        try {
            // 1. Guardar el Documento Maestro
            const docPayload: any = {
                merchant_id: this.merchantId,
                title: this.newBlock.title,
                content: this.newBlock.content, // Guardamos el contenido completo
                description: this.newBlock.content.substring(0, 100) + '...',
                source_type: 'text',
                is_active: true
            };
            if (this.editingBlockId) docPayload.id = this.editingBlockId;
            
            const { data: doc, error: docError } = await this.supabaseService.saveKnowledgeBaseDocument(docPayload);
            if (docError) throw docError;

            // 2. Fragmentar y Vectorizar (Limpiamos chunks anteriores si es edición)
            if (this.editingBlockId) {
                await this.supabaseService.deleteKnowledgeBaseChunks(this.editingBlockId);
            }

            const chunks = this.splitIntoChunks(this.newBlock.content);
            this.fileStatus = `Generando ${chunks.length} vectores...`;
            
            for (let i = 0; i < chunks.length; i++) {
                const chunkText = chunks[i];
                const vector = await this.supabaseService.generateEmbedding(this.newBlock.title + ': ' + chunkText, this.platformSettings);
                
                await this.supabaseService.saveKnowledgeBaseChunk({
                    document_id: doc.id,
                    merchant_id: this.merchantId,
                    content: chunkText,
                    embedding: vector,
                    chunk_index: i
                });
                this.fileStatus = `Procesando ${i+1}/${chunks.length}...`;
            }

            this.newBlock = { title: '', content: '' };
            this.editingBlockId = null;
            await this.loadBlocks();
            this.notificationService.show('🧠 Conocimiento fragmentado y vectorizado (Pro RAG)', 'success');
        } catch (e: any) {
            console.error(e);
            this.notificationService.show('Error al guardar: ' + e.message, 'error');
        } finally {
            this.isSaving = false;
            this.fileStatus = '';
        }
    }

    private splitIntoChunks(text: string, size: number = 1000, overlap: number = 200): string[] {
        const chunks: string[] = [];
        let start = 0;
        while (start < text.length) {
            const end = Math.min(start + size, text.length);
            chunks.push(text.substring(start, end));
            start += size - overlap;
        }
        return chunks;
    }

    editBlock(block: any) {
        this.newBlock = { title: block.title, content: block.content };
        this.editingBlockId = block.id;
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    cancelEdit() {
        this.newBlock = { title: '', content: '' };
        this.editingBlockId = null;
    }

    confirmDeleteBlock(block: any) {
        this.blockToDelete = block;
        this.showDeleteConfirmModal = true;
    }

    async executeDelete() {
        if (!this.blockToDelete) return;
        this.isSaving = true;
        try {
            // Eliminar chunks primero (por integridad referencial si no es cascada)
            await this.supabaseService.deleteKnowledgeBaseChunks(this.blockToDelete.id);
            await this.supabaseService.deleteKnowledgeBaseDocument(this.blockToDelete.id);
            this.showDeleteConfirmModal = false;
            this.blockToDelete = null;
            await this.loadBlocks();
            this.notificationService.show('Documento eliminado', 'info');
        } catch (error) {
            this.notificationService.show('Error al eliminar', 'error');
        } finally {
            this.isSaving = false;
        }
    }

    async viewVector(doc: any) {
        this.selectedVectorBlock = doc;
        this.selectedDocumentChunks = [];
        this.isLoadingChunks = true;
        this.showVectorModal = true;
        
        try {
            const { data } = await this.supabaseService.getKnowledgeBaseChunks(doc.id);
            this.selectedDocumentChunks = data || [];
        } catch (e) {
            console.error('Error cargando fragmentos:', e);
        } finally {
            this.isLoadingChunks = false;
        }
    }

    async syncBlock(block: any) {
        this.isProcessingFile = true;
        try {
            const vector = await this.supabaseService.generateEmbedding(block.title + ': ' + block.content, this.platformSettings);
            if (!vector) { this.notificationService.show('No hay API Key para vectorizar', 'error'); return; }
            await this.supabaseService.saveMerchantContextBlock({ ...block, embedding: vector });
            await this.loadBlocks();
            this.notificationService.show('⚡ Bloque vectorizado', 'success');
        } finally {
            this.isProcessingFile = false;
        }
    }

    async syncAll() {
        const pending = this.blocks.filter(b => !b.embedding);
        if (pending.length === 0) { this.notificationService.show('Todo ya está vectorizado ✅', 'info'); return; }
        this.isProcessingFile = true;
        for (const block of pending) {
            try {
                const vector = await this.supabaseService.generateEmbedding(block.title + ': ' + block.content, this.platformSettings);
                if (vector) await this.supabaseService.saveMerchantContextBlock({ ...block, embedding: vector });
            } catch (e) { console.error('Error vectorizando bloque:', e); }
        }
        await this.loadBlocks();
        this.isProcessingFile = false;
        this.notificationService.show('🔄 Sincronización completa', 'success');
    }

    async onFileSelected(event: any) {
        const file: File = event.target.files[0];
        if (!file) return;

        this.isProcessingFile = true;
        this.fileStatus = '📖 Leyendo archivo...';
        let content = '';

        try {
            if (file.type === 'application/pdf') {
                content = await this.extractPdfText(file);
            } else {
                content = await file.text();
            }

            if (content.length > 50000) content = content.substring(0, 50000); // Límite generoso para RAG
            const title = file.name.replace(/\.[^.]+$/, '').replace(/_/g, ' ');

            // 1. Guardar el Documento
            const { data: doc, error: docError } = await this.supabaseService.saveKnowledgeBaseDocument({
                merchant_id: this.merchantId,
                title,
                content, // Guardar el contenido completo del archivo
                description: `Archivo ${file.type}: ${file.name}`,
                source_type: file.type === 'application/pdf' ? 'pdf' : 'file',
                is_active: true
            });
            if (docError) throw docError;

            // 2. Fragmentar y Vectorizar
            const chunks = this.splitIntoChunks(content);
            this.fileStatus = `🧠 Fragmentando en ${chunks.length} partes...`;
            
            for (let i = 0; i < chunks.length; i++) {
                const chunkText = chunks[i];
                const vector = await this.supabaseService.generateEmbedding(title + ': ' + chunkText, this.platformSettings);
                
                await this.supabaseService.saveKnowledgeBaseChunk({
                    document_id: doc.id,
                    merchant_id: this.merchantId,
                    content: chunkText,
                    embedding: vector,
                    chunk_index: i
                });
                this.fileStatus = `🧠 Procesando ${i+1}/${chunks.length}...`;
            }

            await this.loadBlocks();
            this.notificationService.show(`📄 ${title} vectorizado en ${chunks.length} fragmentos`, 'success');
        } catch (e: any) {
            console.error(e);
            this.notificationService.show('Error procesando archivo: ' + (e.message || e), 'error');
        } finally {
            this.isProcessingFile = false;
            this.fileStatus = '';
        }
    }

    /**
     * Re-procesa un documento existente (útil si falló la vectorización inicial)
     */
    async reprocessDocument(doc: any) {
        let content = doc.content;
        
        // Si no tiene contenido, intentar recuperarlo de la BD por ID (por si el objeto está incompleto)
        if (!content) {
            const { data } = await this.supabaseService.getKnowledgeBaseDocuments(this.merchantId);
            const fullDoc = data?.find((d: any) => d.id === doc.id);
            content = fullDoc?.content;
        }

        if (!content) {
            this.notificationService.show('Este documento no tiene texto base para procesar. Por favor re-súbelo.', 'warning');
            return;
        }

        this.isProcessingFile = true;
        this.fileStatus = '🔄 Trabajando...';

        try {
            // Limpiar previos
            await this.supabaseService.deleteKnowledgeBaseChunks(doc.id);

            const chunks = this.splitIntoChunks(content);
            for (let i = 0; i < chunks.length; i++) {
                const chunkText = chunks[i];
                const vector = await this.supabaseService.generateEmbedding(doc.title + ': ' + chunkText, this.platformSettings);
                
                if (!vector) throw new Error("Fallo en generación de vector.");

                await this.supabaseService.saveKnowledgeBaseChunk({
                    document_id: doc.id,
                    merchant_id: this.merchantId,
                    content: chunkText,
                    embedding: vector,
                    chunk_index: i
                });
                this.fileStatus = `🔄 Procesando ${i+1}/${chunks.length}...`;
            }

            await this.loadBlocks();
            this.notificationService.show('✅ Documento re-vectorizado con éxito', 'success');
        } catch (e: any) {
            this.notificationService.show('Error al re-procesar: ' + e.message, 'error');
        } finally {
            this.isProcessingFile = false;
            this.fileStatus = '';
        }
    }

    private async extractPdfText(file: File): Promise<string> {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let text = '';
        const maxPages = Math.min(pdf.numPages, 10);
        for (let i = 1; i <= maxPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            text += content.items.map((item: any) => (item as any).str).join(' ') + '\n';
        }
        return text;
    }

}
