import { TestBed } from '@angular/core/testing';
import { NotificationService } from './notification.service';

describe('NotificationService', () => {
  let service: NotificationService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(NotificationService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should add a toast notification', () => {
    service.show('Test message', 'success');
    const toasts = service.toasts();
    expect(toasts.length).toBe(1);
    expect(toasts[0].message).toBe('Test message');
    expect(toasts[0].type).toBe('success');
  });

  it('should remove a toast notification', () => {
    service.show('Test message 1', 'info');
    const toasts = service.toasts();
    const id = toasts[0].id;
    service.remove(id);
    expect(service.toasts().length).toBe(0);
  });
});
