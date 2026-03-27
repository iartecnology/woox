import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class MobileService {
  public isMobile = signal(window.innerWidth < 768);
  public isImmersiveOpen = signal(false);
  
  // Unified header signals
  public headerTitle = signal('Woox');
  public showBackButton = signal(false);
  public onBackAction = signal<(() => void) | null>(null);

  constructor() {
    window.addEventListener('resize', () => {
      this.isMobile.set(window.innerWidth < 768);
    });
  }

  setImmersive(val: boolean) {
    this.isImmersiveOpen.set(val);
  }

  setHeader(title: string, showBack: boolean = false, backAction: (() => void) | null = null) {
     this.headerTitle.set(title);
     this.showBackButton.set(showBack);
     this.onBackAction.set(backAction);
     this.isImmersiveOpen.set(false); // Reset immersive state on every title change by default
  }

  triggerBack() {
    const action = this.onBackAction();
    if (action) {
      action();
    }
  }
}
