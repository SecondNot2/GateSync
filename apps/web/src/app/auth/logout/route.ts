import { NextResponse, type NextRequest } from 'next/server';
import { loginPath } from '@/lib/auth/paths';
import { clearAuthSessionCookies, readAuthCookieState } from '@/lib/auth/session-cookies';
import { webEnv } from '@/lib/env';
import { createServerSupabaseAuthClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const cookieState = readAuthCookieState(request);

  if (webEnv.hasSupabaseConfig && cookieState.accessToken && cookieState.refreshToken) {
    try {
      const supabase = createServerSupabaseAuthClient();
      await supabase.auth.setSession({
        access_token: cookieState.accessToken,
        refresh_token: cookieState.refreshToken
      });
      await supabase.auth.signOut();
    } catch {
      const response = NextResponse.json({ redirectTo: `${loginPath}?reason=signed_out` });
      clearAuthSessionCookies(response);

      return response;
    }
  }

  const response = NextResponse.json({ redirectTo: `${loginPath}?reason=signed_out` });
  clearAuthSessionCookies(response);

  return response;
}
