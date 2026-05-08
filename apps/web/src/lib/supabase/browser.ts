import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { webEnv } from '@/lib/env';

let supabaseClient: SupabaseClient | undefined;

export function createBrowserSupabaseClient() {
  if (!webEnv.supabaseUrl || !webEnv.supabaseAnonKey) {
    throw new Error('Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  }

  if (!supabaseClient) {
    supabaseClient = createClient(webEnv.supabaseUrl, webEnv.supabaseAnonKey);
  }

  return supabaseClient;
}
