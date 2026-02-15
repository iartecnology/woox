import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LiveOrderService, LiveCart } from '../live-order.service';
import { Subscription } from 'rxjs';

@Component({
    selector: 'app-live-orders-monitor',
    standalone: true,
    imports: [CommonModule, FormsModule],
    template: `
    <div class="monitor-container p-6">
      <div class="monitor-header mb-8">
        <div class="flex items-center gap-3">
          <div class="live-indicator">
            <span class="ping"></span>
            <span class="dot"></span>
          </div>
          <h2 class="text-3xl font-extrabold text-white tracking-tight">Carritos en Tiempo Real</h2>
        </div>
        <p class="text-indigo-200 mt-2">Monitorea las ventas que están sucediendo ahora mismo a través de la IA.</p>
      </div>

      <div class="monitor-grid">
        <div *ngIf="filteredCarts.length === 0" class="empty-monitor">
          <span class="icon">🛒</span>
          <h3>No hay carritos activos</h3>
          <p>Los carritos que la IA vaya armando aparecerán aquí automáticamente.</p>
        </div>

        <div *ngFor="let cart of filteredCarts" class="cart-card" [class.confirmed]="cart.status === 'confirmed'">
          <div class="card-header">
            <div class="customer-info">
              <span class="avatar">{{ cart.customerName[0] }}</span>
              <div>
                <h4>{{ cart.customerName }}</h4>
                <p class="session-id">Sesión: {{ cart.id }}</p>
              </div>
            </div>
            <div class="status-badge" [class]="cart.status">
              {{ cart.status === 'active' ? '🔴 EN VIVO' : '✅ CONFIRMADO' }}
            </div>
          </div>

          <div class="items-list">
            <div *ngFor="let item of cart.items" class="cart-item">
              <span class="q">{{ item.quantity }}x</span>
              <span class="n">{{ item.name }}</span>
              <span class="p">$ {{ (item.price * item.quantity).toFixed(2) }}</span>
            </div>
            <div *ngIf="cart.items.length === 0" class="empty-items">
              Consultando menú...
            </div>
          </div>

          <div class="card-footer">
            <div class="total-section">
              <span class="label">Total Estimado</span>
              <span class="amount">$ {{ cart.total.toFixed(2) }}</span>
            </div>
            <div class="actions">
              <button class="view-btn" (click)="viewConversation(cart)">
                <span class="icon">👁️</span> Espiar
              </button>
              <button *ngIf="cart.status === 'active'" class="push-btn">
                <span class="pulse"></span> Oferta Relámpago ⚡
              </button>
            </div>
          </div>
          <div class="progress-bar">
            <div class="bar" [style.width]="cart.status === 'confirmed' ? '100%' : '65%'"></div>
          </div>
        </div>
      </div>
    </div>
  `,
    styles: [`
    .monitor-container {
      min-height: 100vh;
      background: radial-gradient(circle at top left, #1e1b4b 0%, #0f172a 100%);
      color: white;
    }
    .live-indicator {
      position: relative;
      width: 12px; height: 12px;
    }
    .ping {
      position: absolute;
      width: 100%; height: 100%;
      background: #ef4444;
      border-radius: 50%;
      opacity: 0.75;
      animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;
    }
    @keyframes ping {
      75%, 100% { transform: scale(2.5); opacity: 0; }
    }
    .dot {
      position: relative;
      display: block;
      width: 12px; height: 12px;
      background: #ef4444;
      border-radius: 50%;
    }
    .monitor-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
      gap: 24px;
    }
    .cart-card {
      background: rgba(30, 41, 59, 0.7);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 24px;
      padding: 24px;
      transition: all 0.3s ease;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .cart-card:hover {
      transform: translateY(-8px);
      border-color: rgba(99, 102, 241, 0.5);
      box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.5);
    }
    .cart-card.confirmed {
      border-color: #22c55e;
      background: rgba(21, 128, 61, 0.1);
    }
    .card-header {
      display: flex; justify-content: space-between; align-items: flex-start;
    }
    .customer-info { display: flex; gap: 12px; align-items: center; }
    .avatar {
      width: 48px; height: 48px;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      border-radius: 16px;
      display: flex; align-items: center; justify-content: center;
      font-weight: 800; font-size: 1.2rem;
    }
    .customer-info h4 { margin: 0; font-weight: 700; color: #f8fafc; }
    .session-id { margin: 0; font-size: 0.75rem; color: #94a3b8; }
    
    .status-badge {
      padding: 4px 12px; font-size: 0.7rem; font-weight: 800;
      border-radius: 20px; letter-spacing: 0.05em;
    }
    .status-badge.active { background: rgba(239, 68, 68, 0.2); color: #f87171; }
    .status-badge.confirmed { background: rgba(34, 197, 94, 0.2); color: #4ade80; }

    .items-list {
      flex: 1;
      background: rgba(15, 23, 42, 0.4);
      border-radius: 16px;
      padding: 16px;
      display: flex; flex-direction: column; gap: 8px;
    }
    .cart-item {
      display: flex; gap: 10px; font-size: 0.9rem; align-items: center;
    }
    .q { color: #818cf8; font-weight: 800; }
    .n { flex: 1; color: #cbd5e1; }
    .p { font-weight: 600; color: #f8fafc; }
    .empty-items { font-size: 0.85rem; color: #64748b; font-style: italic; text-align: center; margin: 10px 0; }

    .card-footer {
      border-top: 1px solid rgba(255, 255, 255, 0.05);
      padding-top: 20px;
    }
    .total-section {
      display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;
    }
    .total-section .label { color: #94a3b8; font-size: 0.85rem; }
    .total-section .amount { font-size: 1.4rem; font-weight: 800; color: #fff; }

    .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .view-btn, .push-btn {
      padding: 12px; border: none; border-radius: 12px;
      font-weight: 700; font-size: 0.85rem; cursor: pointer;
      display: flex; align-items: center; justify-content: center; gap: 8px;
      transition: all 0.2s;
    }
    .view-btn { background: rgba(255, 255, 255, 0.1); color: white; }
    .view-btn:hover { background: rgba(255, 255, 255, 0.2); }
    .push-btn { 
      background: linear-gradient(135deg, #f59e0b, #ea580c); 
      color: white; 
      position: relative;
      overflow: hidden;
    }
    .push-btn:hover { transform: scale(1.05); filter: brightness(1.1); }

    .progress-bar {
      height: 6px; background: rgba(255, 255, 255, 0.05); border-radius: 3px;
      margin-top: 12px; overflow: hidden;
    }
    .bar { height: 100%; background: #6366f1; transition: width 1s ease; }

    .empty-monitor {
      grid-column: 1 / -1;
      text-align: center; padding: 80px 20px;
      background: rgba(255, 255, 255, 0.02);
      border: 2px dashed rgba(255, 255, 255, 0.1);
      border-radius: 32px;
    }
    .empty-monitor .icon { font-size: 4rem; display: block; margin-bottom: 20px; opacity: 0.2; }
    .empty-monitor h3 { font-size: 1.5rem; margin-bottom: 8px; color: #94a3b8; }
    .empty-monitor p { color: #64748b; }
  `]
})
export class LiveOrdersMonitorComponent implements OnInit, OnDestroy {
    @Input() merchantId: string = '';

    carts: LiveCart[] = [];
    private sub?: Subscription;

    constructor(private liveOrderService: LiveOrderService) { }

    ngOnInit() {
        this.sub = this.liveOrderService.liveCarts$.subscribe(carts => {
            this.carts = carts;
        });
    }

    ngOnDestroy() {
        this.sub?.unsubscribe();
    }

    get filteredCarts() {
        return this.carts.filter(c => c.merchantId === this.merchantId)
            .sort((a, b) => b.lastUpdate.getTime() - a.lastUpdate.getTime());
    }

    viewConversation(cart: LiveCart) {
        alert('Espiando conversación de ' + cart.customerName + '...');
    }
}
