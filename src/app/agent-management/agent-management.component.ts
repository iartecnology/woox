import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { SupabaseService } from '../supabase.service';
import { NotificationService } from '../notification.service';
import { ChatSimulatorComponent } from '../chat-simulator/chat-simulator.component';

@Component({
    selector: 'app-agent-management',
    standalone: true,
    imports: [CommonModule, FormsModule, ChatSimulatorComponent],
    templateUrl: './agent-management.component.html',
    styleUrl: './agent-management.component.css'
})
export class AgentManagementComponent implements OnInit {
    private supabaseService = inject(SupabaseService);
    private notificationService = inject(NotificationService);
    private sanitizer = inject(DomSanitizer);
    private cdr = inject(ChangeDetectorRef);

    activeTab: 'general' | 'skills' | 'designer' | 'knowledge' = 'general';
    showWizard: boolean = false;
    showSkillWizard: boolean = false;
    showPromptPreview: boolean = false;
    showSkillPreview: boolean = false; // Preview del fragmento generado por IA
    wizardStep: number = 1;
    skillWizardStep: number = 1;
    isSaving: boolean = false;
    isGeneratingAI: boolean = false;
    isSimulating: boolean = false; // Estado del simulador de skill
    showAgentSimulator: boolean = false; // Nuevo estado para el componente compartido
    platformSettings: any = null;
    merchantSettings: any = null;

    agentFullContext: string = '';
    simulatedMerchant: any = {
        name: 'Simulador de Agente',
        logo_url: 'https://cdn-icons-png.flaticon.com/512/4712/4712035.png',
        primary_color: '#4F46E5'
    };

    get effectiveAiApiKey(): string {
        return this.platformSettings?.ai_api_key || this.merchantSettings?.ai_api_key || '';
    }

    get effectiveAiModel(): string {
        return (this.platformSettings?.ai_model || this.merchantSettings?.ai_model) || 'gemini-1.5-flash';
    }


    simMessages: any[] = []; // Mensajes del simulador de skill
    simUserInput: string = ''; // Input del usuario en el simulador

    agents: any[] = [];
    skillsCatalog: any[] = [];
    selectedAgent: any = null;
    agentSkills: any[] = []; // Lista de agent_skills CON join a skills_catalog
    agentKnowledge: any[] = []; // Bloques de conocimiento del agente

    // Nueva entrada de conocimiento
    newBlock: any = { title: '', content: '' };
    editingContextBlockId: string | null = null;
    isProcessingFile: boolean = false;

    // Confirmation Modal
    showConfirmModal: boolean = false;
    confirmTitle: string = '';
    confirmText: string = '';
    confirmIcon: string = '🗑️';
    onConfirm: () => void = () => { };
    isConfirming: boolean = false;
    confirmBtnText: string = 'Sí, continuar';
    cancelBtnText: string = 'Cancelar';

    // Skills pendientes de asignar cuando el agente aún no existe en DB (wizard)
    pendingSkillIds: Set<string> = new Set();
    togglingSkills: Set<string> = new Set(); // ID de skills siendo procesadas para feedback visual

    // Designer state
    editingSkill: any = {
        name: '',
        slug: '',
        category: 'general',
        description: '',
        system_prompt_fragment: '',
        variables: [] // Variables dinámicas habilitadas en el futuro
    };

    skillExamples = [
        {
            name: 'Reservas de Mesa',
            slug: 'restaurant_booking',
            category: 'booking',
            description: 'Permite a la IA gestionar disponibilidad y capturar reservas.',
            prompt: `### HABILIDAD: RESERVAS
- Si el usuario quiere reservar, pide: Fecha, Hora y Número de personas.
- Consulta disponibilidad y confirma con el código [BOOKING:{"date":"...","time":"...","pax":0}]`
        },
        {
            name: 'Soporte Técnico',
            slug: 'tech_support',
            category: 'support',
            description: 'Guía al usuario en resolución de problemas básicos.',
            prompt: `### HABILIDAD: SOPORTE
- Primero identifica el problema con preguntas clave.
- Sigue el árbol de decisión: Reinicio -> Conexión -> Manual de usuario.
- Si nada sirve, escala con [ESCALATE_HUMAN].`
        }
    ];

    // --- CATEGORÍAS DISPONIBLES ---
    skillCategories = [
        { value: 'general', label: 'General' },
        { value: 'sales', label: 'Ventas' },
        { value: 'support', label: 'Soporte' },
        { value: 'security', label: 'Seguridad' },
        { value: 'booking', label: 'Reservas' },
    ];

