import { createClient } from '@supabase/supabase-js';

// Intenta obtener configuración de localStorage (para configuración dinámica en caliente)
const customUrl = localStorage.getItem('supabase_url');
const customKey = localStorage.getItem('supabase_key');

// Valores por defecto (Fallback)
export const supabaseUrl = customUrl || 'https://khgegukjrtyjmonhavan.supabase.co';
export const supabaseKey = customKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtoZ2VndWtqcnR5am1vbmhhdmFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3OTQ4MTAsImV4cCI6MjA4NTM3MDgxMH0.V-dc1zSkU5R5hj45ihWsHR-9FWFTP4qxWyVUnTC8qdc';

export const supabase = createClient(supabaseUrl, supabaseKey);
