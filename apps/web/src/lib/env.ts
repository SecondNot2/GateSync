export const webEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000/api/v1',
  hasSupabaseConfig: Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ),
  isDevDataFallbackEnabled:
    process.env.NODE_ENV !== 'production' &&
    (process.env.NEXT_PUBLIC_ENABLE_DEV_DATA_FALLBACK ?? 'true') === 'true'
};
