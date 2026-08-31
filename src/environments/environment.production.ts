// src/environments/environment.production.ts  ← PRODUCCIÓN
// NOTA: En CI/CD, GitHub Actions sobreescribe este archivo con las credenciales reales de PROD.
export const environment = {
    production: true,
    supabaseUrl: 'http://woox-supabase-847694-144-91-80-164.sslip.io',
    supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3ODgxMzkyMDcsImV4cCI6MTg5MzQ1NjAwMCwicm9sZSI6ImFub24iLCJpc3MiOiJzdXBhYmFzZSJ9.kuixUwiC01Gu3WPb_HtSDiREnal0jwGcymbKCOGSlo0',
    appVersion: '2.0.0',
    envName: 'production'
};