    async ngOnInit() {
        await Promise.all([
            this.loadAgents(),
            this.loadSkillsCatalog(),
            this.loadPlatformSettings()
        ]);

        // Fallback al merchant activo si no hay settings globales
        const mId = localStorage.getItem('active_merchant_id') || localStorage.getItem('merchant_id');
        if (mId) {
            const { data } = await this.supabaseService.getMerchantByAnyId(mId);
            if (data) this.merchantSettings = data;
        }

        this.cdr.detectChanges();
    }

    async loadPlatformSettings() {
        const { data } = await this.supabaseService.getPlatformSettings();
        if (data) this.platformSettings = data;
    }

    async loadAgents() {
        const { data } = await this.supabaseService.getAgents();
        if (data) this.agents = data;
        this.cdr.detectChanges();
    }

    async loadSkillsCatalog() {
        const { data, error } = await this.supabaseService.getSkillsCatalog();
        if (error) {
            console.error('Error loading catalog:', error);
            this.notificationService.show('Error al cargar catálogo', 'error');
        }
        if (data) {
            this.skillsCatalog = [...data]; // Forzar nueva referencia para detección de cambios
        }
    }

    // ---- SELECCIÓN Y CARGA DE AGENTE ----

    async selectAgent(agent: any) {
        this.selectedAgent = {
            ...agent,
            description: agent.description || '',
            system_prompt: agent.system_prompt || '',
            restrictions: agent.restrictions || '',
            welcome_message: agent.welcome_message || ''
        };
        this.activeTab = 'general';
        this.showWizard = false;
        this.pendingSkillIds.clear();
        await Promise.all([
            this.loadAgentSkills(),
            this.loadKnowledgeBlocks()
        ]);
    }

    async loadKnowledgeBlocks() {
        if (!this.selectedAgent?.id) return;
        const { data } = await this.supabaseService.getAgentContextBlocks(this.selectedAgent.id);
        this.agentKnowledge = data || [];
    }

    async saveKnowledgeBlock() {
        if (!this.selectedAgent?.id || !this.newBlock.title || !this.newBlock.content) return;

        this.isSaving = true;
        try {
            // Generar embedding opcionalmente si hay API Key o si estamos editando
            let vector = null;
            if (this.effectiveAiApiKey) {
                console.log('🧠 Generando embedding para el bloque...');
                vector = await this.generateEmbedding(this.newBlock.title + ': ' + this.newBlock.content);
            }

            const payload: any = {
                agent_id: this.selectedAgent.id,
                title: this.newBlock.title,
                content: this.newBlock.content,
                embedding: vector
            };

            if (this.editingContextBlockId) {
                payload.id = this.editingContextBlockId;
                // Al editar, el trigger sql handle_updated_at pondrá updated_at automáticamente
            }

            const { error } = await this.supabaseService.saveAgentContextBlock(payload);
            if (error) throw error;

            this.newBlock = { title: '', content: '' };
            this.editingContextBlockId = null;
            await this.loadKnowledgeBlocks();
            this.notificationService.show(vector ? 'Conocimiento procesado de memoria' : 'Conocimiento guardado', 'success');
        } catch (e) {
            console.error('Error saving block:', e);
            this.notificationService.show('Error al guardar bloque', 'error');
        } finally {
            this.isSaving = false;
        }
    }

