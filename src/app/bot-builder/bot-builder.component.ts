import { Component, OnInit, ElementRef, ViewChild, inject, HostListener, ChangeDetectorRef, NgZone, signal, ApplicationRef, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../supabase.service';
import { NotificationService } from '../notification.service';
import { FlowNode, FlowConnection, FlowData, BotFlow } from './models/bot-flow.model';
import { BotRuntimeService } from './services/bot-runtime.service';
import { ChatSimulatorComponent } from '../chat-simulator/chat-simulator.component';

@Component({
  selector: 'app-bot-builder',
  standalone: true,
  imports: [CommonModule, FormsModule, ChatSimulatorComponent],
  templateUrl: './bot-builder.component.html',
  styleUrl: './bot-builder.component.css'
})
export class BotBuilderComponent implements OnInit {
  private supabase = inject(SupabaseService);
  private notification = inject(NotificationService);
  private botRuntime = inject(BotRuntimeService);
  private cdr = inject(ChangeDetectorRef);
  private zone = inject(NgZone);
  private appRef = inject(ApplicationRef);

  @ViewChild('canvas') canvasRef!: ElementRef<SVGSVGElement>;
  @ViewChild('chatScroll') chatScrollRef!: ElementRef<HTMLDivElement>;

  // --- STATE ---
  merchantId: string = '';
  merchantName: string = 'Cargando...';
  botFlow: BotFlow = {
    merchant_id: '',
    name: 'Flujo de Ventas',
    is_active: false,
    trigger_type: 'always',
    flow_data: { nodes: [], connections: [] }
  };

  selectedNode: FlowNode | null = null;
  editingNode: FlowNode | null = null;
  activeNodeTab: 'general' | 'instructions' | 'memory' | 'tools' = 'general';

  // Knowledge Base State for Skill Configuration
  knowledgeDocuments: any[] = [];
  showKnowledgeModal = false;
  selectedKnowledgeDoc: any = null;
  knowledgeChunks: any[] = [];
  isLoadingKnowledge = false;
  panelVisible = false;
  
  // Dragging state
  draggedNode: FlowNode | null = null;
  dragOffset = { x: 0, y: 0 };
  
  // Connection state
  isConnecting = false;
  connectionStart: { node: FlowNode, port: string } | null = null;
  mousePos = { x: 0, y: 0 };

  // Canvas View state
  viewTransform = { x: 0, y: 0, scale: 1 };
  isPanning = false;
  panStart = { x: 0, y: 0 };

  // Confirmation Modal state for global actions
  showConfirmModal = false;
  modalConfig = {
    title: '',
    message: '',
    icon: '✨',
    confirmLabel: 'Confirmar',
    action: () => {},
    isProcessing: false
  };

  // Template Modal state
  showTemplateModal = false;
  templateToConfirm: string | null = null;
  templates: any[] = [];
  skillsCatalog: any[] = [];
  isSuperAdmin = false;

  // Palette definition
  paletteCategories = [
    {
      name: 'Básicos',
      items: [
        { type: 'start', label: 'Inicio', icon: '🟢', description: 'Inicio del flujo' },
        { type: 'message', label: 'Mensaje', icon: '💬', description: 'Enviar texto' },
        { type: 'question', label: 'Pregunta', icon: '❓', description: 'Capturar respuesta' },
        { type: 'menu', label: 'Menú', icon: '📋', description: 'Opciones múltiples' },
        { type: 'end', label: 'Fin', icon: '🛑', description: 'Terminar flujo' }
      ]
    },
    {
      name: 'Contexto y Memoria',
      items: [
        { type: 'memory_extract', label: 'Extraer Memoria', icon: '💾', description: 'Extraer con IA' },
        { type: 'db_query', label: 'Consulta BD', icon: '📊', description: 'Consultar Supabase' },
        { type: 'set_variable', label: 'Setear Variable', icon: '📝', description: 'Setear variable local' }
      ]
    },
    {
      name: 'Lógica',
      items: [
        { type: 'condition', label: 'Condición', icon: '🔀', description: 'Divide flujo según variables' },
        { type: 'switch', label: 'Switch / Router', icon: '🔌', description: 'Múltiples salidas por valor' },
        { type: 'delay', label: 'Esperar / Delay', icon: '⏳', description: 'Pausar flujo temporalmente' },
        { type: 'business_hours', label: 'Horario Comercial', icon: '📅', description: 'Branch por hora actual' },
        { type: 'action', label: 'Acción', icon: '⚡', description: 'Ejecutar tarea nativa' }
      ]
    },
    {
      name: 'Inteligencia Artificial',
      items: [
        { type: 'ai_agent', label: 'Agente IA', icon: '🧠', description: 'IA Conversacional' },
        { type: 'ai_skill', label: 'AI Skill', icon: '🛠️', description: 'Tool para Agente IA' },
        { type: 'semantic_router', label: 'Router Semántico', icon: '🛣️', description: 'Clasificar intención con IA' },
        { type: 'image_generator', label: 'Imagen IA', icon: '🎨', description: 'Generar imagen con DALL-E' },
        { type: 'knowledge_query', label: 'Consulta RAG', icon: '📚', description: 'Consultar base de conocimiento' }
      ]
    },
    {
      name: 'Integraciones',
      items: [
        { type: 'n8n', label: 'n8n Webhook', icon: '⚙️', description: 'Disparar automatización N8n' },
        { type: 'mcp', label: 'Tool MCP', icon: '🧩', description: 'Ejecutar herramienta MCP' },
        { type: 'api', label: 'HTTP Request', icon: '🌐', description: 'Hacer petición a API REST' }
      ]
    },
    {
      name: 'Comunicación',
      items: [
        { type: 'send_email', label: 'Enviar Email', icon: '📧', description: 'Enviar correo electrónico' },
        { type: 'transfer_operator', label: 'Transferir Humano', icon: '👤', description: 'Pasar a un operador' },
        { type: 'wa_template', label: 'WhatsApp Template', icon: '💬', description: 'Enviar HSM oficial' }
      ]
    },
    {
      name: 'Ventas y E-commerce',
      items: [
        { type: 'catalog_search', label: 'Catálogo', icon: '🛒', description: 'Buscar productos' },
        { type: 'cart_summary', label: 'Carrito', icon: '🛍️', description: 'Resumen de compra' },
        { type: 'order_checkout', label: 'Pagar / Pedido', icon: '🏁', description: 'Registrar transacción' }
      ]
    }
  ];

  get paletteItems() {
    return this.paletteCategories.reduce((acc, cat) => acc.concat(cat.items), [] as any[]);
  }

  // Chat Simulator State
  showTestChat: boolean = false;
  activeSidebarTab: 'simulator' | 'architect' = 'simulator';
  executionCounts: { [nodeId: string]: number } = {};
  currentlyExecuting: string | null = null;
  chatMessages: { text: string, sender: 'bot' | 'user', meta?: { tokens: number, time: number } }[] = [];
  userChatInput: string = '';
  simulationState: { currentNodeId: string | null, variables: any } = { currentNodeId: null, variables: {} };
  activeSimNodeId: string | null = null; // Nodo resaltado en el canvas durante simulación
  activeToolNodeId: string | null = null; // Skill resaltada en verde cuando se usa
  isBotTyping: boolean = false; // Estado para animación de escribiendo
  sidebarWidth: number = 320; // Ancho predeterminado
  isResizing: boolean = false;

  // --- EXECUTION TRACKING (n8n-style) ---
  nodeExecutionCounts: Map<string, number> = new Map();   // Contador de ejecuciones por nodo en la sesión
  lastExecutedNodeId: string | null = null;               // Último nodo ejecutado (para animar conexión)
  justExecutedNodeId: string | null = null;               // Nodo que acaba de ejecutarse (para badge de ✓ temporal)
  activeConnectionSourceId: string | null = null;         // Nodo source de la conexión activa animada
  sessionExecutionLog: { nodeId: string; nodeLabel: string; nodeType: string; timestamp: Date; totalCount: number }[] = [];
  totalSessionExecutions: number = 0;                     // Total de ejecuciones en la sesión


  // Save Template state
  showSaveTemplateModal = false;
  newTemplate = {
    name: '',
    description: '',
    icon: 'fa-solid fa-robot',
    category: 'general'
  };

  iconOptions = [
    'fa-solid fa-robot', 'fa-solid fa-brain', 'fa-solid fa-rocket', 'fa-solid fa-stars',
    'fa-solid fa-burger', 'fa-solid fa-utensils', 'fa-solid fa-coffee', 'fa-solid fa-pizza-slice',
    'fa-solid fa-calendar-check', 'fa-solid fa-user-tie', 'fa-solid fa-stethoscope', 'fa-solid fa-spa',
    'fa-solid fa-cart-shopping', 'fa-solid fa-bag-shopping', 'fa-solid fa-tag', 'fa-solid fa-store',
    'fa-solid fa-house', 'fa-solid fa-car', 'fa-solid fa-plane', 'fa-solid fa-heart'
  ];

  // Cache para herramientas para evitar lentitud
  private catalogCache: any[] | null = null;
  private categoryCache: any[] | null = null;
  
  // Sidebar State (Simulator vs Architect)

  architectMessages: { text: string, sender: 'bot' | 'user', suggestion?: any }[] = [
    { text: '👋 ¡Hola! Soy tu Arquitecto IA. Puedo ayudarte a diseñar el flujo perfecto, conectar nodos o sugerir mejoras. ¿En qué trabajamos hoy?', sender: 'bot' }
  ];
  architectInput: string = '';
  isArchitectTyping: boolean = false;

  // Connection delete state
  hoveredConnectionId: string | null = null;


  constructor() {}


  async ngOnInit() {
    this.merchantId = localStorage.getItem('active_merchant_id') || '';
    this.isSuperAdmin = localStorage.getItem('user_role') === 'superadmin';
    
    if (this.merchantId) {
      // Cargar info del comercio primero para que no salga "Cargando..."
      const { data: m } = await this.supabase.getMerchantById(this.merchantId);
      if (m) {
        this.merchantName = m.name;
        this.botFlow.name = `Flujo de ${m.name}`;
        this.cdr.detectChanges(); // Asegurar que el nombre se actualice en la UI
      }
      await this.loadFlow();
    }
    await this.loadTemplates();
    await this.loadSkillsCatalog();
    await this.loadKnowledgeDocuments();
  }

  async loadSkillsCatalog() {
    const { data } = await this.supabase.getSkillsCatalog();
    if (data) this.skillsCatalog = data;
  }

  async sendArchitectMessage() {
    if (!this.architectInput.trim() || this.isArchitectTyping) return;
    
    const userMsg = this.architectInput.trim();
    this.architectMessages.push({ text: userMsg, sender: 'user' });
    this.architectInput = '';
    this.isArchitectTyping = true;
    this.cdr.detectChanges();
    this.scrollToArchitectBottom();

    try {
      const response = await this.runGeminiArchitectSim(userMsg);
      this.isArchitectTyping = false;
      
      // Manejar sugerencias de cambio de flujo (si existen en el mensaje)
      let displayMsg = response.text;
      let suggestion: any = null;

      if (displayMsg.includes('```json')) {
        const jsonMatch = displayMsg.match(/```json([\s\S]*?)```/);
        if (jsonMatch) {
          try {
            suggestion = JSON.parse(jsonMatch[1]);
            // Limpiar el mensaje para no mostrar el JSON crudo si queremos algo más elegante
            displayMsg = displayMsg.replace(/```json[\s\S]*?```/, '\n\n✨ **Sugerencia de diseño lista para aplicar.**');
          } catch (e) { console.error('Error parsing AI suggestion'); }
        }
      }

      this.architectMessages.push({ 
        text: displayMsg, 
        sender: 'bot',
        suggestion: suggestion // Nuevo campo para guardar el JSON sugerido
      });

      this.cdr.detectChanges();
      this.scrollToArchitectBottom();
    } catch (err: any) {
      this.isArchitectTyping = false;
      this.architectMessages.push({ text: '⚠️ Hubo un error procesando tu solicitud: ' + err.message, sender: 'bot' });
    }
  }

  applyArchitectSuggestion(suggestion: any) {
    if (!suggestion) return;
    
    // Backup del flujo actual por si acaso
    const backup = JSON.stringify(this.botFlow.flow_data);
    
    try {
      this.botFlow.flow_data = JSON.parse(JSON.stringify(suggestion));
      this.showSuccess('Diseño aplicado correctamente');
      this.saveFlow();
    } catch (e) {
      this.botFlow.flow_data = JSON.parse(backup);
      this.showError('Error al aplicar el diseño: ' + e);
    }
    this.cdr.detectChanges();
  }


  async loadTemplates() {
    const { data: dbTemplates } = await this.supabase.getBotFlowTemplates();
    
    // Catálogo de Plantillas Inteligentes (6 plantillas)
    const baseTemplates = [
      // GRUPO: Comercio / Ventas
      {
        id: 'store_bot',
        name: 'Tienda Bot',
        description: 'Bot estructurado que lee tus categorías y productos reales para generar menús de navegación, carrito y checkout automáticamente.',
        icon: '🛍️',
        category: 'commerce'
      },
      {
        id: 'store_ai',
        name: 'Tienda con IA',
        description: 'Vendedor autónomo con IA que busca en catálogo, añade al carrito y cierra pedidos sin intervención humana.',
        icon: '🧠',
        category: 'commerce'
      },
      // GRUPO: Reservas / Citas
      {
        id: 'booking_bot',
        name: 'Reservas Bot',
        description: 'Bot estructurado que lee tus servicios y guía al usuario por etapas: especialista → disponibilidad → datos de contacto → confirmación en CRM.',
        icon: '📅',
        category: 'booking'
      },
      {
        id: 'booking_ai',
        name: 'Reservas con IA',
        description: 'Agente IA que consulta disponibilidad en lenguaje natural y registra automáticamente al cliente en tu agenda con su nombre y teléfono.',
        icon: '🧠',
        category: 'booking'
      },
      // GRUPO: Herramientas
      {
        id: 'rag_expert',
        name: 'Consultoría RAG',
        description: 'La IA responde basándose en tus documentos subidos. Ideal para FAQs técnicas y soporte especializado.',
        icon: '📚',
        category: 'tools'
      },
      {
        id: 'n8n_sync',
        name: 'Sincronización n8n',
        description: 'Envía datos del cliente a n8n para CRM externo, Google Sheets, bases de datos propias o cualquier automatización.',
        icon: '🔌',
        category: 'tools'
      }
    ];

    this.templates = [...baseTemplates, ...(dbTemplates || [])];
  }

  // --- LOADING / SAVING ---
  async loadFlow() {
    // Info del merchant ya cargada en ngOnInit o recargamos si es necesario
    if (this.merchantName === 'Cargando...') {
      const { data: m } = await this.supabase.getMerchantById(this.merchantId);
      if (m) this.merchantName = m.name;
    }

    const { data, error } = await this.supabase.getBotFlows(this.merchantId);
    if (data && data.length > 0) {
      this.botFlow = data[0];
      // Asegurar que existan nodos y conexiones
      if (!this.botFlow.flow_data.nodes) this.botFlow.flow_data.nodes = [];
      if (!this.botFlow.flow_data.connections) this.botFlow.flow_data.connections = [];
    } else {
      // Crear uno por defecto
      this.botFlow.merchant_id = this.merchantId;
      this.botFlow.name = 'Flujo de Bienvenida';
      this.addNode('start', 100, 250);
    }
  }

  openTemplateModal() {
    this.templateToConfirm = null;
    this.showTemplateModal = true;
  }

  selectTemplate(id: string) {
    const nodeCount = this.botFlow.flow_data.nodes?.length || 0;
    if (nodeCount > 0) {
      this.templateToConfirm = id;
    } else {
      this.showTemplateModal = false;
      this.executeAutoGenerate(id);
    }
  }

  executeTemplate() {
    if (this.templateToConfirm) {
      const id = this.templateToConfirm;
      this.showTemplateModal = false;
      this.templateToConfirm = null;
      this.executeAutoGenerate(id);
    }
  }

  private async executeAutoGenerate(templateId: string) {
    console.log('✅ executeAutoGenerate STARTED for:', templateId);
    
    await this.zone.run(async () => {
      this.showConfirmModal = false;
      this.selectedNode = null;
      this.cdr.detectChanges();

      try {
        // Mapa de IDs → generadores
        const generatorMap: Record<string, () => Promise<void>> = {
          // IDs nuevos (Tienda / Comercio)
          'store_bot':    () => this.generateProductFlow(),
          'store_ai':     () => this.generateIACatalogFlow(),
          // IDs nuevos (Reservas)
          'booking_bot':  () => this.generateServiceFlow(),
          'booking_ai':   () => this.generateRAGFlow(),
          // IDs nuevos (Herramientas)
          'rag_expert':   () => this.generateRAGFlow(),
          'n8n_sync':     () => this.generateRAGFlow(),
          // IDs legacy (compatibilidad hacia atrás)
          'products':     () => this.generateProductFlow(),
          'services':     () => this.generateServiceFlow(),
          'ia_catalog':   () => this.generateIACatalogFlow(),
        };

        const generator = generatorMap[templateId];
        if (generator) {
          this.botFlow.flow_data = { nodes: [], connections: [] };
          await generator();
        } else {
          // Cargar desde DB (plantillas guardadas por el usuario)
          const template = this.templates.find(t => t.id === templateId);
          if (template && template.flow_data) {
            this.botFlow.flow_data = JSON.parse(JSON.stringify(template.flow_data));
            console.log('✨ Template loaded from DB:', template.name);
          }
        }
        
        this.notification.show('✨ Plantilla cargada con éxito', 'success');
        this.cdr.detectChanges();
      } catch (error) {
        console.error('Error loading template:', error);
        this.notification.show('Error al cargar la plantilla', 'error');
      }
    });
  }

  async loadKnowledgeDocuments() {
    if (!this.merchantId) return;
    try {
      const { data } = await this.supabase.getKnowledgeBaseDocuments(this.merchantId);
      this.knowledgeDocuments = data || [];
    } catch (e) {
      console.error('Error loading knowledge for builder:', e);
    }
  }

  async previewKnowledge(doc: any) {
    this.selectedKnowledgeDoc = doc;
    this.knowledgeChunks = [];
    this.isLoadingKnowledge = true;
    this.showKnowledgeModal = true;
    this.cdr.detectChanges();

    try {
      const { data } = await this.supabase.getKnowledgeBaseChunks(doc.id);
      this.knowledgeChunks = data || [];
    } catch (e) {
      console.error('Error loading chunks for preview:', e);
    } finally {
      this.isLoadingKnowledge = false;
      this.cdr.detectChanges();
    }
  }

  private async generateRAGFlow() {
    let x = 600;
    let y = 100;

    // 1. Inicio
    const startNode = this.createSpecificNode('start', x, y, { 
      label: 'Bienvenida RAG', 
      message: '¡Hola! Soy el asistente inteligente de consulta de {{merchantName}}. 👋\nPuedo responder a cualquier duda sobre nuestros servicios, horarios y políticas basándome en nuestra documentación oficial. ¿Qué deseas consultar?' 
    });
    y += 180;

    // 2. Agente IA (Foco en RAG)
    const aiAgentNode = this.createSpecificNode('ai_agent', x, y, { 
      label: 'Consultor Experto IA', 
      prompt: `Eres un consultor experto de {{merchantName}} con acceso total a la documentación interna.
      
Tu MISIÓN es responder dudas de los clientes basándote ÚNICAMENTE en la información de la documentación oficial.

REGLAS:
1. **Prioridad Documentación**: Usa SIEMPRE la herramienta 'knowledge_base' antes de responder a una pregunta técnica o de política.
2. **Transferencia**: Si el cliente está frustrado o pide hablar con una persona, usa 'transfer_human'.
3. **Veracidad**: Si la información no está en los documentos, sé honesto y di que no tienes esa información específica, ofreciendo ayuda humana.
4. **Tono**: Profesional, amable y extremadamente útil.`,
      user_prompt: '{{message}}',
      model: 'gemini-1.5-flash',
      temperature: 0.2, // Baja temperatura para mayor fidelidad a los documentos
      memory_limit: 8
    });
    this.connectNodes(startNode.id, 'output', aiAgentNode.id, 'input');

    // 3. Herramienta RAG (Knowledge Base)
    const ragSkill = this.createSpecificNode('ai_skill', x - 200, y + 250, { 
      label: '📚 Base de Conocimiento', 
      actionType: 'knowledge_base',
      message: 'Permite buscar respuestas precisas en los documentos subidos (PDF/Texto) de la empresa.'
    });

    // 4. Herramienta Transferencia Humana
    const humanSkill = this.createSpecificNode('ai_skill', x + 200, y + 250, { 
      label: '👤 Soporte Humano', 
      actionType: 'transfer_human',
      message: 'Transfiere al cliente con un agente real cuando la IA no tenga la respuesta o se solicite.'
    });

    // 5. Nodo de fin
    const endNode = this.createSpecificNode('end', x, y + 500, {
      label: 'Despedida',
      message: 'Espero haber resuelto tus dudas. ¡Gracias por contactar con {{merchantName}}!'
    });
    this.connectNodes(aiAgentNode.id, 'output', endNode.id, 'input');

    // 6. Conexiones de Herramientas
    this.connectNodes(ragSkill.id, 'skill_out', aiAgentNode.id, 'skills_in');
    this.connectNodes(humanSkill.id, 'skill_out', aiAgentNode.id, 'skills_in');

    this.cdr.detectChanges();
  }

  async saveAsTemplate() {
    if (!this.newTemplate.name) {
      this.notification.show('El nombre es obligatorio', 'warning');
      return;
    }

    const template = {
      name: this.newTemplate.name,
      description: this.newTemplate.description,
      icon: this.newTemplate.icon,
      category: this.newTemplate.category,
      flow_data: this.botFlow.flow_data,
      is_pro: true
    };

    const { error } = await this.supabase.saveBotFlowTemplate(template);
    if (error) {
      this.notification.show('Error al guardar la plantilla', 'error');
    } else {
      this.notification.show('🎁 ¡Plantilla Pro guardada con éxito!', 'success');
      this.showSaveTemplateModal = false;
      await this.loadTemplates();
    }
  }

  async deleteTemplate(id: string) {
    this.modalConfig = {
      title: '¿Eliminar Plantilla?',
      message: 'Esta acción eliminará la plantilla de forma permanente y no se puede deshacer.',
      icon: '🗑️',
      confirmLabel: 'Sí, Eliminar',
      isProcessing: false,
      action: async () => {
        this.showConfirmModal = false;
        const { error } = await this.supabase.deleteBotFlowTemplate(id);
        if (error) {
          this.notification.show('Error al eliminar la plantilla', 'error');
        } else {
          this.notification.show('🗑️ Plantilla eliminada', 'success');
          await this.loadTemplates();
        }
      }
    };
    this.showConfirmModal = true;
  }

  private async generateIACatalogFlow() {
    let x = 600;
    let y = 100;

    // 1. Inicio
    const startNode = this.createSpecificNode('start', x, y, { 
      label: 'Bienvenida IA', 
      message: '¡Hola! Bienvenido a {{merchantName}}. 👋\nSoy tu asistente de ventas inteligente. Puedo mostrarte nuestros productos, añadirlos a tu carrito y tomar tu pedido. ¿En qué te puedo ayudar?' 
    });
    y += 180;

    // 2. Agente IA (Cerebro del flujo)
    const aiAgentNode = this.createSpecificNode('ai_agent', x, y, { 
      label: 'Asistente de Ventas IA', 
      prompt: `Eres un asistente de ventas experto y amigable de {{merchantName}}.

Tu objetivo es ayudar al cliente a:
1. Encontrar los productos que busca (usa catalog_search)
2. Verificar disponibilidad (usa inventory_check)
3. Añadir productos al carrito (usa add_to_cart)
4. Revisar su pedido (usa get_cart)
5. Confirmar y registrar el pedido (usa register_order cuando el cliente confirme)

REGLAS IMPORTANTES:
- Siempre usa las herramientas para obtener información real, nunca inventes datos
- Sé breve y orientado a la venta
- Cuando el cliente diga "sí", "confirmar", "quiero ese" → añade al carrito o registra el pedido según el contexto
- Después de añadir algo al carrito, pregunta si quiere algo más o confirmar el pedido`,
      user_prompt: '{{message}}',
      model: 'gemini-2.0-flash',
      temperature: 0.7,
      memory_limit: 6
    });
    this.connectNodes(startNode.id, 'output', aiAgentNode.id, 'input');

    // 3. Skills - Todas las herramientas disponibles
    const skillPositions = [
      { type: 'catalog_search',  label: '🔍 Buscar Catálogo',  desc: 'Busca productos disponibles por nombre o categoría.',                         dx: -375 },
      { type: 'inventory_check', label: '📦 Consultar Stock',   desc: 'Verifica si hay unidades disponibles de un producto.',                        dx: -225 },
      { type: 'add_to_cart',     label: '➕ Añadir al Carrito', desc: 'Añade un producto al carrito cuando el cliente lo elige.',                    dx: -75  },
      { type: 'get_cart',        label: '🛒 Ver Carrito',       desc: 'Muestra los productos en el carrito con precios y total.',                    dx: 75   },
      { type: 'register_order',  label: '✅ Registrar Pedido',  desc: 'Confirma y registra el pedido. Solo cuando el cliente confirme explícitamente.', dx: 225 },
      { type: 'order_status',    label: '🚚 Estado de Pedido',  desc: 'Consulta el estado de un pedido existente por su número.',                    dx: 375  },
    ];

    const createdSkills: any[] = [];
    for (const sp of skillPositions) {
      const skill = this.createSpecificNode('ai_skill', x + sp.dx, y + 250, { 
        label: sp.label, 
        actionType: sp.type as any,
        message: sp.desc
      });
      createdSkills.push(skill);
    }

    // 4. Nodo de fin
    const endNode = this.createSpecificNode('end', x, y + 520, {
      label: 'Cierre',
      message: '¡Gracias por tu compra en {{merchantName}}! 🎉 ¿Hay algo más en lo que te pueda ayudar?'
    });
    this.connectNodes(aiAgentNode.id, 'output', endNode.id, 'input');

    // 5. Conectar todas las Skills al Agente (puerto TOOLS)
    for (const skill of createdSkills) {
      this.connectNodes(skill.id, 'skill_out', aiAgentNode.id, 'skills_in');
    }

    this.cdr.detectChanges();
  }


  private async generateProductFlow() {
    const { data: categories } = await this.supabase.getCategories(this.merchantId);
    if (!categories || categories.length === 0) {
      this.notification.show('No hay categorías configuradas para generar el flujo', 'warning');
      return;
    }

    const { data: allProducts } = await this.supabase.getProducts(this.merchantId);

    let x = 600;
    let y = 100;

    // 1. Inicio
    const startNode = this.createSpecificNode('start', x, y, { label: 'Bienvenida', message: '¡Hola! Bienvenido a {{merchantName}}. 👋\n¿En qué podemos ayudarte hoy?' });
    y += 180;

    // 2. Menú de Categorías (Centro del flujo)
    const catOptions = categories.slice(0, 10).map(cat => ({ id: `cat_${cat.id}`, text: cat.name, value: cat.id }));
    const menuNode = this.createSpecificNode('menu', x, y, { label: 'Categorías', message: 'Contamos con las siguientes categorías. Por favor elige una:', options: catOptions });
    this.connectNodes(startNode.id, 'output', menuNode.id, 'input');

    // 3. Nodo de decisión central (Neutral)
    const decisionNode = this.createSpecificNode('menu', x + 400, y + 200, { 
      label: '¿Qué sigue?', 
      message: '¿Cómo deseas continuar con tu pedido?',
      options: [
        { id: 'opt_continue', text: '➕ Seguir comprando', value: 'continue' },
        { id: 'opt_view', text: '📝 Ver mi pedido', value: 'view' },
        { id: 'opt_finish', text: '🏁 Finalizar pedido', value: 'finish' },
        { id: 'opt_empty', text: '🗑️ Vaciar carrito y reiniciar', value: 'empty' }
      ]
    });

    // Nodo intermedio: Confirmación de adición (Solo cuando se agrega algo)
    const addedConfirmNode = this.createSpecificNode('message', x + 200, y + 350, {
      label: 'Confirmación',
      message: '✅ ¡Producto añadido con éxito!'
    });
    this.connectNodes(addedConfirmNode.id, 'output', decisionNode.id, 'input');
    
    // Nodo para Ver Pedido (Resumen real)
    const viewOrderNode = this.createSpecificNode('message', x + 600, y + 50, {
      label: 'Resumen',
      message: '🛒 Tu Pedido Actual:\n{{cartSummary}}\n\n¿Qué deseas hacer ahora?'
    });

    // Conexiones de decisión
    this.connectNodes(decisionNode.id, 'opt_continue', menuNode.id, 'input');
    this.connectNodes(decisionNode.id, 'opt_view', viewOrderNode.id, 'input');
    this.connectNodes(viewOrderNode.id, 'output', decisionNode.id, 'input');

    // Acción para vaciar carrito
    const emptyActionNode = this.createSpecificNode('action', x + 600, y + 200, {
      label: 'Vaciar Carrito',
      actionType: 'empty_cart'
    });
    this.connectNodes(decisionNode.id, 'opt_empty', emptyActionNode.id, 'input');
    this.connectNodes(emptyActionNode.id, 'output', menuNode.id, 'input');

    // 4. Captura de Información del Usuario
    const nameNode = this.createSpecificNode('question', x + 800, y + 300, { label: 'Nombre', message: '¡Perfecto! Para agendar tu pedido, ¿cuál es tu nombre completo?', variable: 'customer_name' });
    const phoneNode = this.createSpecificNode('question', x + 800, y + 450, { label: 'Teléfono', message: 'Gracias {{customer_name}}, ¿a qué número telefónico podemos contactarte?', variable: 'phone', validation: 'phone' });
    const addressNode = this.createSpecificNode('question', x + 800, y + 600, { label: 'Dirección', message: 'Por último, ¿cuál es la dirección de entrega?', variable: 'direccion_entrega' });
    const deliveryNoteNode = this.createSpecificNode('question', x + 800, y + 750, { label: 'Instrucción Entrega', message: '¿Alguna instrucción adicional para la entrega o para nosotros? (Si no, escribe "no")', variable: 'notas_entrega' });
    
    this.connectNodes(decisionNode.id, 'opt_finish', nameNode.id, 'input');
    this.connectNodes(nameNode.id, 'output', phoneNode.id, 'input');
    this.connectNodes(phoneNode.id, 'output', addressNode.id, 'input');
    this.connectNodes(addressNode.id, 'output', deliveryNoteNode.id, 'input');
    
    // 5. Acción Final: Registrar Pedido
    const actionNode = this.createSpecificNode('action', x + 800, y + 900, { label: 'Registrar Pedido', actionType: 'register_order' });
    this.connectNodes(deliveryNoteNode.id, 'output', actionNode.id, 'input');

    const endNode = this.createSpecificNode('end', x + 800, y + 1050, { 
      label: 'Despedida', 
      message: '¡Listo! Tu pedido {{orderNumber}} ha sido registrado con éxito. 🚀\n\nResumen final:\n{{cartSummary}}\nEntrega en: {{direccion_entrega}}\nNotas: {{notas_entrega}}\n\n¡Gracias por tu compra!' 
    });
    this.connectNodes(actionNode.id, 'output', endNode.id, 'input');

    // 6. Generar menús de productos por categoría
    categories.slice(0, 6).forEach((cat, index) => {
      const products = (allProducts || []).filter(p => p.category_id === cat.id).slice(0, 8);
      if (products.length > 0) {
        const prodX = x + (index % 2 === 0 ? -400 : -800);
        const prodY = y + 250 + (index * 150);

        const prodOptions = products.map(p => ({ id: `prod_${p.id}`, text: `${p.name} ($${p.price})`, value: `${p.id}|${p.price}` }));
        // Añadir opción de Volver
        prodOptions.push({ id: `back_${cat.id}`, text: '⬅️ Volver al menú principal', value: 'back' });

        const prodMenu = this.createSpecificNode('menu', prodX, prodY, { label: `Productos: ${cat.name}`, message: `Estos son nuestros productos en ${cat.name}:`, options: prodOptions });
        
        // Conectar categoría con su menú de productos
        this.connectNodes(menuNode.id, `cat_${cat.id}`, prodMenu.id, 'input');
        
        // Conectar botón volver al menú principal
        this.connectNodes(prodMenu.id, `back_${cat.id}`, menuNode.id, 'input');

        // 7. Preguntar cantidad por cada producto
        const qtyNode = this.createSpecificNode('question', prodX - 300, prodY + 100, { label: 'Cantidad', message: '¿Cuántas unidades deseas ordenar?', variable: 'cantidad_actual', validation: 'number' });
        
        products.forEach(p => {
          this.connectNodes(prodMenu.id, `prod_${p.id}`, qtyNode.id, 'input');
        });

        // 8. Instrucciones especiales de preparación
        const prepNoteNode = this.createSpecificNode('question', prodX - 600, prodY + 100, { label: 'Notas Especiales', message: '¿Alguna instrucción especial? (ej: Sin cebolla, extra queso). Si no, escribe "no"', variable: 'notas_preparacion' });
        this.connectNodes(qtyNode.id, 'output', prepNoteNode.id, 'input');

        // 9. Después de la nota, ir al nodo de confirmación y luego a la decisión
        this.connectNodes(prepNoteNode.id, 'output', addedConfirmNode.id, 'input');
      }
    });

    // Organizar linealmente de forma automática
    setTimeout(() => this.organizeFlow(), 100);
  }

  private async generateServiceFlow() {
    const { data: resources } = await this.supabase.getReservableResources(this.merchantId);
    if (!resources || resources.length === 0) {
      this.notification.show('No hay servicios/recursos configurados para generar el flujo', 'warning');
      return;
    }

    let x = 400;
    let y = 100;

    // 1. Start
    const startNode = this.createSpecificNode('start', x, y, { label: 'Inicio', message: '¡Hola! ¿Deseas agendar un servicio?' });
    y += 150;

    // 2. Services Menu
    const options = resources.slice(0, 10).map(res => ({ id: `res_${res.id}`, text: res.name, value: res.id }));
    const menuNode = this.createSpecificNode('menu', x, y, { label: 'Catálogo de Servicios', message: 'Elige el servicio que te interesa:', options });
    this.connectNodes(startNode.id, 'output', menuNode.id, 'input');

    // 3. Question (Date/Time)
    y += 250;
    const questionNode = this.createSpecificNode('question', x, y, { label: 'Agendar', message: '¿Para qué fecha y hora deseas tu reserva?', variable: 'booking_datetime', validation: 'text' });
    
    resources.slice(0, 10).forEach(res => {
      this.connectNodes(menuNode.id, `res_${res.id}`, questionNode.id, 'input');
    });

    // 4. Action
    y += 200;
    const actionNode = this.createSpecificNode('action', x, y, { label: 'Crear Reserva', actionType: 'create_booking' });
    this.connectNodes(questionNode.id, 'output', actionNode.id, 'input');

    // Organizar linealmente de forma automática
    setTimeout(() => this.organizeFlow(), 100);
  }

  private createSpecificNode(type: string, x: number, y: number, data: any): FlowNode {
    const node: FlowNode = {
      id: `node_gen_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      type: type as any,
      position: { x, y },
      data: { ...data }
    };
    
    // Inmutabilidad para asegurar detección de cambios
    this.botFlow.flow_data.nodes = [...this.botFlow.flow_data.nodes, node];
    
    console.log(`📦 [BotBuilder] Nodo creado (${type}):`, node.id);
    this.cdr.detectChanges();
    return node;
  }

  private connectNodes(from: string, fromPort: string, to: string, toPort: string) {
    this.botFlow.flow_data.connections = [
      ...this.botFlow.flow_data.connections,
      {
        id: `conn_gen_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        from,
        fromPort,
        to,
        toPort
      }
    ];
    console.log(`🔗 [BotBuilder] Conexión creada: ${from} -> ${to}`);
    this.cdr.detectChanges();
  }

  async saveFlow() {
    this.validateFlow();
    try {
      const { data, error } = await this.supabase.saveBotFlow(this.botFlow);
      if (error) throw error;
      this.notification.show('¡Flujo guardado con éxito! ✅', 'success');
    } catch (e: any) {
      this.notification.show('Error al guardar: ' + e.message, 'error');
    }
  }

  // --- NODE MANAGEMENT ---
  addNode(type: any, x?: number, y?: number) {
    // Si no se especifican coordenadas, colocar en el centro del canvas visible
    if (x === undefined || y === undefined) {
      const parent = this.canvasRef?.nativeElement?.parentElement;
      const cw = parent?.clientWidth || 800;
      const ch = parent?.clientHeight || 600;
      x = (cw / 2 - this.viewTransform.x) / this.viewTransform.scale - 110;
      y = (ch / 2 - this.viewTransform.y) / this.viewTransform.scale - 40;
    }

    const now = Date.now();
    const newNode: FlowNode = {
      id: `node_${now}`,
      type: type,
      position: { x, y },
      data: {
        label: this.getNodeLabel(type),
        message: type === 'start' ? '¡Hola! Bienvenido a {{merchantName}}.' : '',
        options: type === 'menu' ? [{ id: `opt_${now}`, text: 'Opción 1', value: '1' }] : undefined,
        operator: type === 'condition' ? '==' : undefined,
        variable: type === 'condition' ? '' : undefined,
        value: type === 'condition' ? '' : undefined,
        prompt: type === 'ai_agent' ? 'Eres un asistente útil de Servicio al Cliente. Responde dudas de forma natural.' : undefined,
        user_prompt: type === 'ai_agent' ? 'Mensaje del usuario: {{message}}' : undefined,
        model: type === 'ai_agent' ? 'gemini-2.0-flash' : undefined,
        temperature: type === 'ai_agent' ? 0.7 : undefined,
        memory_limit: type === 'ai_agent' ? 4 : undefined,
        actionType: type === 'ai_skill' ? 'catalog_search' : (type === 'catalog_search' ? 'catalog_search' : (type === 'cart_summary' ? 'shopping_cart' : (type === 'order_checkout' ? 'register_order' : undefined))),
        params: type === 'ai_skill' ? {} : undefined,
        n8n_webhook_url: type === 'n8n' ? '' : undefined,
        n8n_wait_for_response: type === 'n8n' ? false : undefined,
        mcp_server_id: type === 'mcp' ? '' : undefined,
        mcp_tool_name: type === 'mcp' ? '' : undefined,
        api_method: type === 'api' ? 'GET' : undefined,
        api_url: type === 'api' ? '' : undefined,
        memory_prompt: type === 'memory_extract' ? '' : undefined,
        memory_key: type === 'memory_extract' ? '' : undefined,
        db_operation: type === 'db_query' ? 'select' : undefined,
        variable_name: type === 'set_variable' ? '' : undefined,
        variable_value: type === 'set_variable' ? '' : undefined,
        switch_variable: type === 'switch' ? '' : undefined,
        switch_cases: type === 'switch' ? [{ id: `case_${now}`, value: 'Ventas', label: 'Ventas' }] : undefined,
        delay_hours: type === 'delay' ? 0 : undefined,
        delay_minutes: type === 'delay' ? 30 : undefined,
        timezone: type === 'business_hours' ? 'America/Bogota' : undefined,
        business_hours: type === 'business_hours' ? [
          { day: 'monday', open: '08:00', close: '18:00', enabled: true },
          { day: 'tuesday', open: '08:00', close: '18:00', enabled: true },
          { day: 'wednesday', open: '08:00', close: '18:00', enabled: true },
          { day: 'thursday', open: '08:00', close: '18:00', enabled: true },
          { day: 'friday', open: '08:00', close: '18:00', enabled: true },
          { day: 'saturday', open: '09:00', close: '13:00', enabled: true },
          { day: 'sunday', open: '00:00', close: '00:00', enabled: false }
        ] : undefined,
        ai_intents: type === 'semantic_router' ? [{ id: `inc_${now}`, name: 'comprar', description: 'El usuario quiere comprar algo' }] : undefined,
        image_prompt: type === 'image_generator' ? 'Una foto realista de un plato de pasta' : undefined,
        image_size: type === 'image_generator' ? '512x512' : undefined,
        email_to: type === 'send_email' ? '{{customer_email}}' : undefined,
        email_subject: type === 'send_email' ? 'Confirmación de Pedido' : undefined
      }
    };
    this.botFlow.flow_data.nodes.push(newNode);
    this.selectedNode = newNode;
    this.editingNode = newNode;
    this.panelVisible = true;
  }

  addSwitchCase() {
    if (!this.editingNode) return;
    if (!this.editingNode.data.switch_cases) this.editingNode.data.switch_cases = [];
    const id = `case_${Date.now()}`;
    this.editingNode.data.switch_cases.push({ id, value: 'Nuevo', label: 'Nuevo' });
  }

  removeSwitchCase(index: number) {
    if (!this.editingNode?.data.switch_cases) return;
    this.editingNode.data.switch_cases.splice(index, 1);
  }

  addIntent() {
    if (!this.editingNode) return;
    if (!this.editingNode.data.ai_intents) this.editingNode.data.ai_intents = [];
    const id = `intent_${Date.now()}`;
    this.editingNode.data.ai_intents.push({ id, name: 'nueva_intencion', description: 'Descripción...' });
  }

  removeIntent(index: number) {
    if (!this.editingNode?.data.ai_intents) return;
    this.editingNode.data.ai_intents.splice(index, 1);
  }

  duplicateNode(node: FlowNode) {
    const now = Date.now();
    const copy: FlowNode = {
      id: `node_${now}`,
      type: node.type,
      position: { x: node.position.x + 40, y: node.position.y + 40 },
      data: JSON.parse(JSON.stringify(node.data))
    };
    // Re-generar IDs de opciones para evitar colisiones
    if (copy.data.options) {
      copy.data.options = copy.data.options.map((o: any, i: number) => ({ ...o, id: `opt_${now}_${i}` }));
    }
    this.botFlow.flow_data.nodes.push(copy);
    this.selectedNode = copy;
    this.notification.show('Bloque duplicado', 'success');
  }


  getNodeLabel(type: string): string {
    return this.paletteItems.find(p => p.type === type)?.label || 'Bloque';
  }

  getNodeIcon(type: string): string {
    return this.paletteItems.find(p => p.type === type)?.icon || '📦';
  }

  getNodeDescription(type: string): string {
    return this.paletteItems.find(p => p.type === type)?.description || 'Sin descripción';
  }

  getNodeColor(type: string): string {
    const colors: any = {
      start: '#065f46',
      end: '#374151',
      condition: '#1e3a5f',
      ai_agent: '#581c87',
      ai_skill: '#0891b2',
      action: '#b91c1c',
      n8n: '#be185d',
      api: '#ea580c',
      mcp: '#0f766e',
      memory_extract: '#6b21a8',
      db_query: '#1d4ed8',
      set_variable: '#b45309',
      switch: '#1e3a8a',
      delay: '#78350f',
      business_hours: '#115e59',
      semantic_router: '#ec4899',
      image_generator: '#f43f5e',
      knowledge_query: '#06b6d4',
      send_email: '#1e40af',
      transfer_operator: '#d97706',
      wa_template: '#15803d',
      catalog_search: '#7c3aed',
      cart_summary: '#db2777',
      order_checkout: '#059669'
    };
    return colors[type] || '#1e293b';
  }

  getNodePreview(node: FlowNode): string {
    switch (node.type) {
      case 'condition': 
        return `${node.data.variable || '?'} ${node.data.operator || '=='} ${node.data.value || '?'}`;
      case 'ai_agent':
        return `IA: ${(node.data.prompt || '').substring(0, 30)}...`;
      case 'action':
        const labels: any = {
          register_order: 'Registrar Pedido', create_booking: 'Crear Reserva',
          transfer_human: 'Transferir a Agente', tag_customer: 'Etiquetar Cliente',
          empty_cart: 'Vaciar Carrito', add_to_cart: 'Añadir al Carrito'
        };
        return labels[node.data.actionType || ''] || 'Acción';
      case 'n8n':
        return node.data.n8n_webhook_url ? `🔗 ${node.data.n8n_webhook_url}` : 'Sin Webhook configurado';
      case 'mcp':
        return node.data.mcp_tool_name ? `🧩 ${node.data.mcp_tool_name}` : 'Sin Herramienta configurada';
      case 'api':
        return node.data.api_url ? `🌐 [${node.data.api_method || 'GET'}] ${node.data.api_url}` : 'Sin Endpoint configurado';
      case 'memory_extract':
        return node.data.memory_key ? `💾 Guardar en: ${node.data.memory_key}` : 'Extraer memoria';
      case 'db_query':
        return node.data.db_table ? `📊 ${node.data.db_operation?.toUpperCase()} en ${node.data.db_table}` : 'Sin tabla seleccionada';
      case 'set_variable':
        return node.data.variable_name ? `📝 ${node.data.variable_name} = ${node.data.variable_value}` : 'Sin variable';
      case 'switch':
        return node.data.switch_variable ? `🔌 Evaluar: ${node.data.switch_variable}` : 'Router logic';
      case 'delay':
        return `⏳ Esperar ${node.data.delay_hours || 0}h ${node.data.delay_minutes || 0}m`;
      case 'business_hours':
        return `📅 Filtro: ${node.data.timezone || 'Local'}`;
      case 'semantic_router':
        return `🛣️ Router IA (${node.data.ai_intents?.length || 0} intenciones)`;
      case 'image_generator':
        return `🎨 Generar: ${node.data.image_prompt?.substring(0, 20)}...`;
      case 'knowledge_query':
        return `📚 Consultar KB: ${node.data.knowledge_doc_id || 'Global'}`;
      case 'send_email':
        return `📧 Enviar a: ${node.data.email_to || '...'}`;
      case 'transfer_operator':
        return `👤 Transferencia a Humano`;
      case 'wa_template':
        return `💬 WhatsApp: ${node.data.wa_template_name || 'Sin plantilla'}`;
      case 'catalog_search':
        return `🛒 Buscar en Catálogo`;
      case 'cart_summary':
        return `🛍️ Resumen del Carrito`;
      case 'order_checkout':
        return `🏁 Checkout de Pedido`;
    }
    const msg = node.data.message || '';
    return msg ? msg.substring(0, 28) + (msg.length > 28 ? '…' : '') : '(sin mensaje)';
  }

  deleteSelectedNode() {
    if (!this.selectedNode) return;
    this.botFlow.flow_data.connections = this.botFlow.flow_data.connections.filter(
      c => c.from !== this.selectedNode!.id && c.to !== this.selectedNode!.id
    );
    this.botFlow.flow_data.nodes = this.botFlow.flow_data.nodes.filter(
      n => n.id !== this.selectedNode!.id
    );
    this.selectedNode = null;
    this.editingNode = null;
  }

  deleteConnection(connId: string) {
    this.botFlow.flow_data.connections = this.botFlow.flow_data.connections.filter(c => c.id !== connId);
    this.notification.show('Conexión eliminada', 'success');
  }

  validateFlow(): boolean {
    const nodes = this.botFlow.flow_data.nodes;
    const connections = this.botFlow.flow_data.connections;
    const warnings: string[] = [];

    if (!nodes.find(n => n.type === 'start')) {
      warnings.push('No hay bloque de Inicio. El flujo no sabe por dónde empezar.');
    }
    if (!nodes.find(n => n.type === 'end')) {
      warnings.push('No hay bloque de Fin. El flujo puede quedar abierto indefinidamente.');
    }
    const disconnected = nodes.filter(n =>
      n.type !== 'start' && n.type !== 'ai_skill' && !n.type.startsWith('ai_skill') && !connections.some(c => c.to === n.id)
    );
    if (disconnected.length > 0) {
      warnings.push(`${disconnected.length} bloque(s) sin entrada: ${disconnected.map(n => n.data.label).join(', ')}.`);
    }

    if (warnings.length > 0) {
      this.notification.show('⚠️ ' + warnings[0], 'warning');
      console.warn('[BotBuilder] Advertencias de validación:', warnings);
    }
    return true; // No bloquear el guardado, solo advertir
  }


  // --- EVENT HANDLERS (MOUSE) ---
  @HostListener('mousemove', ['$event'])
  onMouseMove(event: MouseEvent) {
    const coords = this.getRelativeCoords(event);
    this.mousePos = coords;

    if (this.draggedNode) {
      this.draggedNode.position.x = coords.x - this.dragOffset.x;
      this.draggedNode.position.y = coords.y - this.dragOffset.y;
    } else if (this.isPanning) {
      this.viewTransform.x = event.clientX - this.panStart.x;
      this.viewTransform.y = event.clientY - this.panStart.y;
    }
  }

  @HostListener('mouseup')
  onMouseUp() {
    this.draggedNode = null;
    this.isPanning = false;
    if (!this.isConnecting) {
      this.isConnecting = false;
      this.connectionStart = null;
    }
  }

  onCanvasMouseDown(event: MouseEvent) {
    if (event.button === 0) { // Clic izquierdo en el fondo
      this.isPanning = true;
      this.panStart = {
        x: event.clientX - this.viewTransform.x,
        y: event.clientY - this.viewTransform.y
      };
      this.selectedNode = null;
    }
  }

  onWheel(event: WheelEvent) {
    if (event.ctrlKey || event.metaKey) { // Zoom con Ctrl/Cmd + Rueda
      event.preventDefault();
      const zoomFactor = 0.05;
      const delta = event.deltaY > 0 ? -zoomFactor : zoomFactor;
      this.viewTransform.scale = Math.min(Math.max(0.2, this.viewTransform.scale + delta), 2);
    } else {
      // Pan vertical/horizontal normal con rueda si no se presiona ctrl
      this.viewTransform.y -= event.deltaY;
      this.viewTransform.x -= event.deltaX;
    }
  }

  zoomIn() {
    this.viewTransform.scale = Math.min(this.viewTransform.scale + 0.1, 2);
  }

  zoomOut() {
    this.viewTransform.scale = Math.max(this.viewTransform.scale - 0.1, 0.2);
  }

  centerFlow() {
    if (this.botFlow.flow_data.nodes.length === 0) {
      this.viewTransform = { x: 50, y: 50, scale: 1 };
      return;
    }

    const nodes = this.botFlow.flow_data.nodes;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    nodes.forEach(n => {
      minX = Math.min(minX, n.position.x);
      maxX = Math.max(maxX, n.position.x + 220);
      minY = Math.min(minY, n.position.y);
      maxY = Math.max(maxY, n.position.y + 120);
    });

    const flowWidth = maxX - minX;
    const flowHeight = maxY - minY;
    
    // Dimensiones del contenedor
    const parent = this.canvasRef.nativeElement.parentElement;
    if (!parent) return;

    const canvasWidth = parent.clientWidth || 800;
    const canvasHeight = parent.clientHeight || 600;

    const padding = 40;
    const scaleX = (canvasWidth - padding) / flowWidth;
    const scaleY = (canvasHeight - padding) / flowHeight;
    const newScale = Math.min(Math.max(Math.min(scaleX, scaleY, 1), 0.4), 1);

    this.viewTransform.scale = newScale;
    this.viewTransform.x = (canvasWidth / 2) - ((minX + flowWidth / 2) * newScale);
    this.viewTransform.y = (canvasHeight / 2) - ((minY + flowHeight / 2) * newScale);
  }

  organizeFlow() {
    const nodes = this.botFlow.flow_data.nodes;
    const connections = this.botFlow.flow_data.connections;
    if (nodes.length === 0) return;

    // 1. Identificar jerarquía simple (BFS desde START)
    const startNode = nodes.find(n => n.type === 'start') || nodes[0];
    const levels: Map<string, number> = new Map();
    const queue: { id: string, level: number }[] = [{ id: startNode.id, level: 0 }];
    const processed = new Set();

    while (queue.length > 0) {
      const { id, level } = queue.shift()!;
      if (processed.has(id)) continue;
      processed.add(id);
      levels.set(id, Math.max(levels.get(id) || 0, level));

      // Buscar hijos
      const children = connections
        .filter(c => c.from === id)
        .map(c => c.to);
      
      children.forEach(childId => {
        queue.push({ id: childId, level: level + 1 });
      });
    }

    // Nodos huérfanos
    nodes.forEach(n => {
      if (!levels.has(n.id)) levels.set(n.id, 0);
    });

    // 2. Agrupar por niveles y posicionar
    const nodesByLevel: { [key: number]: string[] } = {};
    levels.forEach((lvl, id) => {
      if (!nodesByLevel[lvl]) nodesByLevel[lvl] = [];
      nodesByLevel[lvl].push(id);
    });

    const HORIZ_GAP = 350;
    const VERT_GAP = 180;

    Object.keys(nodesByLevel).forEach(lvlStr => {
      const lvl = parseInt(lvlStr);
      const ids = nodesByLevel[lvl];
      const levelHeight = (ids.length - 1) * VERT_GAP;
      
      ids.forEach((id, idx) => {
        const node = nodes.find(n => n.id === id);
        if (node) {
          node.position.x = 100 + (lvl * HORIZ_GAP);
          node.position.y = 200 + (idx * VERT_GAP) - (levelHeight / 2);
        }
      });
    });

    this.centerFlow();
  }

  onNodeMouseDown(event: MouseEvent, node: FlowNode) {
    event.stopPropagation();
    this.selectedNode = node;
    this.draggedNode = node;
    const coords = this.getRelativeCoords(event);
    this.dragOffset = {
      x: coords.x - node.position.x,
      y: coords.y - node.position.y
    };
  }

  onNodeDblClick(event: MouseEvent, node: FlowNode) {
    event.stopPropagation();
    this.selectedNode = node;
    this.editingNode = node;
  }

  onPortMouseDown(event: MouseEvent, node: FlowNode, port: string) {
    event.stopPropagation();
    this.isConnecting = true;
    this.connectionStart = { node, port };
  }

  onPortMouseUp(event: MouseEvent, node: FlowNode, port: string) {
    if (this.isConnecting && this.connectionStart) {
      // Evitar conexiones al mismo nodo
      const isSameNode = this.connectionStart.node.id === node.id;
      
      // Permitir: 
      // 1. Conexiones hacia 'input' regulares
      // 2. Conexiones desde 'skill_out' hacia 'skills_in'
      const isValidStandardConnection = port === 'input' && this.connectionStart.port !== 'skill_out';
      const isValidSkillConnection = port === 'skills_in' && this.connectionStart.port === 'skill_out';

      if (!isSameNode && (isValidStandardConnection || isValidSkillConnection)) {
        const newConn: FlowConnection = {
          id: `conn_${Date.now()}`,
          from: this.connectionStart.node.id,
          fromPort: this.connectionStart.port,
          to: node.id,
          toPort: port
        };
        
        // Quitar conexión previa si el puerto origen solo permite una salida
        if (this.connectionStart.port !== 'menu') {
           this.botFlow.flow_data.connections = this.botFlow.flow_data.connections.filter(
             c => c.from !== newConn.from || c.fromPort !== newConn.fromPort
           );
        }

        this.botFlow.flow_data.connections.push(newConn);
      }
    }
    this.isConnecting = false;
    this.connectionStart = null;
  }

  // --- SVG CALCULATIONS ---
  getRelativeCoords(event: MouseEvent) {
    const svg = this.canvasRef.nativeElement;
    const pt = svg.createSVGPoint();
    pt.x = event.clientX;
    pt.y = event.clientY;
    const globalPoint = pt.matrixTransform(svg.getScreenCTM()?.inverse());
    return { x: globalPoint.x, y: globalPoint.y };
  }

  getConnectionPath(conn: FlowConnection): string {
    const fromNode = this.botFlow.flow_data.nodes.find(n => n.id === conn.from);
    const toNode = this.botFlow.flow_data.nodes.find(n => n.id === conn.to);
    if (!fromNode || !toNode) return '';

    const start = this.getPortCoords(fromNode, conn.fromPort);
    const end = this.getPortCoords(toNode, conn.toPort);

    // Para conexiones verticales (skills)
    if (conn.fromPort === 'skill_out' || conn.toPort === 'skills_in') {
      const isUpward = end.y < start.y;
      const verticalOffset = Math.max(Math.abs(end.y - start.y) * 0.5, 50);
      const cp1y = start.y + (isUpward ? -verticalOffset : verticalOffset);
      const cp2y = end.y - (isUpward ? -verticalOffset : verticalOffset);
      return `M ${start.x} ${start.y} C ${start.x} ${cp1y}, ${end.x} ${cp2y}, ${end.x} ${end.y}`;
    }

    // Para conexiones horizontales (estándar)
    const cp1x = start.x + Math.max(Math.abs(end.x - start.x) * 0.5, 50);
    const cp2x = end.x - Math.max(Math.abs(end.x - start.x) * 0.5, 50);

    return `M ${start.x} ${start.y} C ${cp1x} ${start.y}, ${cp2x} ${end.y}, ${end.x} ${end.y}`;
  }

  getTempConnectionPath(): string {
    if (!this.connectionStart) return '';
    const start = this.getPortCoords(this.connectionStart.node, this.connectionStart.port);
    const end = this.mousePos;

    if (this.connectionStart.port === 'skill_out' || this.connectionStart.port === 'skills_in') {
      const verticalOffset = Math.max(Math.abs(end.y - start.y) * 0.5, 50);
      // skill_out normalmente va hacia abajo (empieza arriba, drag down), skills_in al revés
      const cp1y = start.y + (this.connectionStart.port === 'skill_out' ? verticalOffset : -verticalOffset);
      const cp2y = end.y - (this.connectionStart.port === 'skill_out' ? verticalOffset : -verticalOffset);
      return `M ${start.x} ${start.y} C ${start.x} ${cp1y}, ${end.x} ${cp2y}, ${end.x} ${end.y}`;
    }

    const cp1x = start.x + Math.max(Math.abs(end.x - start.x) * 0.5, 50);
    const cp2x = end.x - Math.max(Math.abs(end.x - start.x) * 0.5, 50);
    return `M ${start.x} ${start.y} C ${cp1x} ${start.y}, ${cp2x} ${end.y}, ${end.x} ${end.y}`;
  }

  getPortCoords(node: FlowNode, port: string): { x: number, y: number } {
    if (port === 'input') return { x: node.position.x, y: node.position.y + 40 };
    if (port === 'output') return { x: node.position.x + 220, y: node.position.y + 40 };
    if (port === 'skill_out') return { x: node.position.x + 110, y: node.position.y };
    if (port === 'skills_in') return { x: node.position.x + 110, y: node.position.y + 80 };
    
    // Para puertos de menú (múltiples salidas)
    if (node.type === 'menu' && node.data.options) {
      const optIndex = node.data.options.findIndex((o: any) => o.id === port);
      if (optIndex !== -1) {
        // Ajustar a la misma posición Y que se usa en el HTML (70 + i * 24)
        return { x: node.position.x + 220, y: node.position.y + 70 + (optIndex * 24) };
      }
    }
    
    return { x: node.position.x + 220, y: node.position.y + 40 };
  }

  // --- PROPERTIES HELPERS ---
  addMenuOption() {
    if (this.editingNode?.data.options) {
      this.editingNode.data.options.push({
        id: `opt_${Date.now()}`,
        text: 'Nueva Opción',
        value: ''
      });
    }
  }

  removeMenuOption(index: number) {
    if (this.editingNode?.data.options) {
      const optId = this.editingNode.data.options[index].id;
      // Eliminar conexiones de esa opción
      this.botFlow.flow_data.connections = this.botFlow.flow_data.connections.filter(
        c => c.fromPort !== optId
      );
      this.editingNode.data.options.splice(index, 1);
    }
  }

  toggleChat() {
    this.zone.run(() => {
      this.showTestChat = !this.showTestChat;
      this.cdr.detectChanges();
    });
  }

  onSimNodeExecuted(nodeId: string) {
    this.activeSimNodeId = nodeId;
    const existing = this.nodeExecutionCounts.get(nodeId) || 0;
    this.nodeExecutionCounts.set(nodeId, existing + 1);
    this.justExecutedNodeId = nodeId;
    
    // Auto-limpiar el icono check después de 1s
    setTimeout(() => {
        if (this.justExecutedNodeId === nodeId) this.justExecutedNodeId = null;
    }, 1000);
    
    this.cdr.detectChanges();
  }


  async sendChatMessage() {
    if (!this.userChatInput.trim() || this.isBotTyping) return;

    const input = this.userChatInput.trim();
    this.chatMessages.push({ text: input, sender: 'user' });
    this.userChatInput = '';
    setTimeout(() => this.scrollChatToBottom(), 50);

    const nodes = this.botFlow.flow_data.nodes;
    let currentNode = nodes.find(n => n.id === this.simulationState.currentNodeId);

    if (!currentNode) {
      this.chatMessages.push({ text: '⚠️ La sesión ha terminado. Pulsa Reiniciar para volver a empezar.', sender: 'bot', meta: { tokens: 0, time: 0 } });
      return;
    }

    if (currentNode.type === 'question') {
      const varName = currentNode.data.variable || 'temp';
      this.simulationState.variables[varName] = input;

      if (varName === 'cantidad_actual' && this.simulationState.variables['last_product']) {
        this.simulationState.variables['last_qty'] = parseInt(input) || 1;
      }
      else if (varName === 'notas_preparacion' && this.simulationState.variables['last_product']) {
        const prod = this.simulationState.variables['last_product'];
        const qty = this.simulationState.variables['last_qty'] || 1;
        const note = input.toLowerCase() === 'no' ? '' : input;
        
        if (!this.simulationState.variables['cart']) this.simulationState.variables['cart'] = [];
        
        // Intentar encontrar un item con el mismo ID Y la misma nota para agruparlos
        const existing = this.simulationState.variables['cart'].find((i: any) => i.id === prod.id && i.note === note);
        if (existing) { 
          existing.qty += qty; 
        } else { 
          this.simulationState.variables['cart'].push({ ...prod, qty, note }); 
        }
        
        delete this.simulationState.variables['last_product'];
        delete this.simulationState.variables['last_qty'];
        this.cdr.detectChanges();
      }

      const nextId = this.findNextNodeId(currentNode.id, 'output');
      await this.moveToNextNode(nextId);
    }
    else if (currentNode.type === 'ai_agent') {
      this.isBotTyping = true;
      setTimeout(() => this.scrollChatToBottom(), 50);

      try {
        const responseData = await this.runGeminiAgentSim(input, currentNode);
        this.isBotTyping = false;
        
        this.chatMessages.push({ 
          text: responseData.text, 
          sender: 'bot',
          meta: responseData.meta
        });
        setTimeout(() => this.scrollChatToBottom(), 50);
      } catch (err: any) {
        this.isBotTyping = false;
        this.chatMessages.push({ text: `⚠️ Error: ${err.message || 'Fallo al conectar con la IA.'}`, sender: 'bot', meta: { tokens: 0, time: 0 } });
      }
    }
    else if (currentNode.type === 'menu') {
      const options = currentNode.data.options || [];
      const numIdx = parseInt(input) - 1;
      let match = (numIdx >= 0 && numIdx < options.length) ? options[numIdx] : null;

      if (!match) {
        match = options.find((o: any) =>
          input.toLowerCase().includes(o.text.toLowerCase()) ||
          o.text.toLowerCase().includes(input.toLowerCase())
        ) || null;
      }

      if (match) {
        if (match.id?.startsWith('prod_')) {
          const [valId, valPrice] = String(match.value || '').split('|');
          let price = parseFloat(valPrice || '0');
          if (isNaN(price)) {
            const pMatch = match.text.match(/\$?\s*([\d.]+)/);
            price = pMatch ? parseFloat(pMatch[1].replace(/\./g, '')) : 0;
          }
          this.simulationState.variables['last_product'] = {
            id: valId || match.value,
            name: match.text.split(' ($')[0],
            price
          };
        }
        const nextId = this.findNextNodeId(currentNode.id, match.id);
        await this.moveToNextNode(nextId);
      } else {
        this.chatMessages.push({ text: '❌ No reconocí esa opción. Escribe el número o el nombre.', sender: 'bot', meta: { tokens: 0, time: 0 } });
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 🏛️ Motor del Arquitecto IA: Diseñador de Flujos
  // ─────────────────────────────────────────────────────────────
  private async runGeminiArchitectSim(userRequest: string): Promise<{ text: string }> {
    // Reutilizamos la lógica de API Key de runGeminiAgentSim
    let apiKey: string | undefined;
    if (this.merchantId) {
      const { data: merchantData } = await this.supabase.getMerchantById(this.merchantId);
      if (merchantData?.ai_api_key) apiKey = merchantData.ai_api_key;
    }
    if (!apiKey) {
      const { data: settings } = await this.supabase.getPlatformSettings();
      apiKey = settings?.ai_api_key;
    }
    if (!apiKey) throw new Error('No API Key found');

    const modelId = 'gemini-1.5-flash'; // Forzamos flash por velocidad en diseño
    
    // Preparar contexto: Flujo actual y Skills disponibles
    const currentFlow = JSON.stringify(this.botFlow.flow_data);
    const availableSkills = this.skillsCatalog.map(s => `- ${s.name}: ${s.description}`).join('\n');

    const systemPrompt = `Eres el "Arquitecto de Flujos de Woox". Tu misión es ayudar al usuario a diseñar o refinar un chatbot.
Conoces todas las "Skills" (herramientas) disponibles en la plataforma.
Tu respuesta debe ser amable y profesional.

CONTEXTO ACTUAL:
- Skills Disponibles en Woox:
${availableSkills}

- Estructura actual del flujo (JSON):
${currentFlow}

REGLAS:
1. Si el usuario pide crear un flujo o modificarlo, explica qué vas a hacer.
2. Devuelve SIEMPRE el flujo COMPLETO actualizado dentro de un bloque de código JSON \` \` \`json ... \` \` \`.
3. Mantén la consistencia de los IDs de nodos existentes si solo estás añadiendo cosas.
4. Si necesitas usar una Skill, añade un nodo de tipo "ai_skill" y asegúrate de conectarlo al puerto "tools" de un nodo "ai_agent".
5. Los tipos de nodos válidos son: start, message, menu, question, ai_agent, ai_skill.
6. Ajusta las posiciones (x, y) para que el diseño se vea ordenado.`;

    const body = {
      contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\nSolicitud del Usuario: ${userRequest}` }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 2000 }
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;
    const response = await fetch(url, { method: 'POST', body: JSON.stringify(body) });
    const data = await response.json();

    if (data.error) throw new Error(data.error.message);
    return { text: data.candidates[0].content.parts[0].text };
  }

  // ─────────────────────────────────────────────────────────────
  // 🤖 Motor del Agente IA en el Simulador: Gemini + Function Calling
  // ─────────────────────────────────────────────────────────────
  private async runGeminiAgentSim(userMessage: string, agentNode: FlowNode): Promise<{ text: string, meta?: any }> {
    const startTime = performance.now();
    // 1. Obtener API Key — Priorizar Merchant, fallback a Plataforma
    let apiKey: string | undefined;
    if (this.merchantId) {
      const { data: merchantData } = await this.supabase.getMerchantById(this.merchantId);
      if (merchantData?.ai_api_key) apiKey = merchantData.ai_api_key;
    }
    if (!apiKey) {
      const { data: settings } = await this.supabase.getPlatformSettings();
      apiKey = settings?.ai_api_key;
    }
    if (!apiKey) throw new Error('No API Key found');

    // 2. Determinar modelo
    let finalModel = 'gemini-1.5-flash';
    if (this.merchantId) {
      const { data: mData } = await this.supabase.getMerchantById(this.merchantId);
      if (mData?.ai_model) finalModel = mData.ai_model;
      else if (agentNode.data.model) finalModel = agentNode.data.model;
    }
    const modelId = finalModel.replace('models/', '');

    // 3. Preparar Herramientas (Skills)
    const skills = this.botFlow.flow_data.nodes.filter(n => n.type === 'ai_skill');
    const TOOL_DEFS: any = {
      catalog_search: { name: 'catalog_search', description: 'Busca productos', parameters: { type: 'object', properties: { query: { type: 'string' } } } },
      add_to_cart: { name: 'add_to_cart', description: 'Añade al carrito. Usa el nombre exacto que devolvió el catálogo.', parameters: { type: 'object', properties: { product_name: { type: 'string' }, quantity: { type: 'number' } }, required: ['product_name'] } },
      get_cart: { name: 'get_cart', description: 'Ver carrito y total', parameters: { type: 'object', properties: {} } },
      register_order: { 
        name: 'register_order', 
        description: 'Finaliza el pedido. REQUIERE: Nombre completo, Dirección exacta y Teléfono.', 
        parameters: { 
          type: 'object', 
          properties: { 
            customer_name: { type: 'string' },
            delivery_address: { type: 'string' },
            phone: { type: 'string' }
          }, 
          required: ['customer_name', 'delivery_address', 'phone'] 
        } 
      },
      knowledge_base: { 
        name: 'knowledge_base', 
        description: 'Busca en la base de conocimiento información sobre la empresa, horarios, políticas o dudas generales.', 
        parameters: { 
          type: 'object', 
          properties: { 
            query: { type: 'string', description: 'Lo que quieres buscar en el conocimiento.' } 
          },
          required: ['query']
        } 
      }
    };

    const functionDeclarations: any[] = [];
    for (const skill of skills) {
      const actionType = skill.data.actionType || '';
      const def = TOOL_DEFS[actionType];
      if (def) {
        const customized = { ...def };
        if (skill.data.message) customized.description = skill.data.message;
        if (!functionDeclarations.find(d => d.name === customized.name)) functionDeclarations.push(customized);
      }
    }

    // 4. System Prompt
    const cart = this.simulationState.variables['cart'] || [];
    const cartSummary = cart.length > 0 ? cart.map((it: any) => `${it.name} x${it.qty}`).join(', ') : 'vacío';
    const basePrompt = agentNode.data.prompt || `Eres un asistente de ventas de ${this.merchantName}.`;
    const systemPrompt = `${basePrompt}
    \n## FLUJO DE VENTAS OBLIGATORIO:
    1. **Búsqueda**: Usa 'catalog_search' para mostrar opciones.
    2. **Carrito**: Usa 'add_to_cart' para añadir lo que el usuario pida.
    3. **Resumen**: Cuando el usuario no quiera más, muestra el resumen del pedido (usa 'get_cart').
    4. **Datos del cliente**: Tras la confirmación del resumen, es OBLIGATORIO pedir: **Nombre Completo**, **Dirección Exacta** y **Teléfono Celular**.
    5. **Registro**: SOLO cuando tengas los 3 datos, llama a 'register_order'.
    ## REGLAS RELEVANTES:
    1. **SIEMPRE BUSCAR**: Si mencionan algo que podría ser un producto, búscalo usando 'catalog_search'. No asumas que no existe sin buscar.
    - Actualmente el carrito tiene: [${cartSummary}].
    - Sé amable y persuasivo para cerrar la venta.`;

    // 5. Llamada a la API
    // 5. Llamada a la API - Filtrar historial para NO incluir mensajes técnicos del simulador
    const history = this.chatMessages
      .filter(m => !m.text.startsWith('🧠') && !m.text.startsWith('⚙️'))
      .slice(-6) // Reducimos a 6 mensajes para ahorrar tokens y mantener foco
      .map(m => ({
        role: m.sender === 'user' ? 'user' : 'model',
        parts: [{ text: m.text }]
      }));

    const usedVersion = 'v1beta';
    const usedUrl = `https://generativelanguage.googleapis.com/${usedVersion}/models/${modelId}:generateContent?key=${apiKey}`;

    const requestBody: any = {
      contents: [...history, { role: 'user', parts: [{ text: userMessage }] }],
      system_instruction: { parts: [{ text: systemPrompt }] },
      tools: functionDeclarations.length > 0 ? [{ function_declarations: functionDeclarations }] : []
    };

    const response = await fetch(usedUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'Error en Gemini');

    const tokens = data.usageMetadata?.totalTokenCount || 0;
    const parts = data.candidates?.[0]?.content?.parts || [];
    const textPart = parts.find((p: any) => p.text);
    const toolCalls = parts.filter((p: any) => p.functionCall);

    if (toolCalls.length > 0) {
        const toolResults: any[] = [];
        for (const call of toolCalls) {
          const tName = call.functionCall.name;
          const skillNode = skills.find(s => TOOL_DEFS[s.data.actionType || '']?.name === tName);
          
          if (skillNode) { 
            this.activeToolNodeId = skillNode.id; 
            // Registrar ejecución del nodo de skill
            this.recordNodeExecution(skillNode);
            this.cdr.detectChanges(); 
          }
          
          const result = await this.executeSimTool(tName, call.functionCall.args);
          setTimeout(() => { this.activeToolNodeId = null; this.cdr.detectChanges(); }, 2000);
        
        toolResults.push({ functionResponse: { name: tName, response: { content: result } } });
      }

      const secondBody = { contents: [...history, data.candidates[0].content, { role: 'user', parts: toolResults }] };
      const secondResp = await fetch(usedUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(secondBody) });
      const secondData = await secondResp.json();
      // En lugar de sumar, usamos el total del segundo paso que ya incluye el contexto del primero
      const finalTokens = secondData.usageMetadata?.totalTokenCount || tokens;
      return { 
        text: secondData.candidates?.[0]?.content?.parts?.[0]?.text || '', 
        meta: { tokens: finalTokens, time: Math.round(performance.now() - startTime) } 
      };
    }

    return { 
      text: textPart?.text || '', 
      meta: { tokens, time: Math.round(performance.now() - startTime) } 
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 🛠️ Ejecución local de herramientas en el simulador
  // ─────────────────────────────────────────────────────────────
  private async executeSimTool(toolName: string, args: any): Promise<string> {
    // Cargar cache si está vacío para evitar lentitud
    if (!this.catalogCache || !this.categoryCache) {
      console.log('[SIM] Cargando cache inicial...');
      const { data: p } = await this.supabase.getProducts(this.merchantId);
      const { data: c } = await this.supabase.getCategories(this.merchantId);
      this.catalogCache = p || [];
      this.categoryCache = c || [];
    }

    const normalize = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");

    switch (toolName) {
      case 'catalog_search': {
        const queryOriginal = (args?.query || '').toLowerCase().trim();
        const query = queryOriginal.endsWith('s') ? queryOriginal.slice(0, -1) : queryOriginal;
        const products = this.catalogCache || [];
        const cats = this.categoryCache || [];
        const filtered = products.filter((p: any) => {
          const nameMatch = p.name.toLowerCase().includes(query);
          const descMatch = (p.description || '').toLowerCase().includes(query);
          const cat = cats.find(c => c.id === p.category_id);
          const catMatch = (cat?.name || '').toLowerCase().includes(query);
          return nameMatch || descMatch || catMatch || query === '';
        }).slice(0, 10);

        if (!filtered.length) {
          return `🔍 No encontré productos que coincidan con "${queryOriginal}". ¿Puedes probar con otro término?`;
        }
        
        const listHeader = queryOriginal === '' ? '📋 **Nuestro Menú Completo:**' : `🔍 **Resultados para "${queryOriginal}":**`;
        const listBody = filtered.map((p: any) => {
          const nameLower = p.name.toLowerCase();
          let icon = '🍕'; // Default food
          if (nameLower.includes('pizza')) icon = '🍕';
          else if (nameLower.includes('coca') || nameLower.includes('bebida') || nameLower.includes('jugo')) icon = '🥤';
          else if (nameLower.includes('hawaiana')) icon = '🍍';
          else if (nameLower.includes('pep') || nameLower.includes('carne')) icon = '🍖';
          else if (nameLower.includes('queso') || nameLower.includes('margherita')) icon = '🧀';
          else if (nameLower.includes('entr')) icon = '🥗';
          
          return `${icon} **${p.name}**\n   └ _Precio: $${p.price.toLocaleString()}_`;
        }).join('\n\n');

        return `${listHeader}\n\n${listBody}\n\n¿Cuál de estas opciones te gustaría pedir?`;
      }

      case 'inventory_check': {
        const query = (args?.query || '').toLowerCase().trim();
        const products = this.catalogCache || [];
        const prod = products.find((p: any) => p.name.toLowerCase().includes(query)) ||
                     products.find((p: any) => query.includes(p.name.toLowerCase()));
        if (!prod) return `No encontré "${query}" en el catálogo.`;
        return prod.stock > 0
          ? `✅ ${prod.name}: ${prod.stock} unidades disponibles a $${prod.price}`
          : `❌ ${prod.name}: Sin stock disponible actualmente.`;
      }

      case 'add_to_cart': {
        const productName = (args?.product_name || args?.query || '').toLowerCase().trim();
        const quantity = parseInt(args?.quantity) || 1;
        const products = this.catalogCache || [];
        const normSearch = normalize(productName);
        let prod = products.find(p => normalize(p.name) === normSearch) ||
                   products.find(p => normalize(p.name).startsWith(normSearch)) ||
                   products.find(p => normalize(p.name).includes(normSearch));

        if (!prod) return `ERROR: El producto "${productName}" no existe en el catálogo. Por favor, verifica el nombre con 'catalog_search'.`;
        const cart = this.simulationState.variables['cart'] || [];
        const existing = cart.find((i: any) => i.id === prod.id);
        if (existing) { existing.qty += quantity; }
        else { cart.push({ id: prod.id, name: prod.name, price: prod.price, qty: quantity }); }
        this.simulationState.variables['cart'] = [...cart];
        const total = cart.reduce((acc: number, it: any) => acc + (it.price * it.qty), 0);
        return `✅ ${prod.name} x${quantity} añadido. Total carrito: $${total.toFixed(2)}`;
      }

      case 'get_cart': {
        const cart = this.simulationState.variables['cart'] || [];
        if (!cart.length) return 'Tu carrito está vacío. ¿Te gustaría ver el menú?';
        const total = cart.reduce((acc: number, it: any) => acc + (it.price * it.qty), 0);
        return `🛒 Tu carrito:\n${cart.map((it: any) => `• ${it.name} x${it.qty} = $${(it.price * it.qty).toFixed(2)}`).join('\n')}\n\n💰 Total: $${total.toFixed(2)}`;
      }

      case 'remove_from_cart': {
        const name = args?.product_name || '';
        const cart = this.simulationState.variables['cart'] || [];
        const before = cart.length;
        this.simulationState.variables['cart'] = cart.filter((it: any) =>
          !it.name.toLowerCase().includes(name.toLowerCase())
        );
        return this.simulationState.variables['cart'].length < before
          ? `✅ "${name}" eliminado del carrito.`
          : `No encontré "${name}" en tu carrito.`;
      }

      case 'register_order': {
        const cart = this.simulationState.variables['cart'] || [];
        if (!cart.length) return 'ERROR: El carrito está vacío. No se puede registrar.';
        const { customer_name, delivery_address, phone } = args;
        if (!customer_name || !delivery_address || !phone) return 'ERROR: Faltan datos (Nombre, Dirección o Teléfono).';
        const orderNum = `#SIM-${Math.floor(Math.random() * 9000) + 1000}`;
        this.simulationState.variables['orderNumber'] = orderNum;
        this.simulationState.variables['cart'] = [];
        return `SUCCESS: Pedido ${orderNum} registrado para ${customer_name}. Total pagado.`;
      }

      case 'knowledge_base': {
        const query = args?.query || '';
        if (!query) return 'Dime qué quieres buscar en el conocimiento.';
        const { data: settings } = await this.supabase.getPlatformSettings();
        const vector = await this.supabase.generateEmbedding(query, settings);
        if (!vector) return 'Error: Vectorización no disponible.';
        const { data: matches } = await this.supabase.searchKnowledgeBase(this.merchantId, vector, 0.4, 4);
        if (!matches || (matches as any[]).length === 0) return 'No hay información específica sobre eso.';
        const context = (matches as any[]).map((m: any) => `[Conocimiento]: ${m.content}`).join('\n\n');
        return `Información encontrada:\n\n${context}`;
      }

      case 'order_status': {
        const orderNum = this.simulationState.variables['orderNumber'];
        return orderNum ? `📦 Pedido ${orderNum}: Estado "En preparación" 🍳` : 'No hay pedidos activos.';
      }

      case 'transfer_human':
        return '👤 Conectándote con un humano...';

      default:
        return `Ejecutada herramienta: ${toolName}`;
    }
  }

  private async moveToNextNode(nextId: string | null, depth: number = 0) {
    if (nextId) {
      const nextNode = this.botFlow.flow_data.nodes.find(n => n.id === nextId);
      if (nextNode) {
        this.simulationState.currentNodeId = nextNode.id;
        await this.advanceSimulation(nextNode, depth + 1);
      }
    } else {
      this.chatMessages.push({ text: '🏁 Flujo finalizado. ¡Gracias!', sender: 'bot', meta: { tokens: 0, time: 0 } });
      this.activeSimNodeId = null;
      this.simulationState.currentNodeId = null;
    }
  }

  private async advanceSimulation(node: FlowNode, depth: number = 0) {
    if (depth > 50) {
      this.chatMessages.push({ text: '⚠️ [Seguridad] Se detuvo el avance automático por posible bucle infinito.', sender: 'bot', meta: { tokens: 0, time: 0 } });
      return;
    }
    
    // Resaltar nodo activo y registrar ejecución
    this.activeSimNodeId = node.id;
    this.recordNodeExecution(node);
    this.cdr.detectChanges();


    console.log('Avance Simulación:', node.id, node.type);

    // Ejecutar acciones primero
    if (node.type === 'action') {
      await this.executeSimAction(node.data);
    }

    // Bloque condition: evaluar y seguir automáticamente
    if (node.type === 'condition') {
      const varName = node.data.variable || '';
      const operator = node.data.operator || '==';
      const targetVal = node.data.value || '';
      const actualVal = this.simulationState.variables[varName] ?? '';
      const result = this.evaluateCondition(operator, String(actualVal), targetVal);
      const port = result ? 'yes' : 'no';
      const nextId = this.findNextNodeId(node.id, port);
      await this.moveToNextNode(nextId, depth);
      return; // No mostrar nada, solo redirigir
    }

    // Bloque AI Agent: simular respuesta de IA
    if (node.type === 'ai_agent') {
      // 🧠 Buscar skills conectadas para mostrar en simulación
      const skillConns = this.botFlow.flow_data.connections.filter(c => c.to === node.id && c.toPort === 'skills_in');
      const skillsNames = skillConns.map(c => {
        const sNode = this.botFlow.flow_data.nodes.find(n => n.id === c.from);
        return sNode ? `🛠️ ${sNode.data.actionType}` : null;
      }).filter(n => n).join(', ');

      const simTokens = Math.floor(Math.random() * 50) + 50;
      this.chatMessages.push({ 
        text: `🧠 [Simulador]: Sistema "${node.data.label}" activado.\n${skillsNames ? 'Herramientas: ' + skillsNames : 'Sin herramientas.'}`, 
        sender: 'bot',
        meta: { tokens: simTokens, time: 200 }
      });
      
      this.simulationState.currentNodeId = node.id;
      return; // PAUSAR AQUÍ para que el usuario escriba a la IA
    }

    const startMs = performance.now();
    const messages = this.collectSimulationMessages(node);
    
    // Simular un tiempo de respuesta más "humano" / IA
    // Si es un bot determinista, el tiempo es el jitter. Si es IA, sería más.
    const jitter = Math.floor(Math.random() * 500) + 100;
    const execMs = Math.max(jitter, Math.round(performance.now() - startMs));
    if (messages.length > 0) {
      this.isBotTyping = true;
      setTimeout(() => this.scrollChatToBottom(), 50);
      
      setTimeout(async () => {
        this.isBotTyping = false;
        messages.forEach(m => this.chatMessages.push({ text: m, sender: 'bot', meta: { tokens: 0, time: execMs } }));
        this.cdr.detectChanges();
        setTimeout(() => this.scrollChatToBottom(), 50);

        // Continuar automáticamente en nodos de paso
        const autoAdvanceTypes = ['start', 'message', 'action', 'logic'];
        if (autoAdvanceTypes.includes(node.type)) {
          const nextId = this.findNextNodeId(node.id, 'output');
          if (nextId) await this.moveToNextNode(nextId, depth + 1);
        }
      }, 800);
    } else if (node.type === 'start' || node.type === 'message') {
      // Si no tiene mensaje pero es start/message, pasar al siguiente de una vez
      const nextId = this.findNextNodeId(node.id, 'output');
      if (nextId) await this.moveToNextNode(nextId, depth + 1);
    }
  }

  // =====================================================================
  // EXECUTION TRACKING METHODS (n8n-style)
  // =====================================================================

  /** Registra la ejecuci\u00f3n de un nodo: actualiza el contador, el log y dispara el badge temporal */
  private recordNodeExecution(node: FlowNode) {
    // 1. Actualizar contador acumulado
    const prev = this.nodeExecutionCounts.get(node.id) || 0;
    this.nodeExecutionCounts.set(node.id, prev + 1);
    this.totalSessionExecutions++;

    // 2. Marcar conexi\u00f3n activa (la que viene del \u00faltimo nodo)
    this.activeConnectionSourceId = this.lastExecutedNodeId;
    this.lastExecutedNodeId = node.id;

    // 3. Badge temporal de \u2713 (aparece y desaparece en 800ms)
    this.justExecutedNodeId = node.id;
    setTimeout(() => {
      if (this.justExecutedNodeId === node.id) {
        this.justExecutedNodeId = null;
        this.cdr.detectChanges();
      }
    }, 900);

    // 4. Limpiar conexi\u00f3n activa despu\u00e9s de la animaci\u00f3n
    setTimeout(() => {
      this.activeConnectionSourceId = null;
      this.cdr.detectChanges();
    }, 700);

    // 5. A\u00f1adir al log de sesi\u00f3n (max 30 entradas)
    this.sessionExecutionLog.unshift({
      nodeId: node.id,
      nodeLabel: node.data?.label || node.type,
      nodeType: node.type,
      timestamp: new Date(),
      totalCount: this.nodeExecutionCounts.get(node.id) || 1
    });
    if (this.sessionExecutionLog.length > 30) {
      this.sessionExecutionLog.pop();
    }
  }

  /** Resetea todo el tracking de la sesi\u00f3n */
  clearSimulatorSession() {
    this.nodeExecutionCounts.clear();
    this.sessionExecutionLog = [];
    this.lastExecutedNodeId = null;
    this.justExecutedNodeId = null;
    this.activeConnectionSourceId = null;
    this.totalSessionExecutions = 0;
  }

  /** Obtiene el contador de ejecuciones de un nodo (para usarlo en el template) */
  getNodeExecutionCount(nodeId: string): number {
    return this.nodeExecutionCounts.get(nodeId) || 0;
  }

  /** Verifica si una conexi\u00f3n est\u00e1 activa (datos viajando por ella) */
  isConnectionActive(conn: any): boolean {
    return conn.sourceId === this.activeConnectionSourceId;
  }

  /** Label del nodo actualmente activo en el simulador */
  getActiveNodeLabel(): string {
    if (!this.activeSimNodeId) return '—';
    const n = this.botFlow.flow_data.nodes?.find(n => n.id === this.activeSimNodeId);
    return n?.data?.label || n?.type || '—';
  }

  /** N\u00famero de variables en el estado actual de simulaci\u00f3n */
  getVariableCount(): number {
    return Object.keys(this.simulationState.variables || {}).length;
  }

  private evaluateCondition(operator: string, actual: string, target: string): boolean {
    const a = (actual || '').toLowerCase().trim();
    const b = (target || '').toLowerCase().trim();
    switch (operator) {
      case '==': return a === b;
      case '!=': return a !== b;
      case 'contains': return a.includes(b);
      case '>': return Number(actual) > Number(target);
      case '<': return Number(actual) < Number(target);
      case 'exists': return actual !== undefined && actual !== null && actual !== '';
      default: return false;
    }
  }

  private async executeSimAction(data: any) {
    const t0 = performance.now();
    if (data.actionType === 'empty_cart') {
      this.simulationState.variables['cart'] = [];
      this.simulationState.variables['orderNumber'] = '';
      // No pusheamos mensaje aquí, el nodo 'action' ya lo mostrará si tiene uno definido.
      return;
    }
    if (data.actionType === 'transfer_human') {
      const execMs = Math.max(1, Math.round(performance.now() - t0));
      this.chatMessages.push({ text: '👤 Transfiriendo a un agente humano... Un representante te atenderá pronto.', sender: 'bot', meta: { tokens: 0, time: execMs } });
      this.simulationState.currentNodeId = null; // Terminar simulación
      this.activeSimNodeId = null;
      return;
    }
    if (data.actionType === 'tag_customer') {
      const execMs = Math.max(1, Math.round(performance.now() - t0));
      this.chatMessages.push({ text: `🏷️ [Simulación] Se etiquetaría al cliente con: "${data.params?.tag || 'tag'}".`, sender: 'bot', meta: { tokens: 0, time: execMs } });
      return;
    }
    if (data.actionType === 'add_to_cart') {
      const productId = data.params?.product_id;
      if (productId) {
        // Intentar obtener info del producto de la lista cargada (si existe)
        this.supabase.getProducts(this.merchantId).then(({data: products}) => {
          const product = (products || []).find(p => p.id === productId);
          if (product) {
            const qty = 1;
            if (!this.simulationState.variables['cart']) this.simulationState.variables['cart'] = [];
            const existing = this.simulationState.variables['cart'].find((i: any) => i.id === product.id);
            if (existing) { existing.qty += qty; }
            else { this.simulationState.variables['cart'].push({ id: product.id, name: product.name, price: product.price, qty }); }
            const execMs = Math.max(1, Math.round(performance.now() - t0));
            this.chatMessages.push({ text: `🛒 ¡Añadido al carrito con éxito!: ${product.name} (x${qty})`, sender: 'bot', meta: { tokens: 0, time: execMs } });
          } else {
            const execMs = Math.max(1, Math.round(performance.now() - t0));
            this.chatMessages.push({ text: `⚠️ No se encontró el producto para añadir.`, sender: 'bot', meta: { tokens: 0, time: execMs } });
          }
        });
      }
      return;
    }

    if (data.actionType === 'register_order') {
      // El mensaje "⚙️ Registrando Pedido..." ya lo mostrará el nodo automáticamente

      try {
        const vars = this.simulationState.variables;
        const cart = vars['cart'] || [];
        const total = cart.reduce((acc: number, it: any) => acc + (Number(it.price) * it.qty), 0);

        // 1. Preparar tareas en paralelo con IDs limpios
        let customerId = localStorage.getItem('last_test_customer_id');
        // Validar que sea un UUID real, si no, tratar como null
        if (customerId && !this.supabase.isValidUUID(customerId)) {
          customerId = null;
        }

        const tasks: Promise<any>[] = [];

        if (customerId && (vars['customer_name'] || vars['phone'])) {
          tasks.push(this.supabase.updateCustomerCRM(customerId || '', {
            full_name: vars['customer_name'],
            phone: vars['phone'],
            address: vars['direccion_entrega']
          }));
        }

        let orderRes;
        const orderDataFull = {
          merchant_id: this.merchantId,
          customer_id: customerId || null,
          total: total,
          delivery_address: `${vars['direccion_entrega'] || 'No proporcionada'} - Notas: ${vars['notas_entrega'] || 'Sin notas'}`,
          status: 'pending',
          source: 'bot_builder_test',
          internal_note: `Instrucciones adicionales: ${vars['notas_entrega'] || 'Ninguna'}. VarDump: ${JSON.stringify(vars)}`,
          closing_agent_type: 'bot'
        };

        orderRes = await this.supabase.createOrder(orderDataFull);

        // Fallback: Si falla por columnas inexistentes (ej. internal_note), reintentar con esquema básico
        if (orderRes.error && (orderRes.error.message.includes('column') || orderRes.error.message.includes('cache'))) {
           console.warn('⚠️ Detectado esquema antiguo en DB. Reintentando registro básico...');
           const orderDataBasic = {
             merchant_id: this.merchantId,
             customer_id: customerId || null,
             total: total,
             delivery_address: vars['direccion_entrega'] || 'No proporcionada',
             status: 'pending'
           };
           orderRes = await this.supabase.createOrder(orderDataBasic);
        }

        if (orderRes && orderRes.data) {
          const order = orderRes.data;
          const orderNum = order.order_number || order.id.substring(0, 8);
          this.simulationState.variables['orderNumber'] = `#${orderNum}`;
          this.simulationState.variables['order_number'] = `#${orderNum}`; 

          // 3. Registrar Items con notas
          if (cart.length > 0) {
            const items = cart.map((it: any) => ({
              order_id: order.id,
              product_id: it.id,
              product_name: it.note ? `${it.name} (${it.note})` : it.name,
              quantity: it.qty,
              unit_price: it.price,
              subtotal: it.price * it.qty,
              note: it.note || '' // Incluir si la columna existe, si no, se ignorará
            }));
            await this.supabase.createOrderItems(items);
          }
        } else {
          // Si no hay data, algo falló en la inserción
          const errorMsg = orderRes?.error?.message || 'Error desconocido al insertar en DB';
          const errorMs = Math.max(1, Math.round(performance.now() - t0));
          this.chatMessages.push({ text: `❌ No se pudo guardar el pedido real: ${errorMsg}`, sender: 'bot', meta: { tokens: 0, time: errorMs } });
          this.simulationState.variables['orderNumber'] = `[FALLO_REGISTRO]`;
        }
      } catch (err: any) {
        console.error('Error en simulación de registro:', err);
        const errorMs = Math.max(1, Math.round(performance.now() - t0));
        this.chatMessages.push({ text: `❌ Excepción: ${err.message || 'Error desconocido'}`, sender: 'bot', meta: { tokens: 0, time: errorMs } });
      }
    }
  }

  private scrollChatToBottom() {
    if (this.chatScrollRef) {
      this.chatScrollRef.nativeElement.scrollTop = this.chatScrollRef.nativeElement.scrollHeight;
    }
  }

  private scrollToArchitectBottom() {
    setTimeout(() => {
      const chatContainer = document.querySelector('.architect-chat-messages');
      if (chatContainer) {
        chatContainer.scrollTop = chatContainer.scrollHeight;
      }
    }, 50);
  }

  // --- UTILS ---
  showSuccess(msg: string) {
    // Podríamos usar un snackbar, por ahora console + alert para no romper nada
    console.log('✅ Success:', msg);
  }

  showError(msg: string) {
    console.error('❌ Error:', msg);
    alert(msg);
  }

  private collectSimulationMessages(node: FlowNode): string[] {
    const msgs: string[] = [];
    if (!node.data.message && node.type !== 'menu') return [];

    let msg = this.resolveSimVariables(node.data.message || '');
    
    // Si es un menú, añadir las opciones al mensaje
    if (node.type === 'menu' && node.data.options) {
      const optionsText = node.data.options.map((o: any, i: number) => `${i + 1}. ${o.text}`).join('\n');
      msg += (msg ? '\n\n' : '') + optionsText;
    }
    
    if (msg) msgs.push(msg);

    // Actualizar el nodo actual en el estado para peticiones de entrada
    if (node.type === 'question' || node.type === 'menu' || node.type === 'ai_agent') {
      this.simulationState.currentNodeId = node.id;
    }

    return msgs;
  }

  private findNextNodeId(fromId: string, fromPort: string): string | null {
    const conn = this.botFlow.flow_data.connections.find(c => c.from === fromId && c.fromPort === fromPort);
    return conn ? conn.to : null;
  }

  private resolveSimVariables(text: string): string {
    if (!text) return '';
    let result = text;
    
    // 1. Generar resumen del carrito
    if (result.includes('{{cartSummary}}')) {
      const cart = this.simulationState.variables['cart'] || [];
      if (cart.length === 0) {
        result = result.replace(/{{cartSummary}}/g, '_El carrito está vacío_');
      } else {
        const summary = cart.map((it: any) => {
          const unit = Number(it.price) || 0;
          const subtotal = unit * it.qty;
          let text = `- ${it.name} x${it.qty} ($${unit.toLocaleString()} c/u) → *$${subtotal.toLocaleString()}*`;
          if (it.note) text += `\n  └ _Instrucciones: ${it.note}_`;
          return text;
        }).join('\n');
        
        const total = cart.reduce((acc: number, it: any) => acc + (Number(it.price) * it.qty), 0);
        result = result.replace(/{{cartSummary}}/g, `${summary}\n\n💰 *Total: $${total.toLocaleString()}*`);
      }
    }

    // 2. Reemplazar variables dinámicas {{variable}}
    result = result.replace(/{{(.*?)}}/g, (match, key) => {
      const k = key.trim();
      
      // Intentar obtener de variables
      const vars = this.simulationState.variables || {};
      const varKey = Object.keys(vars).find(v => v.toLowerCase() === k.toLowerCase());
      
      if (varKey && vars[varKey] !== undefined && vars[varKey] !== null) {
        return String(vars[varKey]);
      }
      
      // Fallbacks especiales
      const lowerKey = k.toLowerCase();
      if (lowerKey === 'merchantname') return this.merchantName;
      if (lowerKey === 'ordernumber' || lowerKey === 'order_number') return '#T-1000' + Math.floor(Math.random()*9); 
      
      return match;
    });

    return result;
  }

  async testFlow() {
      this.toggleChat();
  }

  // --- RESIZE SIDEBAR ---
  startResizing(event: MouseEvent) {
    this.isResizing = true;
    document.body.style.cursor = 'col-resize';
    event.preventDefault();
    
    const startX = event.clientX;
    const startWidth = this.sidebarWidth;
    
    const mouseMoveHandler = (e: MouseEvent) => {
      const deltaX = startX - e.clientX; 
      const newWidth = Math.max(250, Math.min(window.innerWidth * 0.85, startWidth + deltaX));
      
      this.sidebarWidth = newWidth;
    };
    
    const mouseUpHandler = () => {
      this.isResizing = false;
      document.body.style.cursor = 'default';
      window.removeEventListener('mousemove', mouseMoveHandler);
      window.removeEventListener('mouseup', mouseUpHandler);
    };
    
    window.addEventListener('mousemove', mouseMoveHandler);
    window.addEventListener('mouseup', mouseUpHandler);
  }
}
