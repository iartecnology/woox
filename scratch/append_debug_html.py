html_path = 'src/app/bot-builder/bot-builder.component.html'
with open(html_path, 'r') as f:
    html = f.read()

debug_panel = '''
<!-- PANEL DE DEBUG LOGS (Slide-over) -->
<div class="debug-logs-panel" [class.visible]="showDebugLogs">
  <div class="debug-header" style="display: flex; justify-content: space-between; align-items: center; padding: 15px 20px; background: #fff; border-bottom: 1px solid #e2e8f0; position: sticky; top: 0; z-index: 10;">
    <h3 style="margin: 0; font-size: 1.1em; display: flex; align-items: center; gap: 8px;">🐞 Historial de Ejecución</h3>
    <div class="debug-actions" style="display: flex; gap: 10px;">
      <button class="btn-refresh" (click)="loadExecutionLogs()" [class.spinning]="isLoadingLogs" style="background: none; border: none; cursor: pointer; font-size: 1.2em;">🔄</button>
      <button class="btn-close" (click)="showDebugLogs = false" style="background: none; border: none; cursor: pointer; font-size: 1.2em;">✕</button>
    </div>
  </div>

  <div class="debug-content" style="padding-bottom: 20px;">
    <div *ngIf="isLoadingLogs" class="loading-state" style="padding: 20px; text-align: center; color: #64748b;">
      <span class="spinner-debug">⌛</span> Cargando logs...
    </div>
    
    <div *ngIf="!isLoadingLogs && executionLogs.length === 0" class="empty-state" style="padding: 40px 20px; text-align: center; color: #64748b;">
      <div style="font-size: 2em; margin-bottom: 10px;">🔍</div>
      <p>No hay logs de ejecución.</p>
      <small>Prueba el flujo en el simulador para generar datos.</small>
    </div>

    <div class="log-list" *ngIf="!isLoadingLogs && executionLogs.length > 0">
      <div class="log-item" *ngFor="let log of executionLogs" [class.error]="log.error_message" 
           style="padding: 12px; border-bottom: 1px solid #f1f5f9; display: flex; gap: 12px; font-size: 0.85em;">
        <div class="log-time" style="color: #94a3b8; font-family: monospace; min-width: 55px;">{{ log.created_at | date:'HH:mm:ss' }}</div>
        <div class="log-main" style="flex: 1;">
          <div class="log-node" style="margin-bottom: 4px;">
            <span class="node-type-icon" style="margin-right: 5px;">{{ log.node_type === 'user_input' ? '👤' : '🤖' }}</span>
            <strong style="color: #1e293b;">{{ getLogNodeLabel(log.node_id) }}</strong>
            <small class="exec-time" *ngIf="log.execution_time_ms" style="color: #94a3b8; margin-left: 8px;">{{ log.execution_time_ms }}ms</small>
          </div>
          <div class="log-details" style="background: #f8fafc; padding: 6px 8px; border-radius: 4px; border-left: 2px solid #cbd5e1;">
            <div class="detail-row" *ngIf="log.input_received">
              <span class="label" style="font-weight: 600; color: #64748b; margin-right: 4px;">Entrada:</span>
              <span class="value" style="color: #334155;">{{ log.input_received }}</span>
            </div>
            <div class="detail-row" *ngIf="log.output_sent">
              <span class="label" style="font-weight: 600; color: #64748b; margin-right: 4px;">Salida:</span>
              <span class="value" style="color: #334155;">{{ log.output_sent }}</span>
            </div>
            <div class="detail-row" *ngIf="log.error_message">
              <span class="label" style="font-weight: 600; color: #ef4444; margin-right: 4px;">Error:</span>
              <span class="value" style="color: #ef4444;">{{ log.error_message }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
'''

if 'debug-logs-panel' not in html:
    new_html = html + debug_panel
    with open(html_path, 'w') as f:
        f.write(new_html)
    print("HTML de Debug Logs añadido.")
else:
    print("El panel ya existe en el HTML.")
