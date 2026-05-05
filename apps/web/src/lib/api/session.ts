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

let browserSessionCache:
  | {
      expiresAt: number;
      promise: Promise<WebApiSession>;
    }
  | undefined;

export async function resolveWebApiSession(): Promise<WebApiSession> {
  if (!webEnv.hasSupabaseConfig) {
    return resolveDevFallback('Chưa cấu hình Supabase cho web app.');
  }

  if (
    typeof window !== 'undefined' &&
    browserSessionCache &&
    browserSessionCache.expiresAt > Date.now()
  ) {
    return browserSessionCache.promise;
  }

  const sessionPromise = fetch('/auth/session', {
    method: 'GET',
    credentials: 'include'
  }).then(async (response) => {
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
    } satisfies WebApiSession;
  });

  if (typeof window !== 'undefined') {
    browserSessionCache = {
      expiresAt: Date.now() + 30_000,
      promise: sessionPromise
    };
  }

  try {
    return await sessionPromise;
  } catch (error) {
    clearWebApiSessionCache();
    throw error;
  }
}

export function clearWebApiSessionCache() {
  browserSessionCache = undefined;
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
