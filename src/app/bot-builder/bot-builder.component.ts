import { Component, OnInit, ElementRef, ViewChild, inject, HostListener, ChangeDetectorRef, NgZone, signal, ApplicationRef, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../supabase.service';
import { NotificationService } from '../notification.service';
import { FlowNode, FlowConnection, FlowData, BotFlow } from './models/bot-flow.model';
import { BotRuntimeService } from './services/bot-runtime.service';

@Component({
  selector: 'app-bot-builder',
  standalone: true,
  imports: [CommonModule, FormsModule],
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
  templateToConfirm: 'products' | 'services' | 'ia_catalog' | null = null;
  templates: { id: 'ia_catalog' | 'products' | 'services', name: string, icon: string, description: string }[] = [
    { id: 'ia_catalog', name: 'Catálogo Inteligente con IA', icon: '🧠', description: 'Usa Agente IA y Skills para vender' },
    { id: 'products', name: 'Catálogo de Productos', icon: '📦', description: 'Flujo tradicional con botones' },
    { id: 'services', name: 'Menú de Servicios/Reservas', icon: '📅', description: 'Ideal para agendar citas' }
  ];

  // Palette definition
  paletteItems = [
    { type: 'start', label: 'Inicio', icon: '🟢', description: 'Inicio del flujo' },
    { type: 'message', label: 'Mensaje', icon: '💬', description: 'Enviar texto' },
    { type: 'question', label: 'Pregunta', icon: '❓', description: 'Capturar respuesta' },
    { type: 'menu', label: 'Menú', icon: '📋', description: 'Opciones múltiples' },
    { type: 'condition', label: 'Condición', icon: '🔀', description: 'Divide el flujo según variables.' },
    { type: 'ai_agent', label: 'Agente IA', icon: '🧠', description: 'IA Inteligente con Memoria' },
    { type: 'ai_skill', label: 'AI Skill', icon: '🛠️', description: 'Herramienta para el Agente IA' },
    { type: 'action', label: 'Acción', icon: '⚡', description: 'Ejecutar tarea' },
    { type: 'end', label: 'Fin', icon: '🛑', description: 'Terminar flujo' }
  ];

  // Chat Simulator State
  showTestChat: boolean = false;
  chatMessages: { text: string, sender: 'bot' | 'user' }[] = [];
  userChatInput: string = '';
  simulationState: { currentNodeId: string | null, variables: any } = { currentNodeId: null, variables: {} };
  activeSimNodeId: string | null = null; // Nodo resaltado en el canvas durante simulación
  
  // Connection delete state
  hoveredConnectionId: string | null = null;


  constructor() {}


  async ngOnInit() {
    this.merchantId = localStorage.getItem('active_merchant_id') || '';
    if (this.merchantId) {
      await this.loadFlow();
    }
  }

  // --- LOADING / SAVING ---
  async loadFlow() {
    // Obtener nombre del comercio para el header
    const { data: m } = await this.supabase.getMerchantById(this.merchantId);
    if (m) this.merchantName = m.name;

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

  selectTemplate(type: 'products' | 'services' | 'ia_catalog') {
    const nodeCount = this.botFlow.flow_data.nodes?.length || 0;
    if (nodeCount > 0) {
      this.templateToConfirm = type;
    } else {
      this.showTemplateModal = false;
      this.executeAutoGenerate(type);
    }
  }

  executeTemplate() {
    if (this.templateToConfirm) {
      const type = this.templateToConfirm;
      this.showTemplateModal = false;
      this.templateToConfirm = null;
      this.executeAutoGenerate(type);
    }
  }

  private async executeAutoGenerate(type: 'products' | 'services' | 'ia_catalog') {
    console.log('✅ executeAutoGenerate STARTED for:', type);
    
    // Todo el proceso debe estar dentro de la zona para que funcione la reactividad
    await this.zone.run(async () => {
      this.showConfirmModal = false;
      this.botFlow.flow_data = { nodes: [], connections: [] };
      this.selectedNode = null;
      this.cdr.detectChanges();

      try {
        if (type === 'products') {
          await this.generateProductFlow();
        } else if (type === 'services') {
          await this.generateServiceFlow();
        } else if (type === 'ia_catalog') {
          await this.generateIACatalogFlow();
        }
        
        console.log('✨ Flow generation completed successfully in memory');
        this.notification.show('✨ Flujo autogenerado con éxito', 'success');
        this.cdr.detectChanges();
      } catch (error) {
        console.error('Error autogenerating flow:', error);
        this.notification.show('Error al generar el flujo', 'error');
      }
    });
  }

  private async generateIACatalogFlow() {
    let x = 600;
    let y = 100;

    // 1. Inicio
    const startNode = this.createSpecificNode('start', x, y, { 
      label: 'Bienvenida IA', 
      message: '¡Hola! Bienvenido a {{merchantName}}. 👋\nSoy tu asistente inteligente. ¿Cómo te puedo ayudar hoy?' 
    });
    y += 180;

    // 2. Agente IA (Cerebro)
    const aiAgentNode = this.createSpecificNode('ai_agent', x, y, { 
      label: 'Asistente de Ventas', 
      prompt: 'Eres un asistente experto en ventas para {{merchantName}}. Ayuda al cliente a buscar productos, consultar stock y gestionar su pedido.',
      user_prompt: 'Mensaje del cliente: {{message}}',
      model: 'gemini-1.5-flash',
      temperature: 0.7,
      memory_limit: 6
    });
    this.connectNodes(startNode.id, 'output', aiAgentNode.id, 'input');

    // 3. Herramientas (Skills) - Posicionadas bajo el agente
    const skillCatalog = this.createSpecificNode('ai_skill', x - 250, y + 250, { 
      label: 'Búsqueda Catálogo', 
      actionType: 'catalog_search',
      message: 'Úsalo para buscar productos por nombre o descripción en nuestra tienda.'
    });

    const skillStock = this.createSpecificNode('ai_skill', x, y + 250, { 
      label: 'Consultar Stock', 
      actionType: 'inventory_check',
      message: 'Úsalo para verificar si tenemos unidades disponibles de un producto específico.'
    });

    const skillCart = this.createSpecificNode('ai_skill', x + 250, y + 250, { 
      label: 'Gestionar Carrito', 
      actionType: 'shopping_cart',
      message: 'Úsalo para ver qué productos ha añadido el cliente o vaciar el carrito.'
    });

    const skillOrder = this.createSpecificNode('ai_skill', x + 500, y + 250, { 
      label: 'Estado de Pedido', 
      actionType: 'order_status',
      message: 'Úsalo para rastrear pedidos previos con el ID que proporcione el cliente.'
    });

    // 4. Salida del Agente (Opcional, puede ir a un fin o a un menú)
    const endNode = this.createSpecificNode('end', x, y + 500, {
      label: 'Cierre',
      message: '¿Hay algo más en lo que te pueda ayudar?'
    });
    this.connectNodes(aiAgentNode.id, 'output', endNode.id, 'input');

    // 5. Conectar Skills al Agente (Puerto inferior TOOLS)
    this.connectNodes(skillCatalog.id, 'skill_out', aiAgentNode.id, 'skills_in');
    this.connectNodes(skillStock.id, 'skill_out', aiAgentNode.id, 'skills_in');
    this.connectNodes(skillCart.id, 'skill_out', aiAgentNode.id, 'skills_in');
    this.connectNodes(skillOrder.id, 'skill_out', aiAgentNode.id, 'skills_in');

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
    
    this.connectNodes(decisionNode.id, 'opt_finish', nameNode.id, 'input');
    this.connectNodes(nameNode.id, 'output', phoneNode.id, 'input');
    this.connectNodes(phoneNode.id, 'output', addressNode.id, 'input');
    
    // 5. Acción Final: Registrar Pedido
    const actionNode = this.createSpecificNode('action', x + 800, y + 750, { label: 'Registrar Pedido', actionType: 'register_order' });
    this.connectNodes(addressNode.id, 'output', actionNode.id, 'input');

    const endNode = this.createSpecificNode('end', x + 800, y + 900, { 
      label: 'Despedida', 
      message: '¡Listo! Tu pedido {{orderNumber}} ha sido registrado con éxito. 🚀\n\nResumen final:\n{{cartSummary}}\nEntrega en: {{direccion_entrega}}\n\n¡Gracias por tu compra!' 
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

        // 8. Después de la cantidad, ir al nodo de confirmación y luego a la decisión
        this.connectNodes(qtyNode.id, 'output', addedConfirmNode.id, 'input');
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
        model: type === 'ai_agent' ? 'gemini-1.5-flash' : undefined,
        temperature: type === 'ai_agent' ? 0.7 : undefined,
        memory_limit: type === 'ai_agent' ? 4 : undefined,
        actionType: type === 'ai_skill' ? 'catalog_search' : undefined,
        params: type === 'ai_skill' ? {} : undefined
      }
    };
    this.botFlow.flow_data.nodes.push(newNode);
    this.selectedNode = newNode;
    this.editingNode = newNode;
    this.panelVisible = true;
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
      n.type !== 'start' && n.type !== 'ai_skill' && !connections.some(c => c.to === n.id)
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
      if (this.showTestChat && this.chatMessages.length === 0) {
        this.resetChat();
      }
      this.cdr.detectChanges();
    });
  }

  resetChat() {
    this.chatMessages = [];
    this.userChatInput = '';
    this.simulationState = {
      currentNodeId: null,
      variables: {
        cart: [],
        merchantName: this.merchantName
      }
    };
    this.activeSimNodeId = null;

    const startNode = this.botFlow.flow_data.nodes.find(n => n.type === 'start');
    if (startNode) {
      this.simulationState.currentNodeId = startNode.id;
      this.advanceSimulation(startNode);
    } else {
      this.chatMessages.push({ text: '🚫 No hay nodo de inicio configurado.', sender: 'bot' });
    }
  }


  async sendChatMessage() {
    if (!this.userChatInput.trim()) return;

    const input = this.userChatInput;
    this.chatMessages.push({ text: input, sender: 'user' });
    this.userChatInput = '';
    setTimeout(() => this.scrollChatToBottom(), 50);

    const currentNode = this.botFlow.flow_data.nodes.find(n => n.id === this.simulationState.currentNodeId);
    if (!currentNode) {
      this.chatMessages.push({ text: '⚠️ La sesión ha terminado. Pulsa Reiniciar para volver a empezar.', sender: 'bot' });
      return;
    }

    if (currentNode.type === 'question') {
      const varName = currentNode.data.variable || 'temp';
      this.simulationState.variables[varName] = input;

      if (varName === 'cantidad_actual' && this.simulationState.variables['last_product']) {
        const prod = this.simulationState.variables['last_product'];
        const qty = parseInt(input) || 1;
        if (!this.simulationState.variables['cart']) this.simulationState.variables['cart'] = [];
        const existing = this.simulationState.variables['cart'].find((i: any) => i.id === prod.id);
        if (existing) { existing.qty += qty; }
        else { this.simulationState.variables['cart'].push({ ...prod, qty }); }
        delete this.simulationState.variables['last_product'];
      }

      const nextId = this.findNextNodeId(currentNode.id, 'output');
      await this.moveToNextNode(nextId);
    }
    else if (currentNode.type === 'ai_agent') {
      // 🧠 Simulación de respuesta de IA basada en el input del usuario
      this.chatMessages.push({ 
        text: `🤖 [IA Respondiento a: "${input}"]: Basado en tu pregunta, estoy procesando una respuesta usando el modelo ${currentNode.data.model || 'Gemini'}...`, 
        sender: 'bot' 
      });
      
      // Simular un retraso para que parezca que la "IA" piensa
      setTimeout(async () => {
        const skillsCount = this.botFlow.flow_data.connections.filter(c => c.to === currentNode.id && c.toPort === 'skills_in').length;
        let response = "¡Hola! Entiendo perfectamente tu consulta. ";
        if (skillsCount > 0) {
          response += `He revisado mis herramientas (${skillsCount} conectadas) y puedo ayudarte con ello. `;
        }
        response += "Esta es una simulación de mi respuesta inteligente. ¿Deseas continuar?";
        
        this.chatMessages.push({ text: response, sender: 'bot' });
        
        const nextId = this.findNextNodeId(currentNode.id, 'output');
        await this.moveToNextNode(nextId);
      }, 800);
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
          let price = 0;
          if (valPrice) {
            price = parseFloat(valPrice);
          } else {
            // Fallback: extraer del texto si no viene en el value
            const priceStr = match.text.match(/\$?\s*([\d.]+)/)?.[1] || '0';
            // Si el string tiene más de un punto o no termina en .XX, probablemente sea separador de miles
            const parts = priceStr.split('.');
            if (parts.length > 2) {
              price = parseFloat(priceStr.replace(/\./g, ''));
            } else if (parts.length === 2 && parts[1].length !== 2) {
              price = parseFloat(priceStr.replace(/\./g, ''));
            } else {
              price = parseFloat(priceStr);
            }
          }

          this.simulationState.variables['last_product'] = {
            id: valId || match.value,
            name: match.text.split(' ($')[0],
            price: price
          };
        }
        const nextId = this.findNextNodeId(currentNode.id, match.id);
        await this.moveToNextNode(nextId);
      } else {
        this.chatMessages.push({ text: '❌ No reconocí esa opción. Escribe el número o el nombre de la opción.', sender: 'bot' });
      }
    }
  }

  private async moveToNextNode(nextId: string | null) {
    if (nextId) {
      const nextNode = this.botFlow.flow_data.nodes.find(n => n.id === nextId);
      if (nextNode) {
        this.simulationState.currentNodeId = nextNode.id;
        await this.advanceSimulation(nextNode);
      }
    } else {
      this.chatMessages.push({ text: '🏁 Flujo finalizado. ¡Gracias!', sender: 'bot' });
      this.activeSimNodeId = null;
    }
  }

  private async advanceSimulation(node: FlowNode) {
    this.activeSimNodeId = node.id; // Resaltar nodo activo en el canvas

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
      await this.moveToNextNode(nextId);
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

      this.chatMessages.push({ 
        text: `🧠 [Agente Inteligente]: "${node.data.label}" activo.\n${skillsNames ? 'Habilidades disponibles: ' + skillsNames : 'Sin herramientas conectadas.'}\n\n🤖 Escribe algo para que la IA te responda (simulación).`, 
        sender: 'bot' 
      });
      
      this.simulationState.currentNodeId = node.id;
      return; // PAUSAR AQUÍ para que el usuario escriba a la IA
    }

    const messages = this.collectSimulationMessages(node);
    messages.forEach(m => this.chatMessages.push({ text: m, sender: 'bot' }));
    setTimeout(() => this.scrollChatToBottom(), 50);
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
    if (data.actionType === 'empty_cart') {
      this.simulationState.variables['cart'] = [];
      this.simulationState.variables['orderNumber'] = '';
      this.chatMessages.push({ text: `🗑️ Carrito vaciado. Puedes iniciar de nuevo tu pedido.`, sender: 'bot' });
      // Continuar al siguiente nodo automáticamente
      const currentNode = this.botFlow.flow_data.nodes.find(n => n.id === this.simulationState.currentNodeId);
      if (currentNode) {
        const nextId = this.findNextNodeId(currentNode.id, 'output');
        if (nextId) await this.moveToNextNode(nextId);
      }
      return;
    }
    if (data.actionType === 'transfer_human') {
      this.chatMessages.push({ text: '👤 Transfiriendo a un agente humano... Un representante te atenderá pronto.', sender: 'bot' });
      this.simulationState.currentNodeId = null; // Terminar simulación
      this.activeSimNodeId = null;
      return;
    }
    if (data.actionType === 'tag_customer') {
      this.chatMessages.push({ text: `🏷️ [Simulación] Se etiquetaría al cliente con: "${data.params?.tag || 'tag'}".`, sender: 'bot' });
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
            this.chatMessages.push({ text: `🛒 Aadido al carrito: ${product.name}`, sender: 'bot' });
          } else {
            this.chatMessages.push({ text: `⚠️ No se encontró el producto para añadir.`, sender: 'bot' });
          }
        });
      }
      return;
    }

    if (data.actionType === 'register_order') {
      this.chatMessages.push({ text: `⚙️ Registrando Pedido...`, sender: 'bot' });

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
          delivery_address: vars['direccion_entrega'] || 'No proporcionada',
          status: 'pending',
          source: 'bot_builder_test',
          internal_note: `Pedido de prueba desde Bot Builder. Variables: ${JSON.stringify(vars)}`,
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

          // 3. Registrar Items
          if (cart.length > 0) {
            const items = cart.map((it: any) => ({
              order_id: order.id,
              product_id: it.id,
              product_name: it.name,
              quantity: it.qty,
              unit_price: it.price,
              subtotal: it.price * it.qty
            }));
            await this.supabase.createOrderItems(items);
          }
        } else {
          // Si no hay data, algo falló en la inserción
          const errorMsg = orderRes?.error?.message || 'Error desconocido al insertar en DB';
          this.chatMessages.push({ text: `❌ No se pudo guardar el pedido real: ${errorMsg}`, sender: 'bot' });
          this.simulationState.variables['orderNumber'] = `[FALLO_REGISTRO]`;
        }
      } catch (err: any) {
        console.error('Error en simulación de registro:', err);
        this.chatMessages.push({ text: `❌ Excepción: ${err.message || 'Error desconocido'}`, sender: 'bot' });
      }
    }
  }

  private scrollChatToBottom() {
    if (this.chatScrollRef) {
      this.chatScrollRef.nativeElement.scrollTop = this.chatScrollRef.nativeElement.scrollHeight;
    }
  }

  private collectSimulationMessages(node: FlowNode): string[] {
    const msgs: string[] = [];
    let current: FlowNode | undefined = node;

    while (current) {
      if (current.data.message) {
        let msg = this.resolveSimVariables(current.data.message);
        
        // Si es un menú, añadir las opciones al mensaje
        if (current.type === 'menu' && current.data.options) {
          const optionsText = current.data.options.map((o: any, i: number) => `${i + 1}. ${o.text}`).join('\n');
          msg += `\n\n${optionsText}`;
        }
        
        msgs.push(msg);
      }

      if (current.type === 'question' || current.type === 'menu' || current.type === 'end' || current.type === 'ai_agent') {
        this.simulationState.currentNodeId = current.id;
        break;
      }

      const nextId = this.findNextNodeId(current.id, 'output');
      current = this.botFlow.flow_data.nodes.find(n => n.id === nextId);
      if (!current) this.simulationState.currentNodeId = null;
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
        const summary = cart.map((it: any) => `- ${it.name} x${it.qty} ($${it.price * it.qty})`).join('\n');
        const total = cart.reduce((acc: number, it: any) => acc + (Number(it.price) * it.qty), 0);
        result = result.replace(/{{cartSummary}}/g, `${summary}\n\n💰 *Total: $${total}*`);
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
}
