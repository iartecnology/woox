import { createClient } from '@supabase/supabase-js';
import { environment } from '../environments/environment';

// Prioridad:
// 1. localStorage (override manual por el admin desde el panel)
// 2. environment.ts (inyectado por GitHub Actions según el ambiente)
const customUrl = localStorage.getItem('supabase_url');
const customKey = localStorage.getItem('supabase_key');

export const supabaseUrl = customUrl || environment.supabaseUrl;
export const supabaseKey = customKey || environment.supabaseAnonKey;

export const supabase = createClient(supabaseUrl, supabaseKey);
