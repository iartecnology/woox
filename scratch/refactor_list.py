import re

html_path = 'src/app/super-admin/super-admin.component.html'
ts_path = 'src/app/super-admin/super-admin.component.ts'

with open(html_path, 'r') as f:
    html = f.read()

# Buscamos <section class="merchants-section"> ... </section>
pattern = re.compile(r'<section class="merchants-section">.*?</section>', re.DOTALL)
replacement = '''<app-merchant-list 
    [merchants]="merchants" 
    [isLoading]="isLoading" 
    [isMobile]="isMobile()"
    (onEdit)="openModal($event)"
    (onDelete)="confirmDeleteMerchant($event)"
    (onEnter)="enterAsMerchant($event)"
    (onAIConfig)="openAIConfig($event)"
    (onBotBuilder)="goToBotBuilder($event)"
    (onCatalog)="goToCatalog($event)"
    (onBrain)="goToBrain($event)"
    (onReservations)="goToReservations($event)"
    (onLanding)="goToLandingBuilder($event)"
    (onSimulator)="testChatSimulator($event)"
    (onOmni)="openOmniConfig($event)"
    (onWidget)="generateChatCode($event)"
    (onBiolink)="openBiolinkConfig($event)"
    (onMonitor)="openLiveMonitor($event)"
    (onClearData)="openClearDataModal($event)"
    (onInitFolders)="initializeMerchantFolder($event)"
    (onToggleStatus)="toggleMerchantStatus($event)"
    (onUsers)="openUserManager($event)"
    (onTeams)="openTeamManager($event)"
    (onStats)="viewMerchantStats($event)"
></app-merchant-list>'''

new_html = pattern.sub(replacement, html)
with open(html_path, 'w') as f:
    f.write(new_html)

# Add import to TS file
with open(ts_path, 'r') as f:
    ts = f.read()

import_stmt = "import { MerchantListComponent } from './components/merchant-list/merchant-list.component';\n"
if 'MerchantListComponent' not in ts:
    ts = import_stmt + ts
    
    # Add to imports array
    ts = ts.replace('imports: [CommonModule, FormsModule, ChatSimulatorComponent, LiveOrdersMonitorComponent, AppInfoPanelComponent]', 
                    'imports: [CommonModule, FormsModule, ChatSimulatorComponent, LiveOrdersMonitorComponent, AppInfoPanelComponent, MerchantListComponent]')

with open(ts_path, 'w') as f:
    f.write(ts)

print("HTML y TS de super-admin actualizados.")
