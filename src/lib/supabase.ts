import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[dealstudio] Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — set them in .env');
}

// Singleton so React Strict Mode doesn't create two clients fighting the auth lock.
const KEY = '__dealstudio_supabase__';
declare global { interface Window { [KEY]?: ReturnType<typeof createClient> } }
export const supabase =
  (globalThis.window?.[KEY]) ??
  createClient(supabaseUrl || 'http://localhost', supabaseAnonKey || 'anon', {
    auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true },
  });
if (globalThis.window && !globalThis.window[KEY]) globalThis.window[KEY] = supabase;
