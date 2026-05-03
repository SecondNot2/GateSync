import { webEnv } from '@/lib/env';
import { createBrowserSupabaseClient } from '@/lib/supabase/browser';

export type WebApiSession =
  | {
      mode: 'api';
      accessToken: string;
    }
  | {
      mode: 'dev';
      reason: string;
    };

export async function resolveWebApiSession(): Promise<WebApiSession> {
  if (!webEnv.hasSupabaseConfig) {
    return resolveDevFallback('Chưa cấu hình Supabase cho web app.');
  }

  const supabase = createBrowserSupabaseClient();
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    return resolveDevFallback('Không đọc được phiên đăng nhập Supabase.');
  }

  const accessToken = data.session?.access_token;

  if (!accessToken) {
    return resolveDevFallback('Chưa có phiên đăng nhập Supabase trong trình duyệt.');
  }

  return {
    mode: 'api',
    accessToken
  };
}

function resolveDevFallback(reason: string): WebApiSession {
  if (webEnv.isDevDataFallbackEnabled) {
    return {
      mode: 'dev',
      reason
    };
  }

  throw new Error('Bạn cần đăng nhập GateSync để xem dữ liệu vận hành.');
}
