import { NextResponse, type NextRequest } from 'next/server';
import {
  defaultAuthenticatedPath,
  isProtectedAppPath,
  loginPath,
  sanitizeAuthenticatedRedirectPath,
  signupPath
} from '@/lib/auth/paths';
import {
  clearAuthSessionCookies,
  readAuthCookieState,
  setAuthSessionCookies
} from '@/lib/auth/session-cookies';
import { webEnv } from '@/lib/env';
import { createServerSupabaseAuthClient } from '@/lib/supabase/server';

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (pathname === loginPath || pathname === signupPath) {
    return handlePublicAuthPath(request);
  }

  if (isProtectedAppPath(pathname)) {
    return handleProtectedPath(request);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/login',
    '/signup',
    '/onboarding/:path*',
    '/dashboard/:path*',
    '/trips/:path*',
    '/admin/:path*',
    '/integrations/:path*'
  ]
};

async function handlePublicAuthPath(request: NextRequest) {
  const cookieState = readAuthCookieState(request);

  if (cookieState.hasUsableAccessToken) {
    return NextResponse.redirect(new URL(defaultAuthenticatedPath, request.url));
  }

  if (cookieState.shouldRefresh) {
    const refreshedResponse = await refreshSession(request, NextResponse.next());

    if (refreshedResponse) {
      const redirectPath = sanitizeAuthenticatedRedirectPath(
        request.nextUrl.searchParams.get('next')
      );
      const response = NextResponse.redirect(new URL(redirectPath, request.url));
      copyAuthCookies(refreshedResponse, response);

      return response;
    }
  }

  return NextResponse.next();
}

async function handleProtectedPath(request: NextRequest) {
  const cookieState = readAuthCookieState(request);

  if (cookieState.hasUsableAccessToken) {
    return NextResponse.next();
  }

  if (cookieState.shouldRefresh) {
    const refreshedResponse = await refreshSession(request, NextResponse.next());

    if (refreshedResponse) {
      return refreshedResponse;
    }

    return redirectToLogin(request, 'session_expired');
  }

  return redirectToLogin(request, 'auth_required');
}

async function refreshSession(request: NextRequest, response: NextResponse) {
  const cookieState = readAuthCookieState(request);

  if (!cookieState.refreshToken || !webEnv.hasSupabaseConfig) {
    return undefined;
  }

  const supabase = createServerSupabaseAuthClient();
  const { data, error } = await supabase.auth.refreshSession({
    refresh_token: cookieState.refreshToken
  });

  if (error || !data.session) {
    clearAuthSessionCookies(response);
    return undefined;
  }

  setAuthSessionCookies(response, data.session);

  return response;
}

function redirectToLogin(request: NextRequest, reason: 'auth_required' | 'session_expired') {
  const loginUrl = new URL(loginPath, request.url);
  loginUrl.searchParams.set('reason', reason);
  loginUrl.searchParams.set('next', `${request.nextUrl.pathname}${request.nextUrl.search}`);

  const response = NextResponse.redirect(loginUrl);

  if (reason === 'session_expired') {
    clearAuthSessionCookies(response);
  }

  return response;
}

function copyAuthCookies(source: NextResponse, target: NextResponse) {
  source.cookies.getAll().forEach((cookie) => {
    target.cookies.set(cookie);
  });
}
