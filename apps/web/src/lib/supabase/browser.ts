import { createClient } from '@supabase/supabase-js';
import { webEnv } from '@/lib/env';

export function createBrowserSupabaseClient() {
  if (!webEnv.supabaseUrl || !webEnv.supabaseAnonKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  }

  return createClient(webEnv.supabaseUrl, webEnv.supabaseAnonKey);
}
