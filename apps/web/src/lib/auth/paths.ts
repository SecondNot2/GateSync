export const onboardingPath = '/onboarding';
export const defaultAuthenticatedPath = onboardingPath;
export const loginPath = '/login';
export const signupPath = '/signup';

export const protectedPathPrefixes = [
  onboardingPath,
  '/dashboard',
  '/driver',
  '/trips',
  '/admin',
  '/integrations',
  '/settings'
] as const;

export type LoginReason = 'auth_required' | 'session_expired' | 'signed_out';

export function isProtectedAppPath(pathname: string) {
  return protectedPathPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function sanitizeAuthenticatedRedirectPath(value?: string | null) {
  if (!value) {
    return defaultAuthenticatedPath;
  }

  const trimmedValue = value.trim();

  if (!trimmedValue.startsWith('/') || trimmedValue.startsWith('//')) {
    return defaultAuthenticatedPath;
  }

  const [pathname] = trimmedValue.split(/[?#]/, 1);

  if (!pathname || !isProtectedAppPath(pathname)) {
    return defaultAuthenticatedPath;
  }

  return trimmedValue;
}

export function normalizeLoginReason(value?: string | string[] | null): LoginReason | undefined {
  const reason = Array.isArray(value) ? value[0] : value;

  if (reason === 'auth_required' || reason === 'session_expired' || reason === 'signed_out') {
    return reason;
  }

  return undefined;
}
