import type { Session } from '@supabase/supabase-js';
import type { NextRequest, NextResponse } from 'next/server';

export const authCookieNames = {
  accessToken: 'gs_access_token',
  refreshToken: 'gs_refresh_token',
  expiresAt: 'gs_expires_at'
} as const;

const refreshTokenMaxAgeSeconds = 60 * 60 * 24 * 30;
const accessTokenLeewaySeconds = 45;

export type AuthCookieState = {
  accessToken: string | undefined;
  refreshToken: string | undefined;
  expiresAt: number | undefined;
  hasUsableAccessToken: boolean;
  hasLikelySession: boolean;
  shouldRefresh: boolean;
};

export function setAuthSessionCookies(response: NextResponse, session: Session) {
  const now = getCurrentEpochSeconds();
  const expiresAt = session.expires_at ?? now + session.expires_in;
  const accessTokenMaxAge = Math.max(expiresAt - now, 1);

  response.cookies.set(authCookieNames.accessToken, session.access_token, {
    ...getBaseCookieOptions(),
    maxAge: accessTokenMaxAge
  });
  response.cookies.set(authCookieNames.refreshToken, session.refresh_token, {
    ...getBaseCookieOptions(),
    maxAge: refreshTokenMaxAgeSeconds
  });
  response.cookies.set(authCookieNames.expiresAt, String(expiresAt), {
    ...getBaseCookieOptions(),
    maxAge: refreshTokenMaxAgeSeconds
  });
}

export function clearAuthSessionCookies(response: NextResponse) {
  Object.values(authCookieNames).forEach((cookieName) => {
    response.cookies.set(cookieName, '', {
      ...getBaseCookieOptions(),
      maxAge: 0
    });
  });
}

export function readAuthCookieState(request: NextRequest): AuthCookieState {
  const accessToken = request.cookies.get(authCookieNames.accessToken)?.value;
  const refreshToken = request.cookies.get(authCookieNames.refreshToken)?.value;
  const expiresAt = parseExpiresAt(request.cookies.get(authCookieNames.expiresAt)?.value);
  const isAccessTokenFresh = expiresAt
    ? expiresAt > getCurrentEpochSeconds() + accessTokenLeewaySeconds
    : true;
  const hasUsableAccessToken = Boolean(accessToken && isAccessTokenFresh);
  const shouldRefresh = Boolean(refreshToken && (!accessToken || !isAccessTokenFresh));

  return {
    accessToken,
    refreshToken,
    expiresAt,
    hasUsableAccessToken,
    hasLikelySession: Boolean(hasUsableAccessToken || refreshToken),
    shouldRefresh
  };
}

function getBaseCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/'
  };
}

function getCurrentEpochSeconds() {
  return Math.floor(Date.now() / 1000);
}

function parseExpiresAt(value?: string) {
  if (!value) {
    return undefined;
  }

  const expiresAt = Number(value);

  return Number.isFinite(expiresAt) ? expiresAt : undefined;
}
