import { cookies } from 'next/headers';
import { authCookieNames } from '@/lib/auth/session-cookies';
import { webEnv } from '@/lib/env';
import type { WebApiSession } from '@/lib/api/session';

const accessTokenLeewaySeconds = 45;

export async function resolveServerApiSession(): Promise<WebApiSession> {
  if (!webEnv.hasSupabaseConfig) {
    return resolveServerDevFallback('Chưa cấu hình Supabase cho web app.');
  }

  const cookieStore = await cookies();
  const accessToken = cookieStore.get(authCookieNames.accessToken)?.value;
  const refreshToken = cookieStore.get(authCookieNames.refreshToken)?.value;
  const expiresAt = parseExpiresAt(cookieStore.get(authCookieNames.expiresAt)?.value);
  const isAccessTokenFresh = expiresAt
    ? expiresAt > Math.floor(Date.now() / 1000) + accessTokenLeewaySeconds
    : true;

  if (accessToken && isAccessTokenFresh) {
    return {
      mode: 'api',
      accessToken
    };
  }

  if (refreshToken) {
    return resolveServerDevFallback('Phiên đăng nhập cần được làm mới trước khi tải dữ liệu.');
  }

  return resolveServerDevFallback('Chưa có phiên đăng nhập GateSync.');
}

function resolveServerDevFallback(reason: string): WebApiSession {
  if (webEnv.isDevDataFallbackEnabled) {
    return {
      mode: 'dev',
      reason
    };
  }

  throw new Error('Bạn cần đăng nhập GateSync để xem dữ liệu vận hành.');
}

function parseExpiresAt(value?: string) {
  if (!value) {
    return undefined;
  }

  const expiresAt = Number(value);

  return Number.isFinite(expiresAt) ? expiresAt : undefined;
}
