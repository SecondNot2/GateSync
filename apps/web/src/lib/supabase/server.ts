import { createClient } from '@supabase/supabase-js';
import { webEnv } from '@/lib/env';

export function createServerSupabaseAuthClient() {
  if (!webEnv.hasSupabaseConfig) {
    throw new Error('Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  }

  return createClient(webEnv.supabaseUrl, webEnv.supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false
    }
  });
}
