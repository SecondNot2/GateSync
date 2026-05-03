import { createClient } from '@supabase/supabase-js';
import { webEnv } from '@/lib/env';

export function createBrowserSupabaseClient() {
  if (!webEnv.supabaseUrl || !webEnv.supabaseAnonKey) {
    throw new Error('Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  }

  return createClient(webEnv.supabaseUrl, webEnv.supabaseAnonKey);
}
