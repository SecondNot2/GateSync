import { NextResponse, type NextRequest } from 'next/server';
import { clearAuthSessionCookies, readAuthCookieState, setAuthSessionCookies } from '@/lib/auth/session-cookies';
import { webEnv } from '@/lib/env';
import { createServerSupabaseAuthClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const cookieState = readAuthCookieState(request);

  if (cookieState.hasUsableAccessToken && cookieState.accessToken) {
    return NextResponse.json({ accessToken: cookieState.accessToken });
  }

  if (!cookieState.refreshToken) {
    return createUnauthorizedResponse('Bạn cần đăng nhập GateSync để xem dữ liệu vận hành.');
  }

  if (!webEnv.hasSupabaseConfig) {
    return createUnauthorizedResponse('Chưa cấu hình Supabase cho đăng nhập GateSync.');
  }

  const supabase = createServerSupabaseAuthClient();
  const { data, error } = await supabase.auth.refreshSession({
    refresh_token: cookieState.refreshToken
  });

  if (error || !data.session) {
    return createUnauthorizedResponse('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
  }

  const response = NextResponse.json({ accessToken: data.session.access_token });
  setAuthSessionCookies(response, data.session);

  return response;
}

function createUnauthorizedResponse(message: string) {
  const response = NextResponse.json(
    {
      error: {
        message
      }
    },
    { status: 401 }
  );
  clearAuthSessionCookies(response);

  return response;
}
