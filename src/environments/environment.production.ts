// src/environments/environment.production.ts  ← PRODUCCIÓN
export const environment = {
    production: true,
    supabaseUrl: 'SUPABASE_URL_PROD',       // Inyectado por GitHub Actions
    supabaseAnonKey: 'SUPABASE_ANON_KEY_PROD', // Inyectado por GitHub Actions
    appVersion: '2.0.0',
    envName: 'production'
};
