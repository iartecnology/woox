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
                <div class="title-with-badge">
                    <h1>🧠 Cerebro de la Empresa</h1>
                    <span class="rag-status-badge">⚡ Motor RAG pgvector (768d)</span>
                </div>
                <p>Entrena a tu asistente con documentos empresariales, manuales, políticas y catálogos. La IA consulta este conocimiento semántico en tiempo real antes de responder a tus clientes.</p>
            </div>
            <div class="mk-header-actions">
                <button class="test-search-btn" (click)="openTestSearchModal()">
                    🔍 Probar Consulta Semántica
                </button>
            </div>
        </header>

        <!-- 📊 BARRA DE ESTADÍSTICAS DEL CEREBRO -->
        <div class="stats-row">
            <div class="stat-card">
                <span class="stat-icon">📄</span>
                <div>
                    <strong>{{ documents.length }}</strong>
                    <span>Documentos Totales</span>
                </div>
            </div>
            <div class="stat-card">
                <span class="stat-icon">🟢</span>
                <div>
                    <strong>{{ activeDocumentsCount }}</strong>
                    <span>Documentos Activos</span>
                </div>
            </div>
            <div class="stat-card">
                <span class="stat-icon">🧩</span>
                <div>
                    <strong>{{ totalChunksCount }}</strong>
                    <span>Fragmentos Vectorizados</span>
                </div>
            </div>
            <div class="stat-card">
                <span class="stat-icon">⚡</span>
                <div>
                    <strong>{{ (platformSettings?.embed_provider || 'google_gemini') | uppercase }}</strong>
                    <span>Proveedor Embedding</span>
                </div>
            </div>
        </div>

        <div class="mk-layout">
            <!-- Columna Izquierda: Formulario e Ingesta -->
            <div class="mk-form-col">
                <div class="mk-card">
                    <div class="mk-card-header">
                        <h3>{{ editingBlockId ? '✏️ Editar Conocimiento' : '➕ Nuevo Concepto Manual' }}</h3>
                        <button *ngIf="editingBlockId" (click)="cancelEdit()" class="cancel-link">✕ Cancelar</button>
                    </div>
                    <div class="form-group">
                        <label>Título del Concepto</label>
                        <input type="text" [(ngModel)]="newBlock.title" placeholder="Ej: Política de Garantías y Devoluciones">
                    </div>
                    <div class="form-group">
                        <label>Contenido Detallado</label>
                        <textarea [(ngModel)]="newBlock.content" rows="6" placeholder="Describe toda la información oficial que la IA debe conocer..."></textarea>
                    </div>
                    <button class="save-btn w-100" (click)="saveBlock()" [disabled]="isSaving || !newBlock.title || !newBlock.content">
                        {{ isSaving ? 'Guardando y Vectorizando...' : (editingBlockId ? '💾 Actualizar Documento' : '💾 Guardar y Vectorizar') }}
                    </button>
                </div>

                <!-- Ingesta de Archivos Drag & Drop -->
                <div class="mk-card ingest-card"
                     (dragover)="onDragOver($event)" 
                     (dragleave)="onDragLeave($event)" 
                     (drop)="onDrop($event)"
                     [class.dragover]="isDragging">
                    <h3>🪄 Ingesta Inteligente de Archivos (RAG)</h3>
                    <p class="small-desc">Sube o arrastra manuales, PDF de menús, tarifas o preguntas frecuentes. El sistema extraerá el texto y generará embeddings automáticamente.</p>
                    
                    <div class="dropzone-area" (click)="fileInputRef.click()">
                        <input type="file" #fileInputRef (change)="onFileSelected($event)" accept=".pdf,.txt,.md,.csv,.doc,.docx" style="display: none" [disabled]="isProcessingFile">
                        <span class="dropzone-icon">{{ isProcessingFile ? '⚙️' : '📥' }}</span>
                        <div class="dropzone-text">
                            <strong>{{ isProcessingFile ? 'Procesando documento...' : 'Haz clic o arrastra tu archivo aquí' }}</strong>
                            <span>Admite PDF, TXT, MD, CSV</span>
                        </div>
                    </div>
                    <p class="file-status" *ngIf="fileStatus">{{ fileStatus }}</p>
                </div>
            </div>

            <!-- Columna Derecha: Base de Conocimiento y Filtros -->
            <div class="mk-list-col">
                <div class="list-header">
                    <div class="list-title-wrap">
                        <h4>📦 Base de Conocimiento ({{ filteredDocuments.length }} de {{ documents.length }})</h4>
                    </div>
                    <div class="list-search-wrap">
                        <input type="text" [(ngModel)]="searchQuery" placeholder="🔍 Buscar documentos..." class="search-input">
                    </div>
                </div>

                <div class="knowledge-grid" *ngIf="filteredDocuments.length > 0">
                    <div *ngFor="let doc of filteredDocuments" class="knowledge-item-card" [class.inactive-doc]="!doc.is_active">
                        <div class="k-item-header">
                            <div class="k-title-box">
                                <span class="doc-type-badge">{{ getDocTypeIcon(doc.source_type) }} {{ doc.source_type || 'texto' | uppercase }}</span>
                                <strong>{{ doc.title }}</strong>
                            </div>
                            <div class="k-item-actions">
                                <button class="action-btn eye" (click)="viewVector(doc)" title="Ver Fragmentos Vectorizados">👁️</button>
                                <button class="action-btn text-view" (click)="viewFullText(doc)" title="Ver Texto Completo">📄</button>
                                <button class="action-btn edit" (click)="editBlock(doc)" title="Editar">✏️</button>
                                <button class="action-btn reprocess" (click)="reprocessDocument(doc)" title="Re-generar Vectores" [disabled]="isProcessingFile">🔄</button>
                                <button class="action-btn delete" (click)="confirmDeleteBlock(doc)" title="Eliminar">🗑️</button>
                            </div>
                        </div>

                        <p class="doc-desc">{{ doc.description || doc.title }}</p>

                        <div class="k-item-meta">
                            <div class="meta-left">
                                <span class="v-badge" [class.inactive]="!doc.is_active">
                                    {{ doc.is_active ? '✅ RAG Activo (v768)' : '⏸️ Pausado' }}
                                </span>
                                <span class="date" [title]="'Actualizado: ' + (doc.updated_at || doc.created_at | date:'medium')">
                                    {{ doc.updated_at || doc.created_at | date:'shortDate' }}
                                </span>
                            </div>

                            <div class="meta-right">
                                <label class="switch-small" [title]="doc.is_active ? 'Desactivar de consultas RAG' : 'Activar en consultas RAG'">
                                    <input type="checkbox" [checked]="doc.is_active !== false" (change)="toggleDocActive(doc)">
                                    <span class="slider-small round"></span>
                                </label>
                            </div>
                        </div>
                    </div>
                </div>

                <div *ngIf="filteredDocuments.length === 0" class="empty-knowledge">
                    <div class="k-icon">🧠</div>
                    <p *ngIf="searchQuery">No se encontraron documentos que coincidan con "{{ searchQuery }}".</p>
                    <p *ngIf="!searchQuery">La base de conocimiento está vacía.<br>Agrega un concepto o sube un documento PDF para entrenar a tu asistente.</p>
                </div>
            </div>
        </div>
    </div>

    <!-- MODAL DE PRUEBA DE CONSULTA SEMÁNTICA (PLAYGROUND RAG) -->
    <div class="delete-modal-overlay" *ngIf="showTestSearchModal" (click)="showTestSearchModal = false">
        <div class="delete-confirmation-dialog test-search-modal" (click)="$event.stopPropagation()">
            <div class="modal-top-bar">
                <div class="modal-title-box">
                    <span class="modal-icon">🔍</span>
                    <div>
                        <h3>Simulador de Búsqueda Semántica RAG</h3>
                        <p>Escribe una consulta para verificar qué fragmentos recupera la IA y con qué grado de similitud.</p>
                    </div>
                </div>
                <button class="btn-close-modal" (click)="showTestSearchModal = false">✕</button>
            </div>

            <div class="search-playground-body">
                <div class="search-input-group">
                    <input type="text" [(ngModel)]="testQuery" placeholder="Ej: ¿Cuáles son las políticas de devolución y garantía?" (keyup.enter)="executeTestSearch()">
                    <button class="btn-run-query" (click)="executeTestSearch()" [disabled]="isTestingSearch || !testQuery">
                        {{ isTestingSearch ? 'Buscando...' : 'Buscar Coincidencias' }}
                    </button>
                </div>

                <div *ngIf="isTestingSearch" class="test-loader">
                    ⌛ Generando embedding y calculando similitud coseno...
                </div>

                <div *ngIf="!isTestingSearch && testResults.length > 0" class="test-results-list">
                    <h4>🎯 Fragmentos Más Relevantes Encontrados:</h4>
                    <div *ngFor="let res of testResults; let i = index" class="test-result-card">
                        <div class="result-card-header">
                            <span class="match-rank">#{{ i + 1 }}</span>
                            <span class="similarity-badge">
                                Coincidencia: {{ (res.similarity * 100) | number:'1.1-1' }}%
                            </span>
                        </div>
                        <p class="result-text">{{ res.content }}</p>
                    </div>
                </div>

                <div *ngIf="!isTestingSearch && testSearchExecuted && testResults.length === 0" class="no-results-box">
                    ⚠️ No se encontraron fragmentos relevantes con el umbral actual. Asegúrate de tener documentos activos.
                </div>
            </div>
        </div>
    </div>

    <!-- MODAL DE TEXTO COMPLETO -->
    <div class="delete-modal-overlay" *ngIf="showFullTextModal" (click)="showFullTextModal = false">
        <div class="delete-confirmation-dialog vector-modal" (click)="$event.stopPropagation()">
            <div class="modal-top-bar">
                <div class="modal-title-box">
                    <span class="modal-icon">📄</span>
                    <div>
                        <h3>{{ selectedDocument?.title }}</h3>
                        <p>Contenido completo almacenado en la base de datos</p>
                    </div>
                </div>
                <button class="btn-close-modal" (click)="showFullTextModal = false">✕</button>
            </div>
            
            <div class="source-text-box full-text-scroll">
                <p>{{ selectedDocument?.content || 'Sin texto registrado.' }}</p>
            </div>

            <div class="delete-dialog-actions mt-24">
                <button class="dialog-cancel-btn" (click)="copyDocumentText()">📋 Copiar Texto</button>
                <button class="dialog-confirm-btn" style="background:#6366f1;" (click)="showFullTextModal = false">Cerrar</button>
            </div>
        </div>
    </div>

    <!-- MODAL DE CONFIRMACIÓN DE ELIMINACIÓN -->
    <div class="delete-modal-overlay" *ngIf="showDeleteConfirmModal" (click)="showDeleteConfirmModal = false">
        <div class="delete-confirmation-dialog" (click)="$event.stopPropagation()">
            <div class="delete-icon-wrapper danger">🗑️</div>
            <h3>Eliminar Documento</h3>
            <p>¿Estás seguro de que deseas eliminar <strong>{{ blockToDelete?.title }}</strong>? Se borrarán todos los fragmentos vectorizados asociados.</p>

            <div class="delete-dialog-actions">
                <button class="dialog-cancel-btn" (click)="showDeleteConfirmModal = false" [disabled]="isSaving">
                    Cancelar
                </button>
                <button class="dialog-confirm-btn" (click)="executeDelete()" [disabled]="isSaving">
                    <span *ngIf="!isSaving">Eliminar Documento</span>
                    <span *ngIf="isSaving">⌛ Eliminando...</span>
                </button>
            </div>
        </div>
    </div>

    <!-- MODAL DE VISTA DE VECTOR -->
    <div class="delete-modal-overlay" *ngIf="showVectorModal" (click)="showVectorModal = false">
        <div class="delete-confirmation-dialog vector-modal" (click)="$event.stopPropagation()">
            <div class="modal-top-bar">
                <div class="modal-title-box">
                    <span class="modal-icon">🧠</span>
                    <div>
                        <h3>Análisis de Vectores: {{ selectedVectorBlock?.title }}</h3>
                        <p>{{ selectedDocumentChunks.length }} fragmentos vectorizados</p>
                    </div>
                </div>
                <button class="btn-close-modal" (click)="showVectorModal = false">✕</button>
            </div>
            
            <div class="vector-readable-info">
                <div *ngIf="isLoadingChunks" class="chunks-loader">⌛ Cargando fragmentos...</div>
                <div class="chunks-list" *ngIf="!isLoadingChunks">
                    <div *ngFor="let chunk of selectedDocumentChunks; let i = index" class="chunk-item">
                        <div class="chunk-num">#{{ i + 1 }}</div>
                        <div class="chunk-content">
                            <p>{{ chunk.content }}</p>
                            <div class="chunk-vector-tag">Vector: [{{ chunk.embedding?.slice(0, 3) }}... {{ chunk.embedding?.length || 768 }} dimensiones]</div>
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
        .mk-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; gap: 16px; }
        .title-with-badge { display: flex; align-items: center; gap: 12px; }
        .mk-header h1 { font-size: 1.8rem; font-weight: 800; color: #0f172a; margin: 0; }
        .rag-status-badge { font-size: 0.75rem; font-weight: 800; padding: 4px 10px; border-radius: 20px; background: #eef2ff; color: #4338ca; border: 1px solid #c7d2fe; }
        .mk-header p { color: #64748b; font-size: 0.95rem; margin: 4px 0 0 0; }
        .test-search-btn { background: #6366f1; color: white; border: none; padding: 10px 18px; border-radius: 10px; font-weight: 700; font-size: 0.85rem; cursor: pointer; transition: all 0.2s; white-space: nowrap; }
        .test-search-btn:hover { background: #4f46e5; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(99,102,241,0.25); }

        /* Stats Row */
        .stats-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 24px; }
        .stat-card { background: white; border-radius: 14px; border: 1px solid #e2e8f0; padding: 16px; display: flex; align-items: center; gap: 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.02); }
        .stat-icon { font-size: 1.8rem; background: #f8fafc; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; border-radius: 10px; }
        .stat-card strong { display: block; font-size: 1.3rem; font-weight: 800; color: #0f172a; line-height: 1.2; }
        .stat-card span { font-size: 0.78rem; color: #64748b; font-weight: 600; }

        .mk-layout { display: grid; grid-template-columns: 380px 1fr; gap: 24px; align-items: start; }
        @media (max-width: 768px) { .mk-layout { grid-template-columns: 1fr; } .mk-header { flex-direction: column; align-items: flex-start; } }

        .mk-card { background: white; border-radius: 16px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); border: 1px solid #f1f5f9; margin-bottom: 20px; }
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

        .ingest-card { background: linear-gradient(135deg, #f0fdf4, #ecfdf5); border: 2px dashed #a7f3d0; transition: all 0.2s; }
        .ingest-card.dragover { border-color: #059669; background: #dcfce7; transform: scale(1.01); }
        .ingest-card h3 { color: #065f46; margin-top: 0; }
        .small-desc { font-size: 0.82rem; color: #047857; margin-bottom: 14px; line-height: 1.4; }

        .dropzone-area { border: 1.5px dashed #10b981; border-radius: 12px; padding: 20px; text-align: center; cursor: pointer; background: white; transition: all 0.2s; display: flex; flex-direction: column; align-items: center; gap: 8px; }
        .dropzone-area:hover { background: #f0fdf4; border-color: #059669; }
        .dropzone-icon { font-size: 2rem; }
        .dropzone-text strong { display: block; font-size: 0.88rem; color: #065f46; }
        .dropzone-text span { font-size: 0.75rem; color: #059669; }
        .file-status { margin-top: 10px; font-size: 0.82rem; color: #047857; font-weight: 600; }

        /* List Header & Search */
        .list-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; gap: 12px; flex-wrap: wrap; }
        .list-header h4 { margin: 0; font-size: 1rem; font-weight: 700; color: #1e293b; }
        .search-input { padding: 8px 14px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 0.85rem; width: 220px; outline: none; transition: border-color 0.2s; }
        .search-input:focus { border-color: #6366f1; }

        .knowledge-grid { display: flex; flex-direction: column; gap: 12px; }
        .knowledge-item-card { background: white; border-radius: 12px; padding: 16px; border: 1.5px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.03); transition: all 0.2s; }
        .knowledge-item-card:hover { border-color: #6366f1; box-shadow: 0 4px 12px rgba(99,102,241,0.08); }
        .knowledge-item-card.inactive-doc { opacity: 0.65; border-left: 4px solid #94a3b8; }
        
        .k-item-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; gap: 8px; }
        .k-title-box { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .doc-type-badge { font-size: 0.68rem; font-weight: 800; padding: 2px 8px; border-radius: 6px; background: #f1f5f9; color: #475569; }
        .k-item-header strong { font-size: 0.95rem; font-weight: 700; color: #0f172a; line-height: 1.3; }
        
        .k-item-actions { display: flex; gap: 4px; align-items: center; flex-shrink: 0; }
        .action-btn { background: #f8fafc; border: 1px solid #e2e8f0; cursor: pointer; border-radius: 6px; padding: 5px 8px; font-size: 0.9rem; transition: all 0.2s; }
        .action-btn:hover { background: #eef2ff; border-color: #c7d2fe; }
        .action-btn.delete:hover { background: #fef2f2; border-color: #fecaca; }

        .doc-desc { margin: 0 0 12px 0; font-size: 0.84rem; color: #475569; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .k-item-meta { display: flex; justify-content: space-between; align-items: center; border-top: 1px dashed #f1f5f9; padding-top: 10px; }
        .meta-left { display: flex; align-items: center; gap: 10px; }
        .v-badge { font-size: 0.72rem; padding: 3px 8px; border-radius: 20px; background: #dcfce7; color: #166534; font-weight: 700; }
        .v-badge.inactive { background: #f1f5f9; color: #64748b; }
        .date { font-size: 0.75rem; color: #94a3b8; }

        /* Small Switch */
        .switch-small { position: relative; display: inline-block; width: 34px; height: 18px; }
        .switch-small input { opacity: 0; width: 0; height: 0; }
        .slider-small { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #cbd5e1; transition: .3s; border-radius: 20px; }
        .slider-small:before { position: absolute; content: ""; height: 12px; width: 12px; left: 3px; bottom: 3px; background-color: white; transition: .3s; border-radius: 50%; }
        input:checked + .slider-small { background-color: #10b981; }
        input:checked + .slider-small:before { transform: translateX(16px); }

        /* Modales */
        .delete-modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(6px); display: flex; align-items: center; justify-content: center; z-index: 9999; }
        .delete-confirmation-dialog { background: white; border-radius: 20px; padding: 28px; width: 90%; max-width: 440px; text-align: center; box-shadow: 0 10px 40px rgba(0,0,0,0.2); animation: modalSlideUp 0.25s ease-out; }
        .test-search-modal { max-width: 650px; text-align: left; }
        .vector-modal { max-width: 650px; text-align: left; }

        .modal-top-bar { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
        .modal-title-box { display: flex; gap: 12px; align-items: flex-start; }
        .modal-icon { font-size: 1.8rem; background: #eef2ff; padding: 8px; border-radius: 12px; }
        .modal-title-box h3 { margin: 0; font-size: 1.15rem; font-weight: 800; color: #0f172a; }
        .modal-title-box p { margin: 4px 0 0 0; font-size: 0.82rem; color: #64748b; }
        .btn-close-modal { background: none; border: none; font-size: 1.2rem; cursor: pointer; color: #94a3b8; }
        .btn-close-modal:hover { color: #0f172a; }

        .search-input-group { display: flex; gap: 8px; margin-bottom: 20px; }
        .search-input-group input { flex: 1; padding: 12px 16px; border: 1.5px solid #cbd5e1; border-radius: 10px; font-size: 0.95rem; outline: none; }
        .search-input-group input:focus { border-color: #6366f1; }
        .btn-run-query { background: #6366f1; color: white; border: none; padding: 12px 18px; border-radius: 10px; font-weight: 700; cursor: pointer; white-space: nowrap; }
        .btn-run-query:disabled { opacity: 0.6; cursor: not-allowed; }

        .test-loader { text-align: center; padding: 30px; font-size: 0.9rem; color: #6366f1; font-weight: 600; }
        .test-results-list h4 { margin: 0 0 12px 0; font-size: 0.9rem; color: #1e293b; }
        .test-result-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; margin-bottom: 10px; }
        .result-card-header { display: flex; justify-content: space-between; margin-bottom: 6px; }
        .match-rank { font-weight: 800; color: #6366f1; font-size: 0.8rem; }
        .similarity-badge { background: #dcfce7; color: #166534; font-size: 0.75rem; font-weight: 800; padding: 2px 8px; border-radius: 99px; }
        .result-text { margin: 0; font-size: 0.86rem; color: #334155; line-height: 1.45; }
        .no-results-box { background: #fef3c7; color: #92400e; padding: 16px; border-radius: 10px; font-size: 0.85rem; font-weight: 600; }

        .full-text-scroll { max-height: 380px; overflow-y: auto; white-space: pre-wrap; font-size: 0.88rem; line-height: 1.6; color: #334155; }
        .source-text-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; }

        .chunks-list { display: flex; flex-direction: column; gap: 10px; max-height: 400px; overflow-y: auto; }
        .chunk-item { display: flex; gap: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; }
        .chunk-num { background: #6366f1; color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 800; flex-shrink: 0; }
        .chunk-content p { margin: 0; font-size: 0.85rem; color: #334155; line-height: 1.4; }
        .chunk-vector-tag { margin-top: 6px; font-family: monospace; font-size: 0.7rem; color: #94a3b8; }
        .chunks-loader { padding: 40px; text-align: center; color: #64748b; font-size: 0.9rem; }

        .delete-dialog-actions { display: flex; gap: 12px; margin-top: 20px; }
        .dialog-cancel-btn { flex: 1; padding: 12px; border-radius: 10px; border: 1px solid #e2e8f0; background: white; font-weight: 700; cursor: pointer; transition: all 0.2s; }
        .dialog-confirm-btn { flex: 1; padding: 12px; border-radius: 10px; border: none; background: #ef4444; color: white; font-weight: 700; cursor: pointer; transition: all 0.2s; }
        .delete-icon-wrapper { width: 56px; height: 56px; background: #fef2f2; color: #ef4444; border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 1.8rem; margin: 0 auto 16px; }

        .empty-knowledge { text-align: center; padding: 60px 20px; background: white; border-radius: 16px; border: 2px dashed #e2e8f0; }
        .k-icon { font-size: 3rem; margin-bottom: 12px; }
        .empty-knowledge p { color: #94a3b8; font-size: 0.9rem; line-height: 1.6; }
        .mt-24 { margin-top: 24px; }
        @keyframes modalSlideUp { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }
    `]
})
export class MerchantKnowledgeComponent implements OnInit {
    private supabaseService = inject(SupabaseService);
    private notificationService = inject(NotificationService);
    public mobileService = inject(MobileService);

    merchantId = '';
    documents: any[] = [];
    newBlock = { title: '', content: '' };
    editingBlockId: string | null = null;
    isSaving = false;
    isProcessingFile = false;
    fileStatus = '';
    isDragging = false;
    searchQuery = '';

    // Modales y vistas
    showDeleteConfirmModal = false;
    blockToDelete: any = null;
    showVectorModal = false;
    selectedVectorBlock: any = null;
    selectedDocumentChunks: any[] = [];
    isLoadingChunks = false;

    // Vista de texto completo
    showFullTextModal = false;
    selectedDocument: any = null;

    // Playground / Test de Consulta RAG
    showTestSearchModal = false;
    testQuery = '';
    isTestingSearch = false;
    testSearchExecuted = false;
    testResults: any[] = [];

    // Total chunks y settings
    totalChunksCount: number = 0;
    platformSettings: any = null;

    async ngOnInit() {
        this.mobileService.setHeader('Cerebro RAG', false);
        this.merchantId = localStorage.getItem('active_merchant_id') ||
            localStorage.getItem('merchant_id') ||
            '';

        if (this.merchantId) {
            await this.initializeData();
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
        const { data } = await this.supabaseService.getKnowledgeBaseDocuments(this.merchantId);
        this.documents = data || [];
        this.calculateStats();
    }

    async calculateStats() {
        // Estimar o contar los chunks de los documentos
        let count = 0;
        for (const doc of this.documents) {
            if (doc.content) {
                count += Math.max(1, Math.ceil(doc.content.length / 800));
            }
        }
        this.totalChunksCount = count;
    }

    get activeDocumentsCount(): number {
        return this.documents.filter(d => d.is_active !== false).length;
    }

    get filteredDocuments(): any[] {
        if (!this.searchQuery.trim()) return this.documents;
        const q = this.searchQuery.toLowerCase().trim();
        return this.documents.filter(d => 
            (d.title && d.title.toLowerCase().includes(q)) || 
            (d.content && d.content.toLowerCase().includes(q)) ||
            (d.description && d.description.toLowerCase().includes(q))
        );
    }

    getDocTypeIcon(sourceType: string): string {
        switch (sourceType) {
            case 'pdf': return '📕';
            case 'file': return '📄';
            default: return '📝';
        }
    }

    async toggleDocActive(doc: any) {
        const newStatus = doc.is_active === false;
        doc.is_active = newStatus;
        try {
            await this.supabaseService.saveKnowledgeBaseDocument({
                id: doc.id,
                is_active: newStatus
            });
            this.notificationService.show(
                newStatus ? `✅ Documento "${doc.title}" activado en el RAG` : `⏸️ Documento "${doc.title}" pausado temporalmente`, 
                'info'
            );
        } catch (e: any) {
            doc.is_active = !newStatus; // revert
            this.notificationService.show('Error al actualizar estado: ' + e.message, 'error');
        }
    }

    viewFullText(doc: any) {
        this.selectedDocument = doc;
        this.showFullTextModal = true;
    }

    copyDocumentText() {
        if (!this.selectedDocument?.content) return;
        navigator.clipboard.writeText(this.selectedDocument.content);
        this.notificationService.show('📋 Texto copiado al portapapeles', 'success');
    }

    openTestSearchModal() {
        this.testResults = [];
        this.testSearchExecuted = false;
        this.showTestSearchModal = true;
    }

    async executeTestSearch() {
        if (!this.testQuery.trim()) return;
        this.isTestingSearch = true;
        this.testSearchExecuted = true;
        this.testResults = [];

        try {
            // 1. Generar embedding de la consulta
            const queryVector = await this.supabaseService.generateEmbedding(this.testQuery, this.platformSettings);
            if (!queryVector) {
                throw new Error('No se pudo generar el vector de búsqueda. Verifica la API Key en Plataforma.');
            }

            // 2. Realizar búsqueda semántica en chunks
            const { data, error } = await this.supabaseService.searchKnowledgeBase(this.merchantId, queryVector, 0.4, 5);
            if (error) throw error;
            this.testResults = data || [];
        } catch (err: any) {
            console.error('Error en prueba semántica:', err);
            this.notificationService.show('Error en búsqueda semántica: ' + err.message, 'error');
        } finally {
            this.isTestingSearch = false;
        }
    }

    async saveBlock() {
        if (!this.merchantId || !this.newBlock.title || !this.newBlock.content) return;
        this.isSaving = true;
        this.fileStatus = 'Procesando y vectorizando conocimiento...';

        try {
            const docPayload: any = {
                merchant_id: this.merchantId,
                title: this.newBlock.title,
                content: this.newBlock.content,
                description: this.newBlock.content.substring(0, 100) + '...',
                source_type: 'text',
                is_active: true
            };
            if (this.editingBlockId) docPayload.id = this.editingBlockId;

            const { data: doc, error: docError } = await this.supabaseService.saveKnowledgeBaseDocument(docPayload);
            if (docError) throw docError;

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
                this.fileStatus = `Procesando ${i + 1}/${chunks.length}...`;
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
            await this.supabaseService.deleteKnowledgeBaseChunks(this.blockToDelete.id);
            await this.supabaseService.deleteKnowledgeBaseDocument(this.blockToDelete.id);
            this.showDeleteConfirmModal = false;
            this.blockToDelete = null;
            await this.loadBlocks();
            this.notificationService.show('Documento eliminado del cerebro', 'info');
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

    // Drag & Drop Handlers
    onDragOver(e: DragEvent) {
        e.preventDefault();
        e.stopPropagation();
        this.isDragging = true;
    }

    onDragLeave(e: DragEvent) {
        e.preventDefault();
        e.stopPropagation();
        this.isDragging = false;
    }

    onDrop(e: DragEvent) {
        e.preventDefault();
        e.stopPropagation();
        this.isDragging = false;
        const files = e.dataTransfer?.files;
        if (files && files.length > 0) {
            this.processSingleFile(files[0]);
        }
    }

    async onFileSelected(event: any) {
        const file: File = event.target.files[0];
        if (!file) return;
        await this.processSingleFile(file);
    }

    async processSingleFile(file: File) {
        this.isProcessingFile = true;
        this.fileStatus = '📖 Leyendo y extrayendo archivo...';
        let content = '';

        try {
            if (file.type === 'application/pdf') {
                content = await this.extractPdfText(file);
            } else {
                content = await file.text();
            }

            if (content.length > 60000) content = content.substring(0, 60000);
            const title = file.name.replace(/\.[^.]+$/, '').replace(/_/g, ' ');

            const { data: doc, error: docError } = await this.supabaseService.saveKnowledgeBaseDocument({
                merchant_id: this.merchantId,
                title,
                content,
                description: `Archivo ${file.type}: ${file.name}`,
                source_type: file.type === 'application/pdf' ? 'pdf' : 'file',
                is_active: true
            });
            if (docError) throw docError;

            const chunks = this.splitIntoChunks(content);
            this.fileStatus = `🧠 Fragmentando y vectorizando en ${chunks.length} partes...`;

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
                this.fileStatus = `🧠 Procesando ${i + 1}/${chunks.length}...`;
            }

            await this.loadBlocks();
            this.notificationService.show(`📄 "${title}" vectorizado en ${chunks.length} fragmentos`, 'success');
        } catch (e: any) {
            console.error(e);
            this.notificationService.show('Error procesando archivo: ' + (e.message || e), 'error');
        } finally {
            this.isProcessingFile = false;
            this.fileStatus = '';
        }
    }

    async reprocessDocument(doc: any) {
        let content = doc.content;

        if (!content) {
            const { data } = await this.supabaseService.getKnowledgeBaseDocuments(this.merchantId);
            const fullDoc = data?.find((d: any) => d.id === doc.id);
            content = fullDoc?.content;
        }

        if (!content) {
            this.notificationService.show('Este documento no tiene texto base para procesar.', 'warning');
            return;
        }

        this.isProcessingFile = true;
        this.fileStatus = '🔄 Regenerando vectores...';

        try {
            await this.supabaseService.deleteKnowledgeBaseChunks(doc.id);
            const chunks = this.splitIntoChunks(content);

            for (let i = 0; i < chunks.length; i++) {
                const chunkText = chunks[i];
                const vector = await this.supabaseService.generateEmbedding(doc.title + ': ' + chunkText, this.platformSettings);

                await this.supabaseService.saveKnowledgeBaseChunk({
                    document_id: doc.id,
                    merchant_id: this.merchantId,
                    content: chunkText,
                    embedding: vector,
                    chunk_index: i
                });
                this.fileStatus = `🔄 Procesando ${i + 1}/${chunks.length}...`;
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
        const maxPages = Math.min(pdf.numPages, 15);
        for (let i = 1; i <= maxPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            text += content.items.map((item: any) => (item as any).str).join(' ') + '\n';
        }
        return text;
    }
}