    editKnowledgeBlock(block: any) {
        this.newBlock = { title: block.title, content: block.content };
        this.editingContextBlockId = block.id;
        // Scroll top para ver el formulario si es necesario
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    cancelEditKnowledgeBlock() {
        this.newBlock = { title: '', content: '' };
        this.editingContextBlockId = null;
    }

    async generateEmbedding(text: string): Promise<number[] | null> {
        const provider = this.platformSettings?.embed_provider || 'google_gemini';
        const model = this.platformSettings?.embed_model || (provider === 'google_gemini' ? 'text-embedding-004' : 'text-embedding-3-small');
        const apiKey = this.platformSettings?.embed_api_key || this.effectiveAiApiKey;
        const ollamaUrl = this.platformSettings?.ollama_base_url || 'http://localhost:11434';

        if (!apiKey && provider !== 'ollama') return null;

        try {
            if (provider === 'google_gemini') {
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${apiKey}`;
                const resp = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content: { parts: [{ text }] } })
                });
                const data = await resp.json();
                return data.embedding.values;
            } else if (provider === 'openai') {
                const url = 'https://api.openai.com/v1/embeddings';
                const resp = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    body: JSON.stringify({ input: text, model: model })
                });
                const data = await resp.json();
                return data.data[0].embedding;
            } else if (provider === 'ollama') {
                const url = `${ollamaUrl}/api/embeddings`;
                const resp = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ model: model, prompt: text })
                });
                const data = await resp.json();
                return data.embedding;
            }
            return null;
        } catch (e) {
            console.error('Embedding Error:', e);
            return null;
        }
    }

    async syncAllEmbeddings() {
        // Solo bloques que no tengan embedding
        const pendingBlocks = this.agentKnowledge.filter(b => !b.embedding);

        if (pendingBlocks.length === 0) {
            this.notificationService.show('Toda la memoria ya está sincronizada ✨', 'info');
            return;
        }

        this.confirmAction({
            title: 'Sincronizar Todo',
            text: `Se generarán vectores para los ${pendingBlocks.length} bloques pendientes. Esto activará la búsqueda semántica profunda para toda la memoria.`,
            icon: '🔄',
            btnText: 'Sincronizar Pendientes',
            action: async () => {
                this.isProcessingFile = true;
                this.notificationService.show('Sincronizando memoria...', 'info');

                try {
                    for (const block of pendingBlocks) {
                        const vector = await this.generateEmbedding(block.title + ': ' + block.content);
                        if (vector) {
                            await this.supabaseService.saveAgentContextBlock({
                                ...block,
                                embedding: vector
                            });
                        }
                    }
                    await this.loadKnowledgeBlocks();
                    this.notificationService.show('Memoria sincronizada con éxito', 'success');
                } catch (e) {
                    this.notificationService.show('Error en la sincronización', 'error');
                } finally {
                    this.isProcessingFile = false;
                }
            }
        });
    }

    async syncBlockEmbedding(block: any) {
        if (block.embedding) return;

        this.notificationService.show(`Vectorizando: ${block.title}...`, 'info');
        try {
            const vector = await this.generateEmbedding(block.title + ': ' + block.content);
            if (vector) {
                const { error } = await this.supabaseService.saveAgentContextBlock({
                    ...block,
                    embedding: vector
                });
                if (error) throw error;

                // Actualización local rápida para feedback visual inmediato
                block.embedding = vector;
                this.notificationService.show('✨ Bloque sincronizado (Online)', 'success');
            } else {
                throw new Error('No se pudo generar el vector. Revisa tu configuración de IA.');
            }
        } catch (e: any) {
            this.notificationService.show(e.message || 'Error al sincronizar bloque', 'error');
        }
    }

    async deleteKnowledgeBlock(id: string) {
        this.confirmAction({
            title: '¿Eliminar bloque?',
            text: 'Esta información se borrará del cerebro del agente y no podrá usarse para responder.',
            icon: '🗑️',
            btnText: 'Sí, eliminar',
            action: async () => {
                const { error } = await this.supabaseService.deleteAgentContextBlock(id);
                if (!error) {
                    await this.loadKnowledgeBlocks();
                    this.notificationService.show('Bloque eliminado', 'warning');
                }
            }
        });
    }

    confirmAction(cfg: { title: string, text: string, icon: string, action: () => void, btnText?: string, cancelText?: string }) {
        this.confirmTitle = cfg.title;
        this.confirmText = cfg.text;
        this.confirmIcon = cfg.icon;
        this.onConfirm = cfg.action;
        this.confirmBtnText = cfg.btnText || 'Confirmar';
        this.cancelBtnText = cfg.cancelText || 'Cancelar';
        this.showConfirmModal = true;
    }

    async handleConfirm() {
        this.isConfirming = true;
        try {
            await this.onConfirm();
        } finally {
            this.isConfirming = false;
            this.showConfirmModal = false;
        }
    }

    // --- SMART INGESTION (PDF/WEB SIMULATION) ---

    async onFileSelected(event: any) {
        const file = event.target.files[0];
        if (!file) return;

        this.isProcessingFile = true;
        this.notificationService.show('Leyendo archivo... Esto puede tomar unos segundos.', 'info');

        try {
            const fileName = file.name.split('.')[0];
            let extractedText = '';

            if (file.type === 'application/pdf') {
                const arrayBuffer = await file.arrayBuffer();
                // Usamos pdfjsLib inyectado en index.html
                const pdf = await (window as any).pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                let maxPages = Math.min(pdf.numPages, 10); // Limitamos por performance a 10 págs por bloque

                for (let i = 1; i <= maxPages; i++) {
                    const page = await pdf.getPage(i);
                    const content = await page.getTextContent();
                    const strings = content.items.map((item: any) => item.str);
                    extractedText += strings.join(' ') + '\n';
                }
            } else {
                // Soporte nativo para TXT, MD, CSV, etc.
                extractedText = await file.text();
            }

            extractedText = extractedText.replace(/\s+/g, ' ').trim();
            if (!extractedText) throw new Error('El archivo parece estar vacío o ser solo imágenes.');

            // Limitar el tamaño para evitar desbordar el token_limit del LLM de Embedding.
            const contentChunk = extractedText.substring(0, 8000);

            // Intentar vectorizar automáticamente
            let vector = null;
            if (this.effectiveAiApiKey) {
                this.notificationService.show('Generando conectividad neuronal (Vectorizando)...', 'info');
                vector = await this.generateEmbedding(fileName + ': ' + contentChunk);
            }

            await this.supabaseService.saveAgentContextBlock({
                agent_id: this.selectedAgent.id,
                title: `📄 ${fileName}`,
                content: contentChunk,
                embedding: vector
            });

            await this.loadKnowledgeBlocks();
            this.notificationService.show(vector ? '¡Archivo leído y vectorizado! ✅' : '¡Archivo guardado (Offline) 🛑', 'success');
        } catch (error: any) {
            console.error('Error al procesar archivo:', error);
            this.notificationService.show('Error: ' + (error.message || 'No se pudo leer el archivo.'), 'error');
        } finally {
            this.isProcessingFile = false;
            // Limpiar el input para permitir subir el mismo archivo si es necesario
            event.target.value = '';
        }
    }

    async loadAgentSkills() {
        if (!this.selectedAgent?.id) return;
        const { data } = await this.supabaseService.getAgentSkills(this.selectedAgent.id);
        this.agentSkills = data || [];
    }

    // ---- SKILL TOGGLE (SISTEMA RELACIONAL) ----

    isSkillEnabled(skillId: string): boolean {
        if (this.selectedAgent?.id) {
            // Agente guardado → usa la tabla agent_skills
            return this.agentSkills.some(s => s.skills_catalog?.id === skillId && s.is_enabled);
        } else {
            // Agente nuevo en wizard → usa el Set de pendientes
            return this.pendingSkillIds.has(skillId);
        }
    }

    async toggleSkill(skill: any) {
        if (this.selectedAgent?.id) {
            // Agente ya guardado → persistir inmediatamente
            this.togglingSkills.add(skill.id);
            try {
                const currentlyEnabled = this.isSkillEnabled(skill.id);
                const { error } = await this.supabaseService.updateAgentSkill(this.selectedAgent.id, skill.id, !currentlyEnabled);
                if (error) throw error;
                await this.loadAgentSkills();
                this.notificationService.show(`${skill.name} ${!currentlyEnabled ? 'activada' : 'desactivada'}`, 'info');
            } catch (err) {
                this.notificationService.show('Error al actualizar habilidad', 'error');
            } finally {
                this.togglingSkills.delete(skill.id);
            }
        } else {
            // Agente nuevo (wizard) → solo marcar como pendiente
            if (this.pendingSkillIds.has(skill.id)) {
                this.pendingSkillIds.delete(skill.id);
            } else {
                this.pendingSkillIds.add(skill.id);
            }
        }
    }

    // ---- GUARDAR AGENTE ----

    async saveAgent() {
        if (!this.selectedAgent?.name?.trim()) {
            this.notificationService.show('El Nombre del Agente es obligatorio.', 'error');
            return;
        }
        if (!this.selectedAgent?.system_prompt?.trim()) {
            this.notificationService.show('El Prompt Maestro es obligatorio.', 'error');
            return;
        }

        this.isSaving = true;
        const isNew = !this.selectedAgent.id;

        try {
            const { data: savedAgent, error } = await this.supabaseService.saveAgent(this.selectedAgent);

            if (error) throw error;

            this.notificationService.show(
                isNew ? '🎉 ¡Agente creado con éxito!' : '✅ Agente actualizado correctamente',
                'success'
            );

            // Si era nuevo, sincronizar las skills pendientes del wizard
            if (isNew && savedAgent?.id && this.pendingSkillIds.size > 0) {
                const skillPromises = Array.from(this.pendingSkillIds).map(skillId =>
                    this.supabaseService.updateAgentSkill(savedAgent.id, skillId, true)
                );
                await Promise.all(skillPromises);
                this.pendingSkillIds.clear();
            }

            // Cerrar wizard si corresponde y recargar lista
            this.showWizard = false;
            await this.loadAgents();

            // Seleccionar el agente recién guardado
            if (savedAgent?.id) {
                await this.selectAgent(savedAgent);
            }

        } catch (err: any) {
            console.error('Error al guardar agente:', err);
            this.notificationService.show('Error al guardar: ' + (err.message || 'Error desconocido'), 'error');
        } finally {
            this.isSaving = false;
        }
    }

    async deleteAgent(agent: any) {
        this.confirmAction({
            title: '¿Eliminar Agente?',
            text: `Estás seguro de eliminar a "${agent.name}". Se perderán todas sus habilidades y configuraciones.`,
            icon: '🤖',
            btnText: 'Eliminar Agente',
            action: async () => {
                const { error } = await this.supabaseService.deleteAgent(agent.id);
                if (!error) {
                    this.notificationService.show('Agente eliminado', 'warning');
                    this.selectedAgent = null;
                    this.agentSkills = [];
                    await this.loadAgents();
                } else {
                    this.notificationService.show('Error al eliminar el agente', 'error');
                }
            }
        });
    }

    // ---- WIZARD ----

    createNewAgent() {
        this.selectedAgent = {
            name: '',
            description: '',
            personality: 'friendly',
            system_prompt: '',
            restrictions: '',
            welcome_message: ''
        };
        this.agentSkills = [];
        this.pendingSkillIds.clear();
        this.showWizard = true;
        this.wizardStep = 1;
    }

    nextStep() {
        if (this.wizardStep === 1 && !this.selectedAgent?.name?.trim()) {
            this.notificationService.show('Ingresa un nombre para continuar.', 'error');
            return;
        }
        if (this.wizardStep === 2 && !this.selectedAgent?.system_prompt?.trim()) {
            this.notificationService.show('Define el Prompt Maestro antes de continuar.', 'info');
            return;
        }
        if (this.wizardStep < 4) this.wizardStep++;
    }

    prevStep() { if (this.wizardStep > 1) this.wizardStep--; }

    // ---- AI COPILOT ----

    // ---- SKILL WIZARD ----

    startSkillWizard() {
        this.editingSkill = {
            name: '',
            slug: '',
            category: 'general',
            description: '',
            system_prompt_fragment: ''
        };
        this.showSkillWizard = true;
        this.skillWizardStep = 1;
    }

    nextSkillStep() {
        if (this.skillWizardStep === 1 && !this.editingSkill.name?.trim()) {
            this.notificationService.show('Ingresa un nombre para la habilidad.', 'error');
            return;
        }
        if (this.skillWizardStep < 3) this.skillWizardStep++;
    }

    prevSkillStep() { if (this.skillWizardStep > 1) this.skillWizardStep--; }

    async generateSkillWithAI() {
        if (!this.effectiveAiApiKey) {
            this.notificationService.show('El Copiloto IA no está configurado. Actívalo con una API Key.', 'error');
            return;
        }
        if (!this.editingSkill.description) {
            this.notificationService.show('Describe la habilidad primero para que el Copiloto sepa qué generar.', 'error');
            return;
        }

        this.isGeneratingAI = true;
        try {
            const prompt = `Actúa como un experto ingeniero de prompts. Tu tarea es diseñar un "Fragmento de Instrucciones Técnicas" (System Prompt Fragment) para una habilidad específica de un agente de IA.

NOMBRE DE LA HABILIDAD: ${this.editingSkill.name}
DESCRIPCIÓN DE LA HABILIDAD: ${this.editingSkill.description}
CATEGORÍA: ${this.editingSkill.category}

REGLAS DE SALIDA:
- Usa encabezados Markdown (###) para organizar la información.
- Sé extremadamente técnico y preciso.
- Define qué variables debe capturar la IA si aplica.
- Establece flujos de decisión internos ("Si el usuario dice X, haz Y").
- NO incluyas introducciones ni explicaciones externas, SOLO el código del prompt.

INICIO DEL FRAGMENTO:`;

            const model = this.effectiveAiModel;
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.effectiveAiApiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
                }
            );

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error?.message || `HTTP ${response.status}`);
            }

            const data = await response.json();
            const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;

            if (generatedText) {
                this.editingSkill.system_prompt_fragment = generatedText.trim();
                this.notificationService.show('🪄 ¡Habilidad diseñada por la IA!', 'success');
                this.showSkillPreview = true;
            } else {
                throw new Error('La IA no devolvió contenido válido');
            }
        } catch (e: any) {
            console.error('Error AI Copilot:', e);
            this.notificationService.show('Error con el Copiloto IA: ' + (e.message || 'Error de conexión'), 'error');
        } finally {
            this.isGeneratingAI = false;
        }
    }

    // --- SIMULADOR DE SKILL INDIVIDUAL ---

    toggleSimulation() {
        this.isSimulating = !this.isSimulating;
        if (this.isSimulating) {
            this.simMessages = [
                { role: 'assistant', text: `¡Hola! Soy un entorno de pruebas para la habilidad "${this.editingSkill.name}". ¿Qué quieres probar?` }
            ];
        }
    }

    async sendSimMessage() {
        if (!this.simUserInput.trim() || this.isGeneratingAI) return;
        if (!this.effectiveAiApiKey) {
            this.notificationService.show('Configura la API Key para simular.', 'error');
            return;
        }

        const userText = this.simUserInput.trim();
        this.simMessages.push({ role: 'user', text: userText });
        this.simUserInput = '';

        this.isGeneratingAI = true;
        try {
            const systemContext = `### ENTORNO DE PRUEBAS DE SKILL INDIVIDUAL
ESTÁS PROBANDO ÚNICAMENTE LA SIGUIENTE HABILIDAD:
${this.editingSkill.system_prompt_fragment}

INSTRUCCIONES:
1. Actúa como si fueras un experto en esta habilidad.
2. Si la habilidad define comandos [JSON], úsalos para demostrar que funciona.
3. Mantén las respuestas técnicas y precisas.`;

            const model = this.effectiveAiModel;
            let contents: any[] = [];
            this.simMessages.forEach(msg => {
                contents.push({ role: msg.role === 'user' ? 'user' : 'model', parts: [{ text: msg.text }] });
            });

            // Regla de oro: empezar con 'user' para Gemini
            if (contents.length > 0 && contents[0].role === 'model') contents.shift();

            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.effectiveAiApiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        system_instruction: { parts: [{ text: systemContext }] },
                        contents: contents,
                        generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
                    })
                }
            );

            const data = await response.json();
            if (data.error) throw new Error(data.error.message);

            const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text;

            if (aiText) {
                this.simMessages.push({ role: 'assistant', text: aiText });
            } else {
                throw new Error('Sin respuesta del modelo');
            }
        } catch (e: any) {
            console.error('Error Sim:', e);
            this.simMessages.push({ role: 'assistant', text: `❌ Error: ${e.message || 'Error de conexión'}` });
        } finally {
            this.isGeneratingAI = false;
        }
    }

    // --- SIMULADOR DE AGENTE COMPLETO ---

    toggleAgentSimulation() {
        if (!this.selectedAgent) return;

        // Preparar el contexto completo del agente para el simulador pro
        const skillsSnippet = this.agentSkills
            .filter(s => s.is_enabled)
            .map(s => `### SKILL: ${s.skills_catalog?.name}\n${s.skills_catalog?.system_prompt_fragment}`)
            .join('\n\n');

        const knowledgeSnippet = this.agentKnowledge
            .map(kb => `• ${kb.title}: ${kb.content}`)
            .join('\n');

        this.agentFullContext = `
AGENTE: ${this.selectedAgent.name}
PERSONALIDAD: ${this.selectedAgent.personality}

INSTRUCCIONES MAESTRAS:
${this.selectedAgent.system_prompt}

RESTRICCIONES:
${this.selectedAgent.restrictions || 'Sin restricciones adicionales.'}

HABILIDADES ACTIVAS:
${skillsSnippet || 'Sin habilidades adicionales.'}

### MEMORIA Y CONOCIMIENTO (CONTEXTO):
${knowledgeSnippet || 'Sin conocimiento extra cargado.'}
        `.trim();

        this.simulatedMerchant.name = this.selectedAgent.name;
        this.showAgentSimulator = !this.showAgentSimulator;
    }

    async sendAgentSimMessage() {
        // Redirigido al componente unificado
    }

    useAIGeneratedSkill() {
        this.showSkillPreview = false;
        this.notificationService.show('Fragmento aplicado.', 'info');
        if (this.showSkillWizard) this.skillWizardStep = 3;
    }

    // Metodo duplicado eliminado

    // ---- DISEÑADOR DE SKILLS ----

    useExample(ex: any) {
        this.editingSkill = {
            name: ex.name,
            slug: ex.slug,
            category: ex.category,
            description: ex.description,
            system_prompt_fragment: ex.prompt
        };
    }

    newSkill() {
        this.editingSkill = { name: '', slug: '', category: 'general', description: '', system_prompt_fragment: '' };
    }

    async saveSkill() {
        if (!this.editingSkill.name?.trim() || !this.editingSkill.slug?.trim()) {
            this.notificationService.show('El Nombre y el Slug son obligatorios.', 'error');
            return;
        }
        if (!this.editingSkill.system_prompt_fragment?.trim()) {
            this.notificationService.show('Las instrucciones técnicas (Prompt Fragment) son obligatorias.', 'error');
            return;
        }

        const { error } = await this.supabaseService.saveSkillToCatalog(this.editingSkill);
        if (!error) {
            this.notificationService.show('✅ Habilidad guardada en el catálogo maestro', 'success');
            this.newSkill();
            await this.loadSkillsCatalog();
        } else {
            this.notificationService.show('Error al guardar la habilidad', 'error');
        }
    }

    editCatalogSkill(skill: any) {
        this.editingSkill = { ...skill };
        this.activeTab = 'designer';
    }

    async deleteSkill(id: string) {
        if (!confirm('¿Eliminar esta habilidad del catálogo maestro? Esto la quitará de todos los agentes que la tengan asignada.')) return;
        const { error } = await this.supabaseService.deleteSkillFromCatalog(id);
        if (!error) {
            this.notificationService.show('Habilidad eliminada', 'warning');
            await this.loadSkillsCatalog();
        } else {
            this.notificationService.show('Error al eliminar la habilidad', 'error');
        }
    }

    async assignSkillToCurrentAgent(skill: any) {
        if (!this.selectedAgent?.id) {
            this.notificationService.show('Primero selecciona un agente para asignarle esta habilidad.', 'error');
            return;
        }
        await this.supabaseService.updateAgentSkill(this.selectedAgent.id, skill.id, true);
        await this.loadAgentSkills();
        this.notificationService.show(`"${skill.name}" asignada al agente.`, 'success');
    }

    // ---- PREVIEW DEL PROMPT COMPILADO ----

    /**
     * Ensambla el prompt completo exactamente como lo haría get_compiled_prompt() en Supabase:
     * A. Identidad (personalidad + bienvenida)
     * B. Fragmentos de skills habilitadas (en orden de categoría)
     * C. System Prompt del agente
     * D. Restricciones
     */
    get compiledPromptPreview(): string {
        if (!this.selectedAgent) return '';

        const agent = this.selectedAgent;
        const sections: string[] = [];

        // ── A. BLOQUE DE IDENTIDAD ────────────────────────────────────────────
        sections.push(
            `╔══════════════════════════════════════════════╗
║  BLOQUE A — IDENTIDAD DEL AGENTE             ║
╚══════════════════════════════════════════════╝
### TU ROL: Asistente de {{merchantName}}.
- Personalidad: ${agent.personality || '(sin personalidad definida)'}.
- Saludo inicial: ${agent.welcome_message || '(sin saludo definido).'}`
        );

        // ── B. HABILIDADES ACTIVAS ────────────────────────────────────────────
        const enabledSkills = this.agentSkills
            .filter(s => s.is_enabled)
            .map(s => s.skills_catalog)
            .filter(Boolean);

        if (enabledSkills.length > 0) {
            sections.push(
                `╔══════════════════════════════════════════════╗
║  BLOQUE B — SKILLS HABILITADAS (${enabledSkills.length})          ║
╚══════════════════════════════════════════════╝`);

            enabledSkills.forEach((skill: any, i: number) => {
                sections.push(
                    `── Skill ${i + 1}: ${skill.name} [${skill.category}] ────────────────
${skill.system_prompt_fragment || '(sin fragmento de prompt)'}
${skill.slug === 'inventory_sales' ? '\n→ [CATÁLOGO INYECTADO AQUÍ: listado de productos del comercio]' : ''}
${skill.slug === 'knowledge_base' ? '\n→ [CONOCIMIENTO EXTRA INYECTADO AQUÍ: bloques de contexto del agente y del comercio]' : ''}`);
            });
        } else {
            sections.push(
                `╔══════════════════════════════════════════════╗
║  BLOQUE B — SKILLS HABILITADAS (0)           ║
╚══════════════════════════════════════════════╝
(Sin habilidades activas. Ve a la pestaña Habilidades para activarlas.)`);
        }

        // ── C. SYSTEM PROMPT DEL AGENTE ───────────────────────────────────────
        sections.push(
            `╔══════════════════════════════════════════════╗
║  BLOQUE C — PROMPT MAESTRO DEL AGENTE        ║
╚══════════════════════════════════════════════╝
${agent.system_prompt?.trim() || '(sin prompt maestro definido)'}`);

        // ── D. RESTRICCIONES ──────────────────────────────────────────────────
        if (agent.restrictions?.trim()) {
            sections.push(
                `╔══════════════════════════════════════════════╗
║  BLOQUE D — RESTRICCIONES GLOBALES           ║
╚══════════════════════════════════════════════╝
${agent.restrictions.trim()}`);
        }

        // ── E. PERSONALIZACIÓN DEL COMERCIO ──────────────────────────────────
        sections.push(
            `╔══════════════════════════════════════════════╗
║  BLOQUE E — PERSONALIZACIÓN (merchant)       ║
╚══════════════════════════════════════════════╝
→ [Aquí se inyecta ai_system_prompt del comercio al elegir este agente]`);

        return sections.join('\n\n');
    }

    get compiledPromptTokenEstimate(): number {
        // Estimación aproximada: ~4 chars por token
        return Math.round(this.compiledPromptPreview.length / 4);
    }

    async copyPromptToClipboard() {
        try {
            await navigator.clipboard.writeText(this.compiledPromptPreview);
            this.notificationService.show('📋 Prompt copiado al portapapeles', 'success');
        } catch {
            this.notificationService.show('No se pudo copiar al portapapeles', 'error');
        }
    }

    get highlightedPrompt(): SafeHtml {
        let text = this.compiledPromptPreview;
        if (!text) return '';

        // Escapar HTML básico
        text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        // Colorear bloques por sus cabeceras ╔═══...
        text = text.replace(/(╔═+╗\n║  BLOQUE A.*?╚═+╝)/gs, '<span class="block-a-text">$1</span>');
        text = text.replace(/(╔═+╗\n║  BLOQUE B.*?╚═+╝)/gs, '<span class="block-b-text">$1</span>');
        text = text.replace(/(╔═+╗\n║  BLOQUE C.*?╚═+╝)/gs, '<span class="block-c-text">$1</span>');
        text = text.replace(/(╔═+╗\n║  BLOQUE D.*?╚═+╝)/gs, '<span class="block-d-text">$1</span>');
        text = text.replace(/(╔═+╗\n║  BLOQUE E.*?╚═+╝)/gs, '<span class="block-e-text">$1</span>');

        return this.sanitizer.bypassSecurityTrustHtml(text);
    }

    // ---- HELPERS ----

    fillAgentExample(type: string) {
        if (!this.selectedAgent) return;
        if (type === 'welcome') {
            this.selectedAgent.welcome_message = `¡Hola! 🌟 Soy tu asistente oficial en {{merchantName}}. ¿En qué puedo ayudarte hoy? Puedo recomendarte nuestras especialidades o ayudarte a armar tu pedido ideal. 😊`;
        } else if (type === 'prompt') {
            this.selectedAgent.system_prompt = `Eres el asistente oficial de {{merchantName}}. Tu personalidad es {{personality}}.

### REGLAS GENERALES:
- Saluda siempre con: {{welcomeMessage}}
- Consulta el catálogo: {{catalogContext}}
- Si hay preguntas de conocimiento: {{knowledgeContext}}
- Responde siempre en el idioma del cliente.`;
        } else if (type === 'restrictions') {
            this.selectedAgent.restrictions = `NUNCA des precios distintos a los del catálogo oficial.
NUNCA inventes información que no esté en tu entrenamiento.
PROHIBIDO hablar de política, religión u otros temas fuera del negocio.
NUNCA compartas datos personales de otros clientes.`;
        }
    }

    // Helper para generar slug automático desde nombre
    generateSlug() {
        if (this.editingSkill.name && !this.editingSkill.id) {
            this.editingSkill.slug = this.editingSkill.name
                .toLowerCase()
                .replace(/\s+/g, '_')
                .replace(/[^a-z0-9_]/g, '');
        }
    }

    getCategoryLabel(val: string): string {
        return this.skillCategories.find(c => c.value === val)?.label || val;
    }

    getCategoryIcon(category: string): string {
        const icons: Record<string, string> = {
            sales: '💰', support: '🛠️', security: '🛡️',
            booking: '📅', general: '⚙️'
        };
        return icons[category] || '⚙️';
    }
}
