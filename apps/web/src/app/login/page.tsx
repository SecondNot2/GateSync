import { normalizeLoginReason, sanitizeAuthenticatedRedirectPath } from '@/lib/auth/paths';
import { LoginClient } from './login-client';

type LoginPageProps = {
  searchParams: Promise<{
    next?: string | string[];
    reason?: string | string[];
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const nextPath = sanitizeAuthenticatedRedirectPath(getFirstValue(params.next));
  const reason = normalizeLoginReason(params.reason);

  return <LoginClient nextPath={nextPath} reason={reason} />;
}

function getFirstValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}
