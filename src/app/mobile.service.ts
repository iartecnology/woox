import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class MobileService {
  public isMobile = signal(window.innerWidth < 768);
  public isImmersiveOpen = signal(false);

  constructor() {
    window.addEventListener('resize', () => {
      this.isMobile.set(window.innerWidth < 768);
    });
  }

  setImmersive(val: boolean) {
    this.isImmersiveOpen.set(val);
  }
}
