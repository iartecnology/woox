import { TestBed } from '@angular/core/testing';
import { MobileService } from './mobile.service';

describe('MobileService', () => {
  let service: MobileService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(MobileService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should update header and back action', () => {
    let clicked = false;
    service.setHeader('Nuevo Título', true, () => { clicked = true; });

    expect(service.headerTitle()).toBe('Nuevo Título');
    expect(service.showBackButton()).toBe(true);

    service.triggerBack();
    expect(clicked).toBe(true);
  });

  it('should toggle immersive mode', () => {
    service.setImmersive(true);
    expect(service.isImmersiveOpen()).toBe(true);
    service.setImmersive(false);
    expect(service.isImmersiveOpen()).toBe(false);
  });
});
