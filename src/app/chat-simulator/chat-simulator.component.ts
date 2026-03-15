import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../supabase.service';
import { LiveOrderService } from '../live-order.service';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { inject } from '@angular/core';
import { NotificationService } from '../notification.service';
import { BotRuntimeService } from '../bot-builder/services/bot-runtime.service';

interface Message {
  sender: 'user' | 'ai';
  text: string;
  time: Date;
  type?: 'text' | 'product' | 'order_summary' | 'system';
  product?: {
    id?: string;
    name: string;
    price: number;
    image_url: string;
    description: string;
  };
}

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image_url?: string;
}

@Component({
  selector: 'app-chat-simulator',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="simulator-overlay" (click)="close()">
      <div class="simulator-window" (click)="$event.stopPropagation()">
        <header [style.background-color]="primaryColor">
          <div class="merchant-info">
            <img [src]="logoUrl" alt="Logo">
            <div>
              <h3>Simulador: {{ merchantName }}</h3>
              <p>Probando con {{ aiProvider | uppercase }}</p>
            </div>
          </div>
          <button class="close-btn" (click)="close()">✕</button>
        </header>

        <div class="chat-body" #scrollMe [scrollTop]="scrollMe.scrollHeight">
          <div *ngFor="let msg of messages" class="message" [class.user]="msg.sender === 'user'">
            <div class="message-wrapper">
              <div class="bubble" *ngIf="msg.text" [innerHTML]="formatMessage(msg.text)">
              </div>
              
              <!-- Tarjeta de Producto (Estilo Texto/WhatsApp) -->
              <div *ngIf="msg.product" class="text-card product-text-card">
                <div class="card-content">
                  <div class="card-title">📦 {{ msg.product.name }}</div>
                  <div class="card-desc">{{ msg.product.description }}</div>
                  <div class="card-footer">
                    <span class="card-price">$ {{ msg.product.price }}</span>
                    <button class="card-btn" [style.background-color]="primaryColor" (click)="addToCart(msg.product)">
                      Añadir al pedido 🛒
                    </button>
                  </div>
                </div>
              </div>

              <!-- Resumen de Pedido (Estilo Texto/WhatsApp) -->
              <div *ngIf="msg.type === 'order_summary'" class="text-card summary-text-card">
                <div class="card-header-text">
                  <span>🛒 tu pedido</span>
                </div>
                <div class="card-items">
                  <div *ngFor="let item of cart" class="card-item-row">
                    <span>{{ item.quantity }}x {{ item.name }}</span>
                    <strong>$ {{ (item.price * item.quantity).toFixed(2) }}</strong>
                  </div>
                </div>
                <div class="card-total-row">
                  <span>TOTAL</span>
                  <span class="total-amount">$ {{ cartTotal.toFixed(2) }}</span>
                </div>
                <button class="confirm-btn-text" [style.background-color]="primaryColor" (click)="confirmOrder()">
                  ✅ Confirmar y Pagar
                </button>
              </div>
            </div>
          </div>
          <div *ngIf="isTyping" class="typing">
            <span class="dot"></span><span class="dot"></span><span class="dot"></span>
          </div>
        </div>

        <!-- Sugerencias y Carrito Flotante -->
        <div class="chat-actions-bar" *ngIf="!isTyping">
           <button class="action-pill cart-pill" *ngIf="cart.length > 0" (click)="quickAction('Ver mi resumen de pedido')">
             🛒 Pedido ($ {{ cartTotal.toFixed(2) }})
           </button>
        </div>

        <div class="chat-footer">
          <input 
            type="text" 
            [(ngModel)]="userInput" 
            (keyup.enter)="sendMessage()"
            placeholder="Escribe para probar la IA..."
            [disabled]="isTyping">
          <button class="send-btn" (click) = "sendMessage()" [disabled] = "!userInput.trim() || isTyping" [style.background-color] = "primaryColor">
            <span>➤</span>
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .simulator-overlay {
      position: fixed;
      top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.6);
      backdrop-filter: blur(8px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 5000;
    }
    .simulator-window {
      width: 400px;
      height: 600px;
      background: #fdfdfd;
      border-radius: 24px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      box-shadow: 0 30px 60px -12px rgba(0,0,0,0.25);
    }
    header {
      padding: 20px;
      color: white;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .merchant-info {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .merchant-info img {
      width: 40px; height: 40px; border-radius: 50%; border: 2px solid white;
    }
    header h3 { margin: 0; font-size: 1rem; font-weight: 800; }
    header p { margin: 0; font-size: 0.72rem; opacity: 0.9; font-weight: 500; }
    .close-btn { 
      background: rgba(255,255,255,0.2); 
      border: none; 
      color: white; 
      width: 32px; 
      height: 32px; 
      border-radius: 50%; 
      display: flex; 
      align-items: center; 
      justify-content: center; 
      cursor: pointer; 
      transition: all 0.2s;
    }
    .close-btn:hover { background: rgba(255,255,255,0.3); transform: rotate(90deg); }

    .chat-body {
      flex: 1;
      padding: 20px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 12px;
      background: #f7f9fc;
    }
    .message {
      max-width: 85%;
      display: flex;
    }
    .message.user { align-self: flex-end; }
    .message-wrapper {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .bubble {
      padding: 12px 16px;
      border-radius: 18px;
      font-size: 0.9rem;
      line-height: 1.5;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
      white-space: pre-wrap;
      word-break: break-word;
    }
    .message:not(.user) .bubble {
      background: white; color: #1f2937;
      border-bottom-left-radius: 4px;
    }
    .message.user .bubble {
      background: #dcfce7; color: #166534; /* Verde Claro Saliente */
      border-bottom-right-radius: 4px;
      border: 1px solid #bbf7d0;
    }

    .message:not(.user) .bubble {
      background: #7c3aed; color: #ffffff; /* Morado Entrante */
      border-bottom-left-radius: 4px;
    }

    .typing { 
      padding: 8px 16px;
      display: flex;
      gap: 4px;
    }
    .dot {
      width: 6px; height: 6px; background: #7c3aed; border-radius: 50%;
      animation: bounce 1.4s infinite ease-in-out both;
    }
    .dot:nth-child(1) { animation-delay: -0.32s; }
    .dot:nth-child(2) { animation-delay: -0.16s; }

    @keyframes bounce {
      0%, 80%, 100% { transform: scale(0); }
      40% { transform: scale(1.0); }
    }

    .chat-actions-bar {
      padding: 8px 20px;
      display: flex;
      gap: 8px;
      overflow-x: auto;
      white-space: nowrap;
      background: #f5f3ff;
    }
    .chat-actions-bar::-webkit-scrollbar { display: none; }
    .action-pill {
      padding: 10px 18px;
      background: white;
      border: 1px solid #ddd6fe;
      border-radius: 24px;
      font-size: 0.85rem;
      font-weight: 700;
      color: #6d28d9;
      cursor: pointer;
      transition: all 0.2s;
      box-shadow: 0 2px 4px rgba(0,0,0,0.05);
      width: auto;
      height: auto;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .action-pill:hover { 
      border-color: #7c3aed; 
      color: #7c3aed; 
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(124, 58, 237, 0.1);
    }
    .action-pill.cart-pill { 
      background: #f5f3ff; 
      color: #6d28d9; 
      border-color: #7c3aed; 
      border-width: 2px;
    }

    /* Text-Style Cards */
    .text-card {
      background: white;
      border-radius: 12px;
      padding: 14px;
      border: 1px solid #ddd6fe;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
      width: 100%;
      max-width: 300px;
      animation: slideUp 0.3s ease-out;
      margin-top: 4px;
    }
    .card-title { font-weight: 800; font-size: 0.95rem; color: #6d28d9; margin-bottom: 4px; }
    .card-desc { font-size: 0.8rem; color: #4c1d95; line-height: 1.4; margin-bottom: 12px; }
    .card-footer { display: flex; justify-content: space-between; align-items: center; }
    .card-price { font-weight: 800; font-size: 1rem; color: #6d28d9; }
    .card-btn {
      padding: 6px 12px; border-radius: 8px; font-size: 0.75rem; font-weight: 700;
    }

    .summary-text-card { border-left: 4px solid #7c3aed; }
    .card-header-text { 
      font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; 
      color: #7c3aed; font-weight: 700; margin-bottom: 10px; display: block;
    }
    .card-items { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
    .card-item-row { 
      display: flex; justify-content: space-between; font-size: 0.85rem; 
      padding-bottom: 4px; border-bottom: 1px dashed #ddd6fe;
      color: #4c1d95;
    }
    .card-total-row { 
      display: flex; justify-content: space-between; align-items: center;
      padding-top: 8px; border-top: 2px solid #f5f3ff; margin-bottom: 12px;
    }
    .card-total-row span:first-child { font-weight: 700; font-size: 0.8rem; color: #6d28d9; }
    .total-amount { font-weight: 900; font-size: 1.1rem; color: #7c3aed; }
    
    .confirm-btn-text {
      width: 100%; padding: 10px; border-radius: 8px; font-weight: 800; font-size: 0.85rem;
    }

    @keyframes slideUp {
      from { transform: translateY(8px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }

    .chat-footer {
      padding: 20px;
      background: white;
      display: flex;
      gap: 10px;
    }
    input {
      flex: 1;
      padding: 12px 18px;
      border-radius: 12px;
      border: 1px solid #e5e7eb;
      outline: none;
      font-size: 0.9rem;
    }
    button {
      border: none;
      color: white;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      font-family: inherit;
    }
    
    .send-btn {
      width: 44px;
      height: 44px;
      min-width: 44px;
      border-radius: 12px;
      font-size: 1.2rem;
    }

    button:hover:not(:disabled) {
      transform: scale(1.02);
      filter: brightness(1.1);
    }
    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `]
})
export class ChatSimulatorComponent implements OnInit, OnDestroy {
  @Input() merchantName: string = '';
  @Input() logoUrl: string = '';
  @Input() primaryColor: string = '#4F46E5';
  @Input() aiProvider: string = 'google_gemini';
  @Input() aiModel: string = 'gemini-1.5-flash'; // Default model corregido
  @Input() aiApiKey: string = '';
  @Input() ollamaBaseUrl: string = 'http://localhost:11434';
  @Input() lmstudioBaseUrl: string = 'http://localhost:1234/v1';
  @Input() aiWelcomeMessage: string = '';
  @Input() context: string = '';
  @Input() merchantId: string = '';
  @Input() aiEnabled: boolean = true;
  @Input() botMode: boolean = false;
  @Input() showMenuAction: boolean = true;
  @Output() onClose = new EventEmitter<void>();

  private liveOrderService = inject(LiveOrderService);
  private supabaseService = inject(SupabaseService);
  private notificationService = inject(NotificationService);
  private botRuntime = inject(BotRuntimeService);
  private cdr = inject(ChangeDetectorRef);
  private sanitizer = inject(DomSanitizer);

  sessionId: string = 'W-' + Math.random().toString(36).substring(2, 9).toUpperCase();
  customerName: string = 'Simulador';
  dbConversationId: string | null = null;
  private activeSubscription: any = null;

  messages: Message[] = [];
  userInput: string = '';
  isTyping: boolean = false;

  cart: CartItem[] = [];

  get cartTotal() {
    return this.cart.reduce((total, item) => total + (item.price * item.quantity), 0);
  }

  constructor() { }

  async ngOnInit() {
    // Cargar estado del comercio
    const { data: merchant } = await this.supabaseService.getMerchantById(this.merchantId);
    this.botMode = merchant?.bot_mode || false;

    let greeting = this.aiWelcomeMessage || `¡Hola! Soy el asistente virtual de ${this.merchantName}. ¿En qué puedo ayudarte hoy?`;

    // Si estamos en modo Bot, el saludo inicial vendrá del proceso del bot
    if (this.botMode) {
      greeting = 'Iniciando asistente...';
    }

    // Reemplazar placeholders dinámicos
    greeting = greeting.replace(/{{merchantName}}/g, this.merchantName);
    greeting = greeting.replace(/{{merchant_name}}/g, this.merchantName);
    greeting = greeting.replace(/{{customerName}}/g, this.customerName);
    greeting = greeting.replace(/{{customer_name}}/g, this.customerName);

    this.messages.push({
      sender: 'ai',
      text: greeting,
      time: new Date()
    });

    // Crear conversación real en la DB
    try {
      // Intentamos obtener el primer cliente disponible para este merchant
      const { data: customers } = await this.supabaseService.getOrders(this.merchantId);
      const customerId = customers?.[0]?.customer_id || null;

      const { data: conv, error } = await this.supabaseService.createConversation(
        this.merchantId,
        customerId,
        'simulator',
        this.customerName
      );

      if (conv) {
        this.dbConversationId = conv.id;
        
        // Si es modo BOT, procesar el primer mensaje (START) de forma silenciosa para obtener el saludo real
        if (this.botMode) {
           const botRes = await this.botRuntime.processMessage(conv.id, this.merchantId, '');
           if (botRes && botRes.messages.length > 0) {
             this.messages = []; // Limpiar el "Iniciando..."
             botRes.messages.forEach(msg => {
               this.messages.push({ sender: 'ai', text: msg, time: new Date() });
               this.supabaseService.saveMessage(this.dbConversationId!, 'ai', msg);
             });
           }
        } else {
          // Guardar el saludo inicial de la IA
          await this.supabaseService.saveMessage(this.dbConversationId!, 'ai', this.messages[0].text);
        }

        // Suscribirse a mensajes para recibir respuestas humanas del panel
        this.subscribeToRealtime();
      }
    } catch (err) {
      console.error('Error creating simulator conversation:', err);
    }

    this.syncLiveCart();
  }

  subscribeToRealtime() {
    if (!this.dbConversationId) return;

    this.activeSubscription = this.supabaseService.subscribeToMessages(this.dbConversationId, (payload: any) => {
      const newMsg = payload.new;
      // Solo nos interesan los mensajes que NO son del cliente (es decir, del agente humano o IA externa)
      // Pero como el simulador ya maneja su propia IA, buscamos específicamente 'human_agent'
      if (newMsg.sender_type === 'human_agent') {
        const alreadyExists = this.messages.some(m => m.text === newMsg.content);
        if (!alreadyExists) {
          this.messages.push({
            sender: 'ai', // Lo mostramos como 'ai/agente' en la burbuja blanca
            text: newMsg.content,
            time: new Date()
          });
          this.cdr.detectChanges();
          this.scrollToBottom();
        }
      }
    });
  }

  ngOnDestroy() {
    if (this.activeSubscription) {
      this.supabaseService.unsubscribe(this.activeSubscription);
    }
  }

  syncLiveCart() {
    if (!this.dbConversationId) return;

    this.liveOrderService.updateSimulatorCart(
      this.dbConversationId,
      {
        items: this.cart,
        total: this.cartTotal
      },
      'happy' // Simulator is usually a happy path
    );
  }

  async sendMessage() {
    if (!this.userInput.trim()) return;

    const userText = this.userInput;
    this.messages.push({ sender: 'user', text: userText, time: new Date() });

    // Guardar mensaje del usuario en la DB
    if (this.dbConversationId) {
      this.supabaseService.saveMessage(this.dbConversationId, 'customer', userText);
    }

    this.userInput = '';
    this.isTyping = true;

    try {
      // --- LÓGICA DE BOT (NUEVA) ---
      if (this.botMode) {
        const botResponse = await this.botRuntime.processMessage(this.dbConversationId!, this.merchantId, userText);
        
        setTimeout(() => {
          this.isTyping = false;
          if (botResponse && botResponse.messages.length > 0) {
            botResponse.messages.forEach(msg => {
              this.messages.push({ sender: 'ai', text: msg, time: new Date() });
              this.supabaseService.saveMessage(this.dbConversationId!, 'ai', msg);
            });
          } else {
            this.messages.push({ sender: 'ai', text: 'Lo siento, no tengo una respuesta programada para eso.', time: new Date() });
          }
          this.cdr.detectChanges();
          this.scrollToBottom();
        }, 1000);
        return;
      }

      if (!this.aiEnabled && !this.botMode) {
        // MODO MANUAL: No hay respuesta automática
        setTimeout(() => {
          this.isTyping = false;
          this.messages.push({ 
            sender: 'ai', 
            text: '⚠️ [SIMULADOR] El comercio está en MODO MANUAL. No habrá respuesta automática del sistema.', 
            time: new Date() 
          });
          this.cdr.detectChanges();
        }, 800);
        return;
      }

      if (!this.aiApiKey) {
        throw new Error('No API key configured');
      }

      console.log('🤖 Llamando a API IA...');
      console.log('Modelo:', this.aiModel);

      const modelName = (this.aiModel || 'gemini-1.5-flash').trim().replace(/\s+/g, '-');
      const isOpenAI = modelName.toLowerCase().startsWith('gpt-') || modelName.toLowerCase().startsWith('o1-') || modelName.toLowerCase().startsWith('o3-');

      let systemNudge = '';
      const menuKeywords = ['menú', 'menu', 'carta', 'ofreces', 'ofrecen', 'productos', 'comida'];

      // Regla de saludo y categorías
      systemNudge += `\n(PROTOCOLO DE SALUDO: Si es el inicio o el usuario saluda, responde amable, menciona brevemente las categorías disponibles y pregunta qué desea. NO listes todos los productos individuales todavía.)`;

      if (menuKeywords.some(key => userText.toLowerCase().includes(key))) {
        systemNudge += '\n(Recordatorio: lístalo en texto plano con **negritas** en los nombres de productos. No uses la tarjeta [PRODUCT] para el menú completo.)';
      }

      // Nudge de precisión técnica
      systemNudge += `
(PROTOCOLO TÉCNICO DE CIERRE - INSTRUCCIONES OBRIGATORIAS: 
1. **REGLA DE ORO DE LOS COMANDOS**: Solo puedes emitir el comando [ORDER_CONFIRMED] cuando el usuario te haya dado su NOMBRE, DIRECCIÓN y TELÉFONO reales.
2. Si te falta alguno de esos datos, NO envíes el comando. Pregunta primero de forma amable.
3. Cada vez que el usuario agregue un producto: DEBES usar [UPDATE_CART:{"name":"...","price":0,"quantity":1}].
4. Si el usuario pide el resumen, usa [SHOW_SUMMARY].
5. **PROHIBIDO EL USO DE PUNTOS SUSPENSIVOS**: NUNCA pongas "..." o placeholders en los campos del JSON. Si no tienes el dato, no envíes el comando.
6. El total actual del carrito es $${this.cartTotal.toFixed(2)}. 
7. **SEGURIDAD DE PRECIOS**: Tus precios son FIJOS e INNEGOCIABLES.)`;

      // 1. OBTENER PROMPT MAESTRO (Cerebro Central Agente 2.0)
      const { data: compiledPrompt } = await this.supabaseService.rpc('get_compiled_prompt', {
        p_merchant_id: this.merchantId
      });

      // El prompt compilado ya trae: Reglas de Seguridad + Identidad + Habilidades + Catálogo + Conocimiento
      let fullSystemInstruction = compiledPrompt || `Eres el asistente de ${this.merchantName}.`;

      // Si el contexto pasado por prop tiene info extra que NO está en el prompt base, la añadimos discretamente
      if (this.context && this.context.length > 50 && !fullSystemInstruction.includes(this.context.substring(0, 50))) {
        fullSystemInstruction += `\n\n### CONTEXTO ADICIONAL DE PRUEBA:\n${this.context}`;
      }

      // --- RAG: BÚSQUEDA SEMÁNTICA EN TIEMPO REAL ---
      // Obtenemos bloques relevantes de la DB usando el nuevo sistema vectorial
      try {
        console.log('🔍 Buscando contexto semántico para:', userText);
        // FIXME: Obtenemos el ID del agente a través del merchant para la búsqueda
        const { data: merchantData } = await this.supabaseService.getMerchantById(this.merchantId);

        if (merchantData && merchantData.agent_id) {
          const { data: relevantBlocks } = await this.supabaseService.rpc('match_context_blocks', {
            p_agent_id: merchantData.agent_id,
            p_merchant_id: this.merchantId,
            p_query: userText,
            p_limit: 3
          });

          if (relevantBlocks && relevantBlocks.length > 0) {
            console.log('✨ Contexto útil encontrado:', relevantBlocks);
            fullSystemInstruction += `\n\n### 📚 CONOCIMIENTO EN TIEMPO REAL (RAG):\nBasado en la pregunta del usuario, aquí tienes información exacta de la base de datos que DEBES usar para responder:\n`;
            relevantBlocks.forEach((block: any) => {
              fullSystemInstruction += `- **${block.title}**: ${block.content}\n`;
            });
          }
        }
      } catch (ragError) {
        console.error('⚠️ Error leve en Búsqueda Semántica, continuando sin contexto extra:', ragError);
      }
      // ----------------------------------------------

      fullSystemInstruction += `${systemNudge}\n\nESTADO ACTUAL DEL CARRITO (TOTAL: $${this.cartTotal.toFixed(2)}):\n${JSON.stringify(this.cart)}`;

      console.log('--- SYSTEM PROMPT SENT TO AI ---');
      console.log(fullSystemInstruction);
      console.log('-------------------------------');

      // 2. CONSTRUIR HISTORIAL VÁLIDO (Alternancia estricta para Gemini 1.5)
      let chatContents: any[] = [];
      this.messages.forEach(msg => {
        const role = msg.sender === 'user' ? 'user' : 'model';
        if (chatContents.length > 0 && chatContents[chatContents.length - 1].role === role) {
          chatContents[chatContents.length - 1].parts[0].text += `\n${msg.text}`;
        } else {
          chatContents.push({ role, parts: [{ text: msg.text }] });
        }
      });

      // Regla de oro: Empezar con 'user'
      if (chatContents.length > 0 && chatContents[0].role === 'model') chatContents.shift();
      if (chatContents.length === 0) chatContents.push({ role: 'user', parts: [{ text: userText }] });

      let apiUrl = '';
      let requestBody: any = {};
      let headers: any = { 'Content-Type': 'application/json' };

      // Añadir bypass de ngrok solo para proveedores locales/túneles
      if (this.aiProvider === 'ollama' || this.aiProvider === 'lmstudio') {
        headers['ngrok-skip-browser-warning'] = 'true';
        if (this.aiApiKey) headers['Authorization'] = `Bearer ${this.aiApiKey}`;
      }

      if (isOpenAI) {
        // OpenAI API
        apiUrl = 'https://api.openai.com/v1/chat/completions';
        headers['Authorization'] = `Bearer ${this.aiApiKey}`;

        requestBody = {
          model: modelName,
          messages: [
            { role: 'system', content: fullSystemInstruction },
            ...chatContents.map((msg: any) => ({
              role: msg.role === 'model' ? 'assistant' : 'user',
              content: msg.parts[0].text
            }))
          ],
          temperature: 0.7,
          max_tokens: 1024
        };
      } else if (this.aiProvider === 'ollama') {
        // Ollama API
        apiUrl = `${this.ollamaBaseUrl}/api/chat`;
        requestBody = {
          model: modelName,
          messages: [
            { role: 'system', content: fullSystemInstruction },
            ...chatContents.map((msg: any) => ({
              role: msg.role === 'model' ? 'assistant' : 'user',
              content: msg.parts[0].text
            }))
          ],
          stream: false,
          options: { temperature: 0.7 }
        };
      } else if (this.aiProvider === 'lmstudio') {
        // LM Studio API (Using /api/v1/chat endpoint)
        let baseUrl = this.lmstudioBaseUrl.replace(/\/v1$/, '').replace(/\/api$/, '');
        apiUrl = `${baseUrl}/api/v1/chat`;
        
        // We ensure the input fits by only taking the last few messages and formatting it as text
        const recentMessages = chatContents.slice(-4).map((msg: any) => `${msg.role === 'model' ? 'Assistant' : 'User'}: ${msg.parts[0].text}`).join("\\n");
        
        requestBody = {
          model: modelName,
          system_prompt: fullSystemInstruction.substring(0, 10000), // Protect against massive context sizes
          input: recentMessages,
          temperature: 0.7
        };
      } else {
        // Google AI Studio (Gemini / Gemma)
        apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${this.aiApiKey}`;

        if (!modelName.toLowerCase().includes('gemma-3')) {
          requestBody = {
            system_instruction: { parts: [{ text: fullSystemInstruction }] },
            contents: chatContents.slice(-10),
            generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
          };
        } else {
          // Gemma-3 fallback directo y SEGURO (mezclando con el primer mensaje)
          const blendedContents = JSON.parse(JSON.stringify(chatContents.slice(-10)));
          if (blendedContents.length > 0 && blendedContents[0].role === 'user') {
            blendedContents[0].parts[0].text = fullSystemInstruction + "\n\n" + blendedContents[0].parts[0].text;
          } else {
            blendedContents.unshift({ role: 'user', parts: [{ text: fullSystemInstruction }] });
          }

          requestBody = {
            contents: blendedContents,
            generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
          };
        }
      }

      console.log('📤 Enviando request...');

      let response = await fetch(apiUrl, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestBody)
      });

      // Fallback para Gemini: si falla con system_instruction, intentar como mensaje USER
      if (this.aiProvider === 'google_gemini' && !response.ok && !modelName.toLowerCase().includes('gemma-3')) {
        console.log('🔄 Reintentando Gemini con fallback de mensaje USER...');

        const blendedContents = JSON.parse(JSON.stringify(chatContents.slice(-10)));
        if (blendedContents.length > 0 && blendedContents[0].role === 'user') {
          blendedContents[0].parts[0].text = fullSystemInstruction + "\n\n" + blendedContents[0].parts[0].text;
        } else {
          blendedContents.unshift({ role: 'user', parts: [{ text: fullSystemInstruction }] });
        }

        requestBody = {
          contents: blendedContents,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1024,
          }
        };
        response = await fetch(apiUrl, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(requestBody)
        });
      }

      console.log('📥 Response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json();
        console.error('❌ Error response:', errorData);
        throw new Error(`API Error ${response.status}: ${JSON.stringify(errorData)}`);
      }

      const data = await response.json();
      let aiText = '';

      if (isOpenAI) {
        aiText = data.choices?.[0]?.message?.content || '';
      } else if (this.aiProvider === 'lmstudio') {
        if (data.choices && data.choices.length > 0) {
          aiText = data.choices[0].message?.content || data.choices[0].text || '';
        } else if (data.output && Array.isArray(data.output) && data.output.length > 0) {
          aiText = data.output[0].content || data.output[0].text || '';
        } else if (data.content) {
          aiText = data.content;
        } else if (data.response) {
          aiText = data.response;
        } else if (data.message && data.message.content) {
          aiText = data.message.content;
        } else {
          aiText = JSON.stringify(data);
        }
      } else if (this.aiProvider === 'ollama') {
        aiText = data.message?.content || '';
      } else {
        aiText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      }

      if (!aiText) {
        aiText = 'Lo siento, no pude generar una respuesta.';
      }

      // 2. DETECTAR ACTUALIZACIONES DE CARRITO (IA -> Sistema)
      // 2. DETECTAR ACTUALIZACIONES DE CARRITO (IA -> Sistema)
      // Regex flexible: acepta [UPDATE_CART:...], UPDATE CART:..., etc.
      const cartUpdateRegex = /(?:\[)?UPDATE[ _]CART:?\s*(\{[\s\S]*?\})(?:\])?/gi;
      let cartMatch;
      let itemsAdded = 0;

      while ((cartMatch = cartUpdateRegex.exec(aiText)) !== null) {
        try {
          // Intentar parseo limpio
          let updateData: any;
          const rawJson = cartMatch[1];

          try {
            updateData = JSON.parse(rawJson);
          } catch (e) {
            // Fallback: Intento de extracción por regex si el JSON está mal formado (común en LLMs)
            const nameMatch = rawJson.match(/"name":\s*"(.*?)"/i);
            const priceMatch = rawJson.match(/"price":\s*(\d+(\.\d+)?)/i);
            const qtyMatch = rawJson.match(/"quantity":\s*(\d+)/i);

            if (nameMatch) {
              updateData = {
                name: nameMatch[1],
                price: priceMatch ? parseFloat(priceMatch[1]) : 0,
                quantity: qtyMatch ? parseInt(qtyMatch[1]) : 1
              };
            }
          }

          if (updateData && updateData.name) {
            // Si el precio es 0, buscarlo en el catálogo
            if (!updateData.price || updateData.price === 0) {
              const catalogPriceMatch = this.context.match(new RegExp(`${updateData.name}.*?\\$(\\d+(\\.\\d+)?)`, 'i'));
              if (catalogPriceMatch) updateData.price = parseFloat(catalogPriceMatch[1]);
            }

            this.updateCartFromAI(updateData);
            aiText = aiText.replace(cartMatch[0], '');
            itemsAdded++;
          }
        } catch (error) {
          console.error("Error procesando UPDATE_CART:", error);
        }
      }

      // 3. DETECTAR CIERRE DE PEDIDO (IA -> Sistema)
      const orderConfirmedRegex = /(?:\[)?ORDER[ _]CONFIRMED:?\s*(\{[\s\S]*\})(?:\])?/gi;
      let orderMatch;
      while ((orderMatch = orderConfirmedRegex.exec(aiText)) !== null) {
        try {
          const orderDataStr = orderMatch[1];
          let orderData: any;

          try {
            const cleanJson = orderDataStr.trim().replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
            orderData = JSON.parse(cleanJson);
          } catch (e) {
            console.warn('⚠️ Fallback de extracción manual para ORDER_CONFIRMED');
            const nameMatch = orderDataStr.match(/"?customer_name"?\s*:\s*"(.*?)"/i);
            const addrMatch = orderDataStr.match(/"?address"?\s*:\s*"(.*?)"/i);
            const phoneMatch = orderDataStr.match(/"?phone"?\s*:\s*"(.*?)"/i);
            const totalMatch = orderDataStr.match(/"?total"?\s*:\s*(\d+(\.\d+)?)/i);
            orderData = {
              customer_name: nameMatch ? nameMatch[1] : null,
              address: addrMatch ? addrMatch[1] : null,
              phone: phoneMatch ? phoneMatch[1] : null,
              total: totalMatch ? parseFloat(totalMatch[1]) : 0
            };
          }

          // VALIDACIÓN DE SEGURIDAD: Evitar placeholders "..." o datos vacíos
          const hasPlaceholders = (val: any) => typeof val === 'string' && (val.includes('...') || val.trim() === '');

          if (hasPlaceholders(orderData.customer_name) || hasPlaceholders(orderData.address) || hasPlaceholders(orderData.phone)) {
            console.warn('⚠️ La IA intentó confirmar un pedido con datos incompletos o placeholders. Ignorando comando.', orderData);
            // Si detectamos esto, podemos inyectar un nudge de sistema para la IA
            aiText = aiText.replace(orderMatch[0], '');
            continue;
          }

          if (orderData.customer_name && orderData.address && orderData.phone) {
            console.log('🏁 Pedido Realizado con éxito:', orderData);
            await this.confirmOrder(true, orderData);
            aiText = aiText.replace(orderMatch[0], '');
          }
        } catch (e) {
          console.error("Error procesando ORDER_CONFIRMED:", e);
        }
      }

      // 4. DETERMINAR TIPO DE MENSAJE Y LIMPIEZA
      let messageType: 'text' | 'order_summary' = 'text';

      // Si hubo cambios en el carrito O la IA lo pide explícitamente, mostrar resumen
      if (aiText.includes('[SHOW_SUMMARY]') || itemsAdded > 0) {
        messageType = 'order_summary';
        aiText = aiText.replace(/\[SHOW_SUMMARY\]/gi, '');
      }

      // 4. DETECTAR TARJETAS DE PRODUCTO (Visuales)
      const productRegex = /\[PRODUCT:(\{.*?\})\]/gi;
      let lastProduct = null;
      let productMatch;
      while ((productMatch = productRegex.exec(aiText)) !== null) {
        try {
          lastProduct = JSON.parse(productMatch[1]);
          aiText = aiText.replace(productMatch[0], '');
        } catch (e) { }
      }

      aiText = aiText.trim();

      // Limpieza final preventiva: borrar rastros de comandos técnicos mal formados
      aiText = aiText.replace(/\[\w+:[^\]]*\]/gi, ''); // Borra [TAG:...]
      aiText = aiText.replace(/UPDATE[ _]CART:?\s*\{[\s\S]*?\}/gi, ''); // Borra variaciones de UPDATE CART
      aiText = aiText.replace(/ORDER[ _]CONFIRMED:?\s*\{[\s\S]*?\}/gi, ''); // Borra confirmaciones huérfanas
      aiText = aiText.replace(/\{"customer_name":[\s\S]*?\}/gi, ''); // Borra cualquier JSON de pedido suelto
      aiText = aiText.replace(/\{"name":[\s\S]*?\}/gi, ''); // Borra cualquier JSON de producto suelto
      aiText = aiText.trim();

      this.messages.push({
        sender: 'ai',
        text: aiText,
        time: new Date(),
        type: messageType,
        product: lastProduct
      });

      // Guardar respuesta de la IA en la DB
      if (this.dbConversationId) {
        this.supabaseService.saveMessage(this.dbConversationId, 'ai', aiText);
      }

      this.cdr.detectChanges();
      this.scrollToBottom();
    } catch (error: any) {
      console.error('❌ Error completo:', error);

      let errorMessage = '❌ Error: ';

      if (error.message.includes('400')) {
        errorMessage += 'La API key es inválida o el formato de la petición es incorrecto.';
      } else if (error.message.includes('429')) {
        errorMessage += 'Has excedido la cuota de la API. Espera unos minutos.';
      } else if (error.message.includes('No API key')) {
        errorMessage += 'No se ha configurado una API key. Ve a Config de la empresa.';
      } else if (error.message.includes('Failed to fetch')) {
        errorMessage += 'No se pudo conectar con la API. Verifica tu conexión a internet.';
      } else {
        errorMessage += error.message;
      }

      this.messages.push({
        sender: 'ai',
        text: errorMessage,
        time: new Date()
      });
    } finally {
      this.isTyping = false;
      this.cdr.detectChanges();
    }
  }

  addToCart(product: any) {
    const existing = this.cart.find(item => item.name === product.name);
    if (existing) {
      existing.quantity++;
    } else {
      this.cart.push({
        id: product.id || Date.now().toString(),
        name: product.name,
        price: product.price,
        quantity: 1,
        image_url: product.image_url
      });
    }

    this.messages.push({
      sender: 'ai',
      text: `¡Genial! He añadido **${product.name}** a tu pedido. ¿Algo más o pasamos al resumen?`,
      time: new Date()
    });
    this.syncLiveCart();
    this.cdr.detectChanges();
  }

  updateCartFromAI(update: { name: string, quantity: number, price?: number, image_url?: string }) {
    const searchName = update.name.toLowerCase().trim();

    // 1. Intentar coincidencia exacta o contenida
    let existing = this.cart.find(item => item.name.toLowerCase().trim() === searchName);
    if (!existing) {
      existing = this.cart.find(item => item.name.toLowerCase().includes(searchName) || searchName.includes(item.name.toLowerCase()));
    }

    if (existing) {
      existing.quantity = update.quantity;
      // BLOQUEO DE SEGURIDAD: Solo permitir asignar precio si el actual es 0 o nulo.
      // Esto evita que la IA cambie precios establecidos por el catálogo.
      if (update.price !== undefined && update.price > 0) {
        if (!existing.price || existing.price === 0) {
          existing.price = update.price;
        } else if (existing.price !== update.price) {
          console.warn(`🛡️ [Security] Intento de cambio de precio bloqueado para ${existing.name}. Original: ${existing.price}, Requerido por IA: ${update.price}`);
        }
      }
      if (update.image_url) existing.image_url = update.image_url;

      if (existing.quantity <= 0) {
        this.cart = this.cart.filter(item => item !== existing);
      }
    } else if (update.quantity > 0) {
      this.cart.push({
        id: Date.now().toString(),
        name: update.name,
        price: update.price || 0,
        quantity: update.quantity,
        image_url: update.image_url
      });
    }
    this.syncLiveCart();
    this.cdr.detectChanges();
  }

  async confirmOrder(fromAI: boolean = false, aiMetadata?: any) {
    // Escenario de seguridad: Si no tenemos UUID, intentar normalizarlo localmente
    if (this.merchantId && !this.merchantId.includes('-')) {
      console.log('🔄 [Simulator] Detectado Merchant ID tipo slug, normalizando...');
      const { data: m } = await this.supabaseService.getMerchantByAnyId(this.merchantId);
      if (m) this.merchantId = m.id;
    }

    console.log('📝 Intentando confirmar pedido. FromAI:', fromAI, 'MerchantId:', this.merchantId);

    // Si el carrito está vacío pero la IA confirmó un total, crear un ítem virtual
    if (this.cart.length === 0 && aiMetadata?.total > 0) {
      console.log('📦 [Simulator] Carrito vacío pero hay total de IA, creando ítem genérico');
      this.cart.push({
        id: 'gen-' + Date.now().toString(),
        name: 'Pedido Confirmado via Chat',
        price: Number(aiMetadata.total),
        quantity: 1
      });
    }

    if (!fromAI) {
      this.messages.push({
        sender: 'ai',
        text: '✅ ¡Excelente elección! Tu pedido ha sido confirmado y enviado a cocina. El tiempo estimado de entrega es de 30-45 minutos.',
        time: new Date()
      });
    }

    // 1. Crear el pedido en Supabase para que aparezca en el Order Management
    if (this.cart.length > 0) {
      if (!this.merchantId) {
        console.error('❌ Error: No se puede crear el pedido porque MerchantId está vacío.');
        return;
      }

      try {
        const orderData = {
          merchant_id: this.merchantId,
          customer_id: null,
          conversation_id: this.dbConversationId,
          total: Number(aiMetadata?.total) || this.cartTotal,
          status: 'pending',
          channel: 'simulator',
          closing_agent_type: fromAI ? 'ai' : 'human',
          // Usar datos del AI si vienen, si no usar valores por defecto del simulador
          customer_name: aiMetadata?.customer_name || this.customerName,
          delivery_address: aiMetadata?.address || 'Recogida en local (Simulador)',
          customer_phone: aiMetadata?.phone || null
        };

        const { data: newOrder, error } = await this.supabaseService.createOrder(orderData);
        if (error) {
          console.error('❌ Error al crear pedido:', error);
          throw error;
        }

        if (newOrder) {
          const orderNum = newOrder.order_number ? '#' + String(newOrder.order_number).padStart(3, '0') : newOrder.id.substring(0, 8);
          this.messages.push({
            sender: 'ai',
            text: `✅ ¡Pedido confirmado! Tu número de pedido es **${orderNum}**. Ya lo puedes ver en la sección de gestión.`,
            time: new Date()
          });
          console.log('✅ Pedido creado con ID:', newOrder.id);

          const items = this.cart.map(item => ({
            order_id: newOrder.id,
            product_id: (item.id && String(item.id).length > 20) ? item.id : null,
            product_name: String(item.name || 'Sin nombre'),
            quantity: Number(item.quantity) || 1,
            unit_price: Number(item.price) || 0,
            subtotal: Number(Number(item.price) * Number(item.quantity)) || 0
          }));

          console.log('📦 Guardando ítems del pedido:', items);
          const { error: itemsError } = await this.supabaseService.createOrderItems(items);

          if (itemsError) {
            console.error('❌ Error fatal al crear ítems:', itemsError);
            this.notificationService.show('Advertencia: Pedido creado pero falló el registro de productos: ' + (itemsError.message || 'Error de DB'), 'error');
          } else {
            console.log('✅ Pedido e ítems registrados correctamente');
            this.notificationService.show('¡Pedido y productos registrados con éxito!', 'success');
          }
        }
      } catch (err: any) {
        console.error('❌ Excepción en confirmOrder:', err);
        this.notificationService.show('Fallo crítico al crear pedido: ' + err.message, 'error');
      }
    }

    // Marcar como confirmado en el monitor (Persistencia en DB)
    if (this.dbConversationId) {
      this.liveOrderService.updateSimulatorCart(
        this.dbConversationId,
        {
          items: this.cart,
          total: this.cartTotal
        },
        'happy'
      ).then(() => {
        // Al confirmar, limpiamos el typing_data para que desaparezca del monitor Live (o cambie de estado)
        this.supabaseService.rpc('update_conversation_typing_data', {
          p_conv_id: this.dbConversationId,
          p_data: {}
        });
      });
    }

    this.cart = [];
    this.cdr.detectChanges();
    this.scrollToBottom();
  }

  quickAction(text: string) {
    this.userInput = text;
    this.sendMessage();
  }

  scrollToBottom() {
    setTimeout(() => {
      const chatBody = document.querySelector('.chat-body');
      if (chatBody) {
        chatBody.scrollTop = chatBody.scrollHeight;
      }
    }, 100);
  }

  formatMessage(text: string): SafeHtml {
    if (!text) return '';

    // 1. Escapar HTML básico
    let formatted = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // 2. Negritas: **texto** -> <strong>texto</strong>
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // 3. Cursivas: *texto* -> <i>texto</i>
    formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');

    // 4. Listas: - item -> • item
    formatted = formatted.replace(/^\s*-\s+(.*)/gm, '• $1');

    // 5. Limpieza agresiva de etiquetas técnicas e internas (Case Insensitive)
    formatted = formatted.replace(/\[UPDATE_CART:.*?\]/gi, '');
    formatted = formatted.replace(/\[PRODUCT:.*?\]/gi, '');
    formatted = formatted.replace(/\[ORDER_CONFIRMED:[\s\S]*?\}\s*\]/gi, '');
    formatted = formatted.replace(/\[SHOW_SUMMARY\]/gi, '');
    formatted = formatted.replace(/\[IMAGE_URL:.*?\]/gi, '');
    formatted = formatted.replace(/\(INTERNO:.*?\)/gi, "");
    formatted = formatted.replace(/\(DESCRIPCIÓN REAL:.*?\)/gi, "");
    formatted = formatted.replace(/\[DISPONIBLE\]/gi, "");
    formatted = formatted.replace(/\[AGOTADO\]/gi, "");

    return this.sanitizer.bypassSecurityTrustHtml(formatted.trim());
  }

  close() {
    this.onClose.emit();
  }
}
