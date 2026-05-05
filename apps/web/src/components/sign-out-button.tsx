'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { clearWebApiSessionCache } from '@/lib/api/session';

type SignOutButtonProps = {
  className?: string;
  label?: string;
};

type SignOutResponse = {
  redirectTo?: string;
};

export function SignOutButton({
  className = 'rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 transition hover:border-rose-200 hover:text-rose-600',
  label = 'Đăng xuất'
}: SignOutButtonProps) {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function signOut() {
    if (isSigningOut) {
      return;
    }

    setIsSigningOut(true);

    try {
      const response = await fetch('/auth/logout', {
        method: 'POST',
        credentials: 'include'
      });
      const result = (await response.json().catch(() => ({}))) as SignOutResponse;

      clearWebApiSessionCache();
      router.replace(result.redirectTo ?? '/login?reason=signed_out');
      router.refresh();
    } catch {
      clearWebApiSessionCache();
      router.replace('/login?reason=signed_out');
      router.refresh();
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <button type="button" onClick={signOut} disabled={isSigningOut} className={className}>
      {isSigningOut ? 'Đang thoát...' : label}
    </button>
  );
}
