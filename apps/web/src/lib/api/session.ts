import { webEnv } from '@/lib/env';

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

  const response = await fetch('/auth/session', {
    method: 'GET',
    credentials: 'include'
  });

  const data = (await response.json().catch(() => ({}))) as {
    accessToken?: string;
    error?: {
      message?: string;
    };
  };

  if (!response.ok) {
    return resolveDevFallback(data.error?.message ?? 'Không đọc được phiên đăng nhập GateSync.');
  }

  const accessToken = data.accessToken;

  if (!accessToken) {
    return resolveDevFallback('Chưa có phiên đăng nhập GateSync.');
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
