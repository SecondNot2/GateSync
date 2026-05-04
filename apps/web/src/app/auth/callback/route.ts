import { NextResponse, type NextRequest } from 'next/server';
import { loginPath, sanitizeAuthenticatedRedirectPath } from '@/lib/auth/paths';
import { setAuthSessionCookies } from '@/lib/auth/session-cookies';
import { webEnv } from '@/lib/env';
import { createServerSupabaseAuthClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const nextPath = sanitizeAuthenticatedRedirectPath(request.nextUrl.searchParams.get('next'));

  if (!code || !webEnv.hasSupabaseConfig) {
    return redirectToLogin(request);
  }

  const supabase = createServerSupabaseAuthClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.session) {
    return redirectToLogin(request);
  }

  const response = NextResponse.redirect(new URL(nextPath, request.url));
  setAuthSessionCookies(response, data.session);

  return response;
}

function redirectToLogin(request: NextRequest) {
  const loginUrl = new URL(loginPath, request.url);
  loginUrl.searchParams.set('reason', 'session_expired');

  return NextResponse.redirect(loginUrl);
}
