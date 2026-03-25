import { ApplicationConfig, provideZoneChangeDetection, LOCALE_ID, isDevMode } from '@angular/core';
import { provideRouter } from '@angular/router';
import { registerLocaleData } from '@angular/common';
import localeEs from '@angular/common/locales/es';

import { routes } from './app.routes';
import { provideCharts, withDefaultRegisterables } from 'ng2-charts';
import { provideServiceWorker } from '@angular/service-worker';

registerLocaleData(localeEs, 'es');

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: false }),
    provideRouter(routes),
    provideCharts(withDefaultRegisterables()),
    { provide: LOCALE_ID, useValue: 'es' },
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000'
    })
  ]
};
