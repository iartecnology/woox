import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ChangeDetectorRef, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
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
  tokens?: number;
  responseTimeMs?: number;
  modelName?: string;
  isRAGContextUsed?: boolean;
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
    <div class="simulator-overlay" [class.inline]="inline">
      <div class="simulator-window" (click)="$event.stopPropagation()">
        <header *ngIf="!inline" [style.background-color]="primaryColor">
          <div class="merchant-info">
            <img [src]="logoUrl" alt="Logo">
            <div>
              <h3>Simulador: {{ merchantName }}</h3>
              <p>Probando con {{ aiProvider | uppercase }}</p>
            </div>
          </div>
          <button class="close-btn" (click)="close()" *ngIf="!inline">✕</button>
        </header>

        <!-- Barra de Estadísticas Unificada -->
        <div class="sim-stats-bar" *ngIf="botMode && totalSessionExecutions > 0 && showStats">
          <div class="stat-pill">
            <span class="stat-pill-icon">⚡</span>
            <span class="stat-pill-val">{{ totalSessionExecutions }}</span>
            <span class="stat-pill-label">runs</span>
          </div>
          <button class="copilot-btn" 
                  [class.active]="isCopilotActive" 
                  (click)="toggleCopilot()" 
                  [title]="isCopilotActive ? 'Desactivar Copiloto' : 'Activar Copiloto'">
            <span class="bot-icon">🤖</span>
            <span class="bot-label">{{ isCopilotActive ? 'Copiloto ON' : 'Copiloto OFF' }}</span>
          </button>
          <div class="stat-pill" *ngIf="activeSimNodeId">
            <span class="stat-pill-icon">📍</span>
            <span class="stat-pill-val stat-pill-val--sm">{{ getActiveNodeLabel() }}</span>
          </div>
          <div class="stat-pill" *ngIf="totalSessionTokens > 0">
            <span class="stat-pill-icon">🪙</span>
            <span class="stat-pill-val">{{ totalSessionTokens }}</span>
            <span class="stat-pill-label">tkns</span>
          </div>
          <div class="stat-pill">
            <span class="stat-pill-icon">📦</span>
            <span class="stat-pill-val">{{ getVariableCount() }}</span>
            <span class="stat-pill-label">vars</span>
          </div>
          <div class="stat-pill" *ngIf="totalFlowNodes > 0" [title]="'Cobertura del flujo: ' + getCoveragePercentage() + '%'">
            <span class="stat-pill-icon">🛣️</span>
            <span class="stat-pill-val">{{ getCoveragePercentage() }}%</span>
            <span class="stat-pill-label">cov</span>
          </div>
          <button class="reset-pill-btn" (click)="restartSession()" title="Reiniciar sesión">🔄</button>
          <button class="reset-pill-btn" (click)="clearSimulatorSession()" title="Limpiar trazabilidad">🗑️</button>
          <button class="reset-pill-btn" (click)="downloadTestReport()" title="Descargar Reporte JSON" *ngIf="sessionExecutionLog.length > 0">📥</button>
          
          <!-- Selector de Modo y Velocidad -->
          <div class="copilot-controls" *ngIf="isCopilotActive">
             <div class="speed-selector">
                <button (click)="setCopilotSpeed(3000)" [class.active]="copilotSpeed === 3000" title="Tortuga (3s)">🐢</button>
                <button (click)="setCopilotSpeed(1500)" [class.active]="copilotSpeed === 1500" title="Normal (1.5s)">😊</button>
                <button (click)="setCopilotSpeed(500)" [class.active]="copilotSpeed === 500" title="Liebre (0.5s)">🐇</button>
             </div>
             <select class="mode-select" [(ngModel)]="copilotMode" (change)="onCopilotModeChange()">
                <option value="reactive">Explorador</option>
                <option value="purchase">🛒 Compra</option>
             </select>
          </div>
        </div>

        <div class="chat-body" #scrollMe>
          <div *ngFor="let msg of messages" class="message" [class.user]="msg.sender === 'user'">
            <div class="message-wrapper">
              <div class="bubble" *ngIf="msg.text" [class.system]="msg.type === 'system'" [innerHTML]="formatMessage(msg.text)">
              </div>
              
              <!-- Meta-data de ejecución (Solo para IA) -->
              <div class="msg-meta" *ngIf="msg.sender === 'ai' && (msg.responseTimeMs !== undefined || msg.tokens !== undefined || msg.modelName)">
                <span *ngIf="msg.responseTimeMs !== undefined">⏱️ {{msg.responseTimeMs}}ms</span>
                <span *ngIf="msg.tokens !== undefined">🪙 {{msg.tokens}} tkns</span>
                <span *ngIf="msg.modelName" class="badge-model">{{msg.modelName}}</span>
                <span *ngIf="msg.isRAGContextUsed" class="badge-rag" title="Respondido usando base de conocimiento">📚 RAG</span>
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

        <!-- Log de Ejecución Unificado -->
        <div class="exec-log-panel" *ngIf="botMode && sessionExecutionLog.length > 0 && showLog">
          <div class="exec-log-header" (click)="logCollapsed = !logCollapsed">
            <span>📊 Pasos del Flujo ({{ sessionExecutionLog.length }})</span>
            <span class="collapse-icon">{{ logCollapsed ? '▲' : '▼' }}</span>
          </div>
          <div class="exec-log-scroll" *ngIf="!logCollapsed">
            <div class="exec-log-entry" *ngFor="let entry of sessionExecutionLog" [class.warning]="entry.count > 3">
              <span class="entry-icon">{{ getNodeIcon(entry.type) }}</span>
              <span class="entry-label">{{ entry.label }}</span>
              <span class="entry-count" *ngIf="entry.count > 1">×{{ entry.count }}</span>
            </div>
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
    :host { display: block; width: 100%; height: 100%; }

    .simulator-overlay {
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(0,0,0,0.5); backdrop-filter: blur(4px);
      display: flex; align-items: center; justify-content: center; z-index: 10000;
      animation: fadeInSim 0.3s ease-out;
    }
    @keyframes fadeInSim { from { opacity: 0; } to { opacity: 1; } }

    .simulator-window {
      width: 450px; 
      height: 650px; 
      max-height: 90vh;
      max-width: 95vw;
      background: white; 
      border-radius: 20px;
      display: flex; 
      flex-direction: column; 
      overflow: hidden;
      box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
      animation: slideUpSim 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    @keyframes slideUpSim { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

    .simulator-overlay.inline {
      position: relative; width: 100%; height: 100%; top: auto; left: auto;
      background: transparent; backdrop-filter: none; z-index: 1;
      animation: none;
    }
    .simulator-overlay.inline .simulator-window {
      width: 100%; height: 100%; max-height: 100%; border-radius: 0; box-shadow: none; border: none;
      animation: none;
    }

    header {
      padding: 16px 20px; color: white; display: flex;
      justify-content: space-between; align-items: center;
    }
    .merchant-info { display: flex; align-items: center; gap: 12px; }
    .merchant-info img { width: 40px; height: 40px; border-radius: 8px; background: white; object-fit: cover; }
    .merchant-info h3 { margin: 0; font-size: 0.95rem; font-weight: 800; }
    .merchant-info p { margin: 0; font-size: 0.75rem; opacity: 0.9; }
    .close-btn { 
      background: rgba(255,255,255,0.2); border: none; color: white; 
      width: 28px; height: 28px; border-radius: 50%; cursor: pointer;
      display: flex; align-items: center; justify-content: center; font-size: 0.8rem;
    }
    .close-btn:hover { background: rgba(255,255,255,0.3); }
    
    /* Stats Bar Styles */
    .sim-stats-bar {
      display: flex; gap: 6px; padding: 8px 12px;
      background: #1e293b; border-bottom: 1px solid #334155;
      flex-wrap: wrap; align-items: center;
    }
    .stat-pill {
      display: flex; align-items: center; gap: 4px;
      background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12);
      border-radius: 20px; padding: 2px 8px; font-size: 0.7rem; color: #e2e8f0;
    }
    .stat-pill-val { font-weight: 800; color: #10b981; }
    .stat-pill-val--sm { max-width: 80px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .stat-pill-label { color: #64748b; font-size: 0.65rem; }
    .reset-pill-btn {
      background: transparent; border: none; color: #94a3b8; font-size: 0.8rem;
      cursor: pointer; margin-left: auto; padding: 2px 6px; border-radius: 4px;
    }
    .reset-pill-btn:hover { background: rgba(255,255,255,0.1); color: #ef4444; }

    .speed-selector {
      display: flex; gap: 2px; background: rgba(0,0,0,0.2); border-radius: 4px; padding: 2px;
      margin-left: 10px;
    }
    .speed-selector button {
      background: transparent; border: none; cursor: pointer; padding: 2px 4px;
      border-radius: 3px; font-size: 0.8rem; filter: grayscale(1); opacity: 0.6;
    }
    .speed-selector button.active { filter: grayscale(0); opacity: 1; background: rgba(255,255,255,0.1); }

    .copilot-btn {
      display: flex; align-items: center; gap: 6px;
      background: #334155; border: 1px solid #475569;
      border-radius: 20px; padding: 2px 10px; font-size: 0.7rem; color: #94a3b8;
      cursor: pointer; transition: all 0.3s ease;
      margin-left: 8px;
    }
    .copilot-btn.active {
      background: #7c3aed; border-color: #a78bfa; color: white;
      box-shadow: 0 0 10px rgba(124, 58, 237, 0.4);
      animation: pulseCopilot 2s infinite;
    }
    .bot-icon { font-size: 0.9rem; }
    .bot-label { font-weight: 700; text-transform: uppercase; letter-spacing: 0.02em; }
    
    @keyframes pulseCopilot {
      0% { transform: scale(1); }
      50% { transform: scale(1.05); }
      100% { transform: scale(1); }
    }

    /* Log Panel Styles */
    .exec-log-panel {
      border-top: 1px solid #e2e8f0; background: #f8fafc;
      max-height: 150px; display: flex; flex-direction: column;
    }
    .exec-log-header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 6px 12px; font-size: 0.7rem; font-weight: 700; color: #64748b;
      cursor: pointer; background: #f1f5f9; border-bottom: 1px solid #e2e8f0;
    }
    .exec-log-scroll { overflow-y: auto; flex: 1; }
    .exec-log-entry {
      display: flex; align-items: center; gap: 8px; padding: 4px 12px;
      font-size: 0.75rem; border-bottom: 1px solid #f1f5f9;
    }
    .entry-icon { font-size: 0.8rem; }
    .entry-label { flex: 1; color: #374151; font-weight: 500; }
    .entry-count { font-size: 0.65rem; background: #e0e7ff; color: #4338ca; padding: 1px 5px; border-radius: 6px; }
    .exec-log-entry.warning { background: #fff7ed; color: #9a3412; }
    .exec-log-entry.warning .entry-count { background: #fed7aa; color: #c2410c; }

    @keyframes bounce {
      0%, 80%, 100% { transform: scale(0); }
      40% { transform: scale(1.0); }
    }

    .chat-body {
      flex: 1;
      padding: 16px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 12px;
      background: #f7f9fc;
      scroll-behavior: smooth;
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
      padding: 14px 18px;
      border-radius: 20px;
      font-size: 0.92rem;
      line-height: 1.6;
      box-shadow: 0 4px 15px rgba(0,0,0,0.06);
      white-space: pre-wrap;
      word-break: break-word;
      font-family: 'Inter', -apple-system, system-ui, sans-serif;
      transition: all 0.2s ease;
      animation: fadeInBubble 0.3s ease-out;
    }
    @keyframes fadeInBubble {
      from { opacity: 0; transform: translateY(10px) scale(0.98); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    .message:not(.user) .bubble {
      background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%); 
      color: #ffffff;
      border-bottom-left-radius: 4px;
      border: 1px solid rgba(124, 58, 237, 0.2);
    }
    .message.user .bubble {
      background: #ffffff; 
      color: #1f2937;
      border-bottom-right-radius: 4px;
      border: 1px solid #e2e8f0;
      box-shadow: 0 4px 6px rgba(0,0,0,0.02);
    }

    .bubble strong { font-weight: 800; color: inherit; }
    .bubble em { opacity: 0.9; font-style: italic; }

    .message .bubble.system {
      background: #fef2f2;
      color: #991b1b;
      border: 1px solid #fee2e2;
      font-size: 0.8rem;
      border-radius: 12px;
    }

    .msg-meta {
      display: flex; gap: 8px; font-size: 0.65rem; color: #64748b; margin-top: -4px; margin-left: 4px; flex-wrap: wrap; align-items: center;
    }
    .badge-model {
      background: rgba(124, 58, 237, 0.1); color: #7c3aed; padding: 1px 6px; border-radius: 10px; border: 1px solid rgba(124, 58, 237, 0.2); font-weight: 600;
    }
    .badge-rag {
      background: #dcfce7; color: #166534; padding: 1px 6px; border-radius: 10px; border: 1px solid #bbf7d0; font-weight: 600;
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
      padding: 12px 16px;
      background: white;
      display: flex;
      gap: 10px;
      border-top: 1px solid #e5e7eb;
      flex-shrink: 0;
      position: relative;
      background: #f8fafc; /* Color de fondo más notable */
      border-top: 2px solid #e2e8f0;
      z-index: 10;
    }
    input {
      flex: 1;
      padding: 10px 14px;
      border-radius: 12px;
      border: 1px solid #e5e7eb;
      outline: none;
      font-size: 0.85rem;
      background: #f9fafb;
      transition: border-color 0.2s;
    }
    input:focus { border-color: #7c3aed; background: white; }

    .send-btn {
      width: 40px;
      height: 40px;
      min-width: 40px;
      border-radius: 12px;
      font-size: 1.1rem;
      background: #7c3aed;
      color: white;
      border: none;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer;
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
export class ChatSimulatorComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('scrollMe') private myScrollContainer!: ElementRef;
  @ViewChild('messageInput') private messageInput!: ElementRef;

  private shouldScrollToBottom = false;
  @Input() merchantName: string = '';
  @Input() merchantId: string = '';
  @Input() logoUrl: string = '';
  @Input() primaryColor: string = '#4F46E5';
  @Input() aiProvider: string = 'google_gemini';
  @Input() aiModel: string = 'gemini-1.5-flash';
  @Input() aiApiKey: string = '';
  @Input() aiWelcomeMessage: string = '';
  @Input() aiEnabled: boolean = true;
  @Input() context: string = '';
  @Input() botMode: boolean = false;
  @Input() showMenuAction: boolean = true;
  @Input() ollamaBaseUrl: string = 'http://localhost:11434';
  @Input() lmstudioBaseUrl: string = 'http://localhost:1234/v1';
  @Input() inline: boolean = false;
  @Input() allNodes: any[] = [];
  @Input() allConnections: any[] = [];
  @Input() showStats: boolean = true;
  @Input() showLog: boolean = true;
  @Output() onNodeExecuted = new EventEmitter<string>();
  @Output() onClose = new EventEmitter<void>();

  logCollapsed: boolean = false;
  totalSessionExecutions: number = 0;
  sessionExecutionLog: any[] = [];
  activeSimNodeId: string | null = null;
  sessionVariables: any = {};
  isCopilotActive: boolean = false;
  private copilotTimer: any = null;
  private nodeVisitCounts: Map<string, number> = new Map();
  allFlowNodes: { id: string, label: string, type: string }[] = [];
  totalFlowNodes: number = 0;
  copilotSpeed: number = 1500; // Default: Normal
  
  // Scenarios (Fase 5)
  copilotMode: 'reactive' | 'explorer' | 'purchase' = 'reactive';
  plannedScenario: { nodeId: string, input: string }[] = [];
  currentScenarioStep: number = 0;

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

  get totalSessionTokens() {
    return this.messages.reduce((sum, msg) => sum + (msg.tokens || 0), 0);
  }

  constructor() { }

  onCopilotModeChange() {
    if (this.copilotMode === 'purchase') {
      this.planPurchaseScenario();
    } else {
      this.plannedScenario = [];
      this.currentScenarioStep = 0;
    }
  }

  private planPurchaseScenario() {
    this.notificationService.show('Analizando flujo para planificar compra...', 'info');
    
    // 1. Encontrar nodo de inicio
    const startNode = this.allNodes.find(n => n.type === 'start');
    if (!startNode) {
      this.notificationService.show('No se encontró nodo de Inicio.', 'error');
      this.copilotMode = 'reactive';
      return;
    }

    // 2. Encontrar nodos de checkout
    const checkoutNodes = this.allNodes.filter(n => 
      (n.type === 'action' && n.data?.actionType === 'order_checkout') || 
      n.type === 'order_checkout'
    );

    if (checkoutNodes.length === 0) {
      this.notificationService.show('Flujo incompleto: No hay nodo de Pagar/Checkout.', 'error');
      this.copilotMode = 'reactive';
      return;
    }

    // 3. BFS básico para encontrar el camino más corto al checkout
    const queue: { nodeId: string, path: any[] }[] = [{ nodeId: startNode.id, path: [] }];
    const visited = new Set<string>();
    let finalPath: any[] | null = null;

    while (queue.length > 0) {
      const { nodeId, path } = queue.shift()!;
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);

      const node = this.allNodes.find(n => n.id === nodeId);
      if (!node) continue;

      // ¿Es un nodo de checkout?
      if (checkoutNodes.some(cn => cn.id === nodeId)) {
        finalPath = path;
        break;
      }

      // Siguientes conexiones
      const connections = this.allConnections.filter(c => c.from === nodeId);
      for (const conn of connections) {
        // Determinar qué entrada satisface esta conexión
        let input = '';
        if (node.type === 'menu') {
          const optIndex = node.data?.options?.findIndex((o: any) => o.id === conn.fromPort || conn.fromPort?.includes(o.id));
          input = (optIndex !== -1) ? (optIndex + 1).toString() : '1';
        } else if (node.type === 'condition') {
          input = 'si'; // Asumimos 'si' para avanzar
        } else if (node.type === 'question') {
           // Determinar input por tipo de pregunta
           const varName = node.data?.variable?.toLowerCase() || '';
           if (varName.includes('cant') || varName.includes('unid')) input = '1';
           else if (varName.includes('phone') || varName.includes('tel') || varName.includes('cel')) input = '3151234567';
           else if (varName.includes('nom')) input = 'Daniel';
           else if (varName.includes('dir')) input = 'Calle 123';
           else input = 'Respuesta';
        }

        queue.push({ 
          nodeId: conn.to, 
          path: [...path, { nodeId, input }] 
        });
      }
    }

    if (finalPath) {
      this.plannedScenario = finalPath;
      this.currentScenarioStep = 0;
      this.notificationService.show(`Plan generado: ${finalPath.length} pasos para completar la compra.`, 'success');
      this.messages.push({ 
          sender: 'ai', 
          text: `🎯 **SISTEMA**: He trazado un plan de **${finalPath.length} pasos** para llegar al checkout con éxito.`, 
          time: new Date(),
          type: 'system'
      });
    } else {
      this.notificationService.show('No se encontró un camino válido al checkout.', 'warning');
      this.copilotMode = 'reactive';
    }
  }

  // --- Métodos de Trazabilidad Unificados ---
  clearSimulatorSession() {
    this.totalSessionExecutions = 0;
    this.sessionExecutionLog = [];
    this.activeSimNodeId = null;
    this.sessionVariables = {};
    this.messages = [];
    if (this.aiWelcomeMessage) {
      this.messages.push({ sender: 'ai', text: this.aiWelcomeMessage, time: new Date(), tokens: 0, responseTimeMs: 0 });
    }
    if (this.copilotTimer) clearTimeout(this.copilotTimer);
    this.nodeVisitCounts.clear();
  }

  toggleCopilot() {
    this.isCopilotActive = !this.isCopilotActive;
    if (this.isCopilotActive) {
      this.notificationService.show('Copiloto activado: El bot se probará automáticamente.', 'success');
      // Si ya hay un mensaje en espera, activarlo
      if (!this.isTyping) {
         this.checkAndRunCopilotAction();
      }
    } else {
      if (this.copilotTimer) clearTimeout(this.copilotTimer);
      this.notificationService.show('Copiloto desactivado.', 'info');
    }
  }

  setCopilotSpeed(ms: number) {
    this.copilotSpeed = ms;
    this.notificationService.show(`Velocidad ajustada: ${ms}ms`, 'info');
  }

  downloadTestReport() {
    const unvisited = this.allFlowNodes.filter(n => !this.nodeVisitCounts.has(n.id));
    
    const report = {
      timestamp: new Date().toISOString(),
      merchant: this.merchantName,
      coverage: `${this.getCoveragePercentage()}%`,
      totalExecutions: this.totalSessionExecutions,
      executionLog: this.sessionExecutionLog,
      unvisitedNodes: unvisited.map(n => ({ id: n.id, label: n.label, type: n.type })),
      conversation: this.messages.map(m => ({ sender: m.sender, text: m.text, time: m.time }))
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte-pruebas-${this.merchantName.toLowerCase().replace(/\s+/g, '-')}.json`;
    a.click();
    window.URL.revokeObjectURL(url);
    this.notificationService.show('Reporte descargado correctamente.', 'success');
  }

  private async checkAndRunCopilotAction(lastResponse?: any) {
    if (!this.isCopilotActive || !this.botMode || this.isTyping) return;

    // Obtener estado y nodo actual
    let session = lastResponse?.session;
    let waitingFor = session?.waiting_for;
    let currentNodeId = session?.current_node_id;
    
    if (!waitingFor && this.dbConversationId) {
        const { data: s } = await this.supabaseService.getBotSessionByConversation(this.dbConversationId);
        session = s;
        waitingFor = session?.waiting_for;
        currentNodeId = session?.current_node_id;
    }

    if (!waitingFor) return;

    // Detección de bucles (Watchdog)
    if (currentNodeId) {
        const visits = (this.nodeVisitCounts.get(currentNodeId) || 0) + 1;
        this.nodeVisitCounts.set(currentNodeId, visits);
        if (visits > 4) {
            this.isCopilotActive = false;
            this.notificationService.show('⚠️ Copiloto detenido: Posible bucle infinito detectado.', 'error');
            this.messages.push({ 
                sender: 'ai', 
                text: `🚫 **SISTEMA**: Copiloto interrumpido. Se detectó un bucle infinito en el nodo: \`${currentNodeId}\`.`, 
                time: new Date(),
                type: 'system'
            });
            return;
        }
    }

    this.copilotTimer = setTimeout(async () => {
        if (!this.isCopilotActive) return;

        let testInput = '';

        // 1. INTENTAR SEGUIR PLAN (Escenario Fase 5)
        if (this.copilotMode === 'purchase' && this.plannedScenario.length > 0) {
            // Buscar si el nodo actual está en nuestro plan
            const step = this.plannedScenario.find(s => s.nodeId === currentNodeId);
            if (step) {
                testInput = step.input;
                this.currentScenarioStep++;
            }
        }

        // 2. FALLBACK A IA REACTIVA (Fase 3/4)
        if (!testInput) {
            // Intentar usar IA si hay API Key, de lo contrario usar hardocoded
            if (this.aiApiKey && this.copilotMode === 'reactive') {
                try {
                    this.isTyping = true;
                    // Generar respuesta del usuario usando al LLM en rol de cliente
                    const lastBotMsg = lastResponse?.messages?.length > 0 ? lastResponse.messages[lastResponse.messages.length - 1] : '';
                    testInput = await this.generateCopilotAIResponse(lastBotMsg, waitingFor, session?.waiting_for_variable);
                    this.isTyping = false;
                } catch (e) {
                    console.error('Error generando IA para copiloto:', e);
                    this.isTyping = false;
                    testInput = 'Respuesta de emergencia';
                }
            } else {
                if (waitingFor === 'menu_selection' || waitingFor === 'menu') {
                    const options = lastResponse?.options;
                    if (options && options.length > 0) {
                        const choice = Math.floor(Math.random() * options.length) + 1;
                        testInput = choice.toString();
                    } else {
                        testInput = '1';
                    }
                } else if (waitingFor === 'input' || waitingFor === 'variable_input') {
                    const lastBotMsg = lastResponse?.messages?.length > 0 ? lastResponse.messages[lastResponse.messages.length - 1].toLowerCase() : '';
                    const variableName = session?.waiting_for_variable?.toLowerCase() || '';
                    
                    const isPhone = variableName.includes('tel') || variableName.includes('phone') || variableName.includes('cel') ||
                                    lastBotMsg.includes('celular') || lastBotMsg.includes('teléfon') || lastBotMsg.includes('telefon') ||
                                    lastBotMsg.includes('número') || lastBotMsg.includes('numero');

                    const isNumeric = (variableName.includes('cant') || variableName.includes('unid') || 
                                     lastBotMsg.includes('cuánt') || lastBotMsg.includes('cuántos') ||
                                     lastBotMsg.includes('válido') || lastBotMsg.includes('cantidad')) && !isPhone;

                    if (isPhone) {
                        testInput = '3151234567';
                    } else if (isNumeric) {
                        testInput = '1';
                    } else if (variableName.includes('nombre') || lastBotMsg.includes('nombre')) {
                        testInput = 'Daniel Woox';
                    } else if (variableName.includes('pax') || variableName.includes('asistentes')) {
                        testInput = '2';
                    } else if (variableName.includes('direccion') || lastBotMsg.includes('donde') || lastBotMsg.includes('dirección')) {
                        testInput = 'Calle Falsa 123';
                    } else if (variableName.includes('email') || lastBotMsg.includes('correo')) {
                        testInput = 'test@woox.ai';
                    } else if (lastBotMsg.includes('instrucción') || lastBotMsg.includes('instruccion')) {
                        testInput = 'no';
                    } else if (lastBotMsg.includes('?') || lastBotMsg.includes('desea')) {
                        testInput = 'si';
                    } else {
                        testInput = 'Respuesta genérica de prueba';
                    }
                } else if (waitingFor === 'ai_input') {
                    testInput = '¿Qué productos tienes disponibles?';
                }
            }
        }
        
        // 3. EXPLORADOR (Si no hay entrada y modo es explorador, elegir algo al azar del menú)
        if (!testInput && this.copilotMode === 'explorer') {
             if (waitingFor === 'menu_selection' || waitingFor === 'menu') {
                testInput = '1'; // Ya lo hace el fallback pero aquí podríamos ser más específicos
             }
        }

        if (testInput) {
            this.userInput = testInput;
            this.sendMessage();
        }
    }, this.copilotSpeed); 
  }

  // NUEVO: Función para generar respuestas del Copiloto (Cliente Misterioso)
  private async generateCopilotAIResponse(lastBotMsg: string, waitingFor: string, expectedVar?: string): Promise<string> {
      const modelName = (this.aiModel || 'gemini-1.5-flash').trim().replace(/\s+/g, '-');
      const isOpenAI = modelName.toLowerCase().startsWith('gpt-') || modelName.toLowerCase().startsWith('o1-') || modelName.toLowerCase().startsWith('o3-');

      const systemPrompt = `Eres un cliente misterioso probando un chatbot de WhatsApp de una tienda/restaurante.
Tú NO eres el bot. Tú eres el HUMANO que escribe por WhatsApp.
REGLAS ESTRICTAS:
1. Responde de forma muy natural, corta y directa al último mensaje del bot (máximo 1 o 2 líneas).
2. Si te piden un nombre, inventa uno simple (ej. Carlos, Laura).
3. Si te piden un teléfono o dirección, da datos falsos verosímiles.
4. Si te dan un menú numérico (ej. "1. Ver Carta, 2. Hablar con humano"), responde enviando SOLO EL NÚMERO (ej. "1" o "2").
5. Si no entiendes el flujo, reacciona como un humano real ("no entiendo", "quiero comprar").
6. NUNCA menciones que eres una IA ni que estás probando el sistema.
7. NUNCA escribas placeholders HTML o etiquetas especiales.
Estado actual esperado por el bot: Esperando ${waitingFor} ${expectedVar ? `(Variable esperada: ${expectedVar})` : ''}

Último mensaje del bot para que respondas: "${lastBotMsg}"`;

      let apiUrl = '';
      let requestBody: any = {};
      let headers: any = { 'Content-Type': 'application/json' };

      if (this.aiProvider === 'ollama' || this.aiProvider === 'lmstudio') {
        headers['ngrok-skip-browser-warning'] = 'true';
        if (this.aiApiKey) headers['Authorization'] = `Bearer ${this.aiApiKey}`;
      }

      const recentMessages = this.messages.slice(-6).map(m => `${m.sender === 'ai' ? 'Bot' : 'Tú'}: ${m.text}`).join('\n');

      if (isOpenAI) {
        apiUrl = 'https://api.openai.com/v1/chat/completions';
        headers['Authorization'] = `Bearer ${this.aiApiKey}`;
        requestBody = {
          model: modelName,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Historial reciente:\n${recentMessages}\n\nEscribe tu próxima respuesta como cliente:` }
          ],
          temperature: 0.8,
          max_tokens: 100
        };
      } else if (this.aiProvider === 'ollama') {
        apiUrl = `${this.ollamaBaseUrl}/api/chat`;
        requestBody = {
          model: modelName,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Escribe tu próxima respuesta como cliente. Historial:\n${recentMessages}` }
          ],
          stream: false,
          options: { temperature: 0.8 }
        };
      } else if (this.aiProvider === 'lmstudio') {
        let baseUrl = this.lmstudioBaseUrl.replace(/\/v1$/, '').replace(/\/api$/, '');
        apiUrl = `${baseUrl}/api/v1/chat`;
        requestBody = {
          model: modelName,
          system_prompt: systemPrompt,
          input: `Historial:\n${recentMessages}\n\nEscribe tu próxima respuesta:`,
          temperature: 0.8
        };
      } else {
        // Google Gemini
        apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${this.aiApiKey}`;
        const parts = [{ text: systemPrompt + `\n\nHistorial reciente:\n${recentMessages}\n\nEscribe tu próxima respuesta directa como el humano:` }];
        requestBody = {
          contents: [{ role: 'user', parts }],
          generationConfig: { temperature: 0.8, maxOutputTokens: 100 }
        };
      }

      try {
        let response = await fetch(apiUrl, { method: 'POST', headers, body: JSON.stringify(requestBody) });
        if (!response.ok && apiUrl.includes('v1beta')) {
           apiUrl = apiUrl.replace('v1beta', 'v1');
           response = await fetch(apiUrl, { method: 'POST', headers, body: JSON.stringify(requestBody) });
        }
        
        if (!response.ok) return 'Necesito ayuda'; // Fallback pasivo

        const data = await response.json();
        let text = '';
        if (isOpenAI) {
           text = data.choices?.[0]?.message?.content || '';
        } else if (this.aiProvider === 'lmstudio') {
           text = data.choices?.[0]?.message?.content || data.choices?.[0]?.text || '';
        } else if (this.aiProvider === 'ollama') {
           text = data.message?.content || '';
        } else {
           text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        }

        const finalResponse = text.trim();
        return finalResponse || 'Respuesta por defecto';
      } catch (e) {
        console.error('Error in Copilot API:', e);
        return 'Respuesta manual';
      }
  }

  async restartSession() {
    this.clearSimulatorSession();
    this.dbConversationId = null; // Forzar nueva conversación
    await this.ngOnInit();
  }

  getActiveNodeLabel(): string {
    if (!this.activeSimNodeId) return '—';
    return this.activeSimNodeId.split('_')[0] || this.activeSimNodeId;
  }

  getVariableCount(): number {
    return Object.keys(this.sessionVariables || {}).length;
  }

  getCoveragePercentage(): number {
    if (!this.totalFlowNodes) return 0;
    const visitedUnique = new Set(this.sessionExecutionLog.map(l => l.id)).size;
    return Math.round((visitedUnique / this.totalFlowNodes) * 100);
  }

  getNodeIcon(type: string): string {
    switch (type) {
      case 'start': return '🚀';
      case 'message': return '💬';
      case 'question': return '❓';
      case 'menu': return '📋';
      case 'action': return '⚡';
      case 'condition': return '🔀';
      case 'ai_agent': return '🧠';
      case 'end': return '🏁';
      default: return '📍';
    }
  }

  ngOnInit(): void {
    this.initSimulator();
  }

  private async initSimulator() {
    this.clearSimulatorSession();
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
           console.log('[Simulator] Processing bot START flow...');
           const t0 = performance.now();
           const botRes = await this.botRuntime.processMessage(conv.id, this.merchantId, '');
           const t1 = performance.now();
           const stepMs = Math.round(t1 - t0);
           
            if (botRes && botRes.messages.length > 0) {
              this.messages = []; // Limpiar el "Iniciando..."
              this.totalFlowNodes = botRes.totalNodes || 0;
              
              if (botRes.executionPath) {
               this.totalSessionExecutions += botRes.executionPath.length;
               for (const node of botRes.executionPath) {
                 this.activeSimNodeId = node.id;
                 this.onNodeExecuted.emit(node.id);
                 const existing = this.sessionExecutionLog.find(l => l.id === node.id);
                 if (existing) existing.count = (existing.count || 1) + 1;
                 else this.sessionExecutionLog.push({ ...node, count: 1 });
               }
             }

             for (const msg of botRes.messages) {
               this.messages.push({ 
                 sender: 'ai', 
                 text: msg, 
                 time: new Date(),
                 responseTimeMs: stepMs,
                 isRAGContextUsed: false
               });
               await this.supabaseService.saveMessage(this.dbConversationId!, 'ai', msg, true);
             }
             // Trigger Copiloto si está activo
             if (this.isCopilotActive) {
                this.checkAndRunCopilotAction(botRes);
             }
           }
        } else {
          // Guardar el saludo inicial de la IA
          await this.supabaseService.saveMessage(this.dbConversationId!, 'ai', this.messages[0].text, true);
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

  ngAfterViewChecked() {
    // El scroll se maneja manualmente en los puntos de inserción para evitar saltos molestos
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
      await this.supabaseService.saveMessage(this.dbConversationId, 'customer', userText, true);
    }

    this.userInput = '';
    this.isTyping = true;

    try {
      // --- LÓGICA DE BOT (NUEVA) ---
      if (this.botMode) {
        const t0 = performance.now();
        const botResponse = await this.botRuntime.processMessage(this.dbConversationId!, this.merchantId, userText);
        const t1 = performance.now();
        const stepMs = Math.round(t1 - t0);
        
        if (botResponse) {
          this.totalFlowNodes = botResponse.totalNodes || 0;
        }
        
        // PROCESAR EXECUTION PATH
        if (botResponse && botResponse.executionPath) {
          this.totalSessionExecutions += botResponse.executionPath.length;
          for (const node of botResponse.executionPath) {
            this.activeSimNodeId = node.id;
            this.onNodeExecuted.emit(node.id);
            const existing = this.sessionExecutionLog.find(l => l.id === node.id);
            if (existing) existing.count = (existing.count || 1) + 1;
            else this.sessionExecutionLog.push({ ...node, count: 1 });
          }
        }
        
        setTimeout(async () => {
          this.isTyping = false;
          if (botResponse && botResponse.messages.length > 0) {
            for (const msg of botResponse.messages) {
              this.messages.push({ 
                sender: 'ai', 
                text: msg, 
                time: new Date(),
                responseTimeMs: stepMs,
                tokens: 0,
                isRAGContextUsed: false
              });
              await this.supabaseService.saveMessage(this.dbConversationId!, 'ai', msg, true);
            }
          } else {
            this.messages.push({ sender: 'ai', text: 'No tengo una respuesta para eso.\n\nEscribe *0* para volver al inicio.', time: new Date(), tokens: 0, responseTimeMs: 0 });
          }
          this.cdr.detectChanges();
          this.scrollToBottom();

          // RECURSIÓN DEL COPILOTO: Continuar si está activo
          if (this.isCopilotActive && botResponse) {
            this.checkAndRunCopilotAction(botResponse);
          }
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
6. El total actual del carrito es $${this.cartTotal.toFixed(2)}.)`;

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

      // --- RAG: BÚSQUEDA SEMÁNTICA EN TIEMPO REAL (NUEVO CEREBRO) ---
      let usedRAG = false;
      try {
        console.log('🔍 Generando embedding para búsqueda semántica...');
        const queryEmbedding = await this.supabaseService.generateEmbedding(userText, {
          ai_api_key: this.aiApiKey,
          ai_provider: this.aiProvider,
          ollama_base_url: this.ollamaBaseUrl
        });

        if (queryEmbedding) {
          console.log('🔍 Buscando fragmentos relevantes en el Cerebro...');
          const { data: relevantChunks, error: searchError } = await this.supabaseService.searchKnowledgeBase(
            this.merchantId,
            queryEmbedding,
            0.4, // Threshold un poco más flexible
            5    // Traer hasta 5 fragmentos
          );

          if (relevantChunks && relevantChunks.length > 0) {
            console.log('✨ Conocimiento encontrado:', relevantChunks.length, 'fragmentos');
            usedRAG = true;
            fullSystemInstruction += `\n\n### 📚 CONOCIMIENTO EXTRAÍDO DEL CEREBRO (RAG):\nUsa esta información específica para responder con precisión:\n`;
            relevantChunks.forEach((chunk: any) => {
              fullSystemInstruction += `- ${chunk.content}\n`;
            });
          }
        }
      } catch (ragError) {
        console.error('⚠️ Error en RAG (Vectorial):', ragError);
      }
      // -------------------------------------------------------------

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

      const startTime = performance.now();

      let response = await fetch(apiUrl, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestBody)
      });

      // Fallback 1: Si falla con 404 (v1beta not found), probar con v1 estable
      if (this.aiProvider === 'google_gemini' && response.status === 404 && apiUrl.includes('v1beta')) {
        console.log('🔄 Reintentando Gemini con v1 estable...');
        apiUrl = apiUrl.replace('v1beta', 'v1');
        response = await fetch(apiUrl, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(requestBody)
        });
      }

      // Fallback 2: si falla con system_instruction (solicitado en el 400), intentar como mensaje USER
      if (this.aiProvider === 'google_gemini' && !response.ok && !modelName.toLowerCase().includes('gemma-3')) {
        console.log('🔄 Reintentando Gemini con fallback de mensaje USER (blend)...');

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

      const endTime = performance.now();
      const responseTimeMs = Math.round(endTime - startTime);

      console.log('📥 Response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json();
        console.error('❌ Error response:', errorData);
        throw new Error(`API Error ${response.status}: ${JSON.stringify(errorData)}`);
      }

      const data = await response.json();
      let aiText = '';
      let usedTokens = 0;

      if (isOpenAI) {
        aiText = data.choices?.[0]?.message?.content || '';
        usedTokens = data.usage?.total_tokens || 0;
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
        usedTokens = data.usage?.total_tokens || 0;
      } else if (this.aiProvider === 'ollama') {
        aiText = data.message?.content || '';
        usedTokens = data.eval_count ? data.prompt_eval_count + data.eval_count : 0;
      } else {
        aiText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        usedTokens = data.usageMetadata?.totalTokenCount || 0;
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
        product: lastProduct,
        tokens: usedTokens,
        responseTimeMs,
        modelName,
        isRAGContextUsed: usedRAG
      });

      // Guardar respuesta de la IA en la DB
      if (this.dbConversationId) {
        await this.supabaseService.saveMessage(this.dbConversationId, 'ai', aiText, true);
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
    if (!this.myScrollContainer) return;
    setTimeout(() => {
      try {
        const el = this.myScrollContainer.nativeElement;
        el.scrollTop = el.scrollHeight;
      } catch(e) {}
    }, 50);
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

    // 3. Cursivas: *texto* o _texto_ -> <em>texto</em>
    formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');
    formatted = formatted.replace(/_(.*?)_/g, '<em>$1</em>');

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
