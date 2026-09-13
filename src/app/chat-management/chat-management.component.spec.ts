import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ChatManagementComponent } from './chat-management.component';
import { SupabaseService } from '../supabase.service';
import { NotificationService } from '../notification.service';
import { MobileService } from '../mobile.service';

describe('ChatManagementComponent', () => {
  let component: ChatManagementComponent;
  let fixture: ComponentFixture<ChatManagementComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChatManagementComponent],
      providers: [
        provideRouter([]),
        {
          provide: SupabaseService,
          useValue: {
            agentStatus: () => ({ isOnline: true }),
            client: {
              auth: {
                getSession: () => Promise.resolve({ data: { session: null }, error: null }),
                onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } })
              },
              channel: () => ({
                on: () => ({ subscribe: () => ({}) })
              }),
              removeChannel: () => {}
            },
            getConversations: () => Promise.resolve({ data: [], error: null }),
            getMerchantData: () => Promise.resolve({ data: null, error: null })
          }
        },
        NotificationService,
        MobileService
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ChatManagementComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create ChatManagementComponent', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with default filters and options', () => {
    expect(component.selectedChannel).toBe('all');
    expect(component.chatStatusFilter).toBe('all');
    expect(component.showCrmPanel).toBe(true);
    expect(component.isInternalNote).toBe(false);
  });

  it('should filter slash snippets based on query', () => {
    component.slashQuery = 'banco';
    const filtered = component.filteredSlashSnippets;
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered[0].code).toBe('banco');
  });

  it('should toggle CRM panel visibility', () => {
    const initialState = component.showCrmPanel;
    component.toggleCrmPanel();
    expect(component.showCrmPanel).toBe(!initialState);
  });

  it('should insert emojis into message text', () => {
    component.newMessage = 'Hola';
    component.insertEmoji('🚀');
    expect(component.newMessage).toBe('Hola🚀');
  });
});
