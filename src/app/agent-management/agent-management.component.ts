import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { SupabaseService } from '../supabase.service';
import { NotificationService } from '../notification.service';

@Component({
    selector: 'app-agent-management',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './agent-management.component.html',
    styleUrl: './agent-management.component.css'
})
export class AgentManagementComponent implements OnInit {
    private supabaseService = inject(SupabaseService);
    private notificationService = inject(NotificationService);
    private sanitizer = inject(DomSanitizer);

    activeTab: 'general' | 'skills' | 'designer' = 'general';
    showWizard: boolean = false;
    showSkillWizard: boolean = false;
    showPromptPreview: boolean = false;
    showSkillPreview: boolean = false; // Preview del fragmento generado por IA
    wizardStep: number = 1;
    skillWizardStep: number = 1;
    isGeneratingAI: boolean = false;
    isSaving: boolean = false;
    platformSettings: any = null;

    agents: any[] = [];
    skillsCatalog: any[] = [];
    selectedAgent: any = null;
    agentSkills: any[] = []; // Lista de agent_skills CON join a skills_catalog

    // Skills pendientes de asignar cuando el agente aún no existe en DB (wizard)
    pendingSkillIds: Set<string> = new Set();
    togglingSkills: Set<string> = new Set(); // ID de skills siendo procesadas para feedback visual

    // Designer state
    editingSkill: any = {
        name: '',
        slug: '',
        category: 'general',
        description: '',
        system_prompt_fragment: ''
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
    }

    async loadPlatformSettings() {
        const { data } = await this.supabaseService.getPlatformSettings();
        if (data) this.platformSettings = data;
    }

    async loadAgents() {
        const { data } = await this.supabaseService.getAgents();
        if (data) this.agents = data;
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
        await this.loadAgentSkills();
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
        if (!confirm(`¿Estás seguro de eliminar el agente "${agent.name}"? Esta acción no se puede deshacer.`)) return;

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
        if (!this.platformSettings?.ai_api_key) {
            this.notificationService.show('El Copiloto IA no está configurado. Actívalo desde el Super Admin.', 'error');
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

            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${this.platformSettings.ai_model || 'gemini-1.5-flash'}:generateContent?key=${this.platformSettings.ai_api_key}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
                }
            );
            const data = await response.json();
            const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;

            if (generatedText) {
                this.editingSkill.system_prompt_fragment = generatedText;
                this.notificationService.show('🪄 ¡Habilidad diseñada por la IA!', 'success');
                this.showSkillPreview = true;
            } else {
                throw new Error('La IA no devolvió contenido');
            }
        } catch (e: any) {
            console.error('Error AI Copilot:', e);
            this.notificationService.show('Error con el Copiloto IA: ' + (e.message || 'Error desconocido'), 'error');
        } finally {
            this.isGeneratingAI = false;
        }
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
