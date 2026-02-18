// src/environments/environment.ts  ← DESARROLLO (LOCAL)
// NOTA: En CI/CD, GitHub Actions sobreescribe este archivo con las credenciales reales.
// Para desarrollo local, usa las credenciales del proyecto de PRODUCCIÓN como fallback.
export const environment = {
    production: false,
    supabaseUrl: 'https://khgegukjrtyjmonhavan.supabase.co',
    supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtoZ2VndWtqcnR5am1vbmhhdmFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3OTQ4MTAsImV4cCI6MjA4NTM3MDgxMH0.V-dc1zSkU5R5hj45ihWsHR-9FWFTP4qxWyVUnTC8qdc',
    appVersion: '2.0.0-dev',
    envName: 'development'
};
