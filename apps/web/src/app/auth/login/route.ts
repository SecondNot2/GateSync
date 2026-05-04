import { NextResponse, type NextRequest } from 'next/server';
import { sanitizeAuthenticatedRedirectPath } from '@/lib/auth/paths';
import { setAuthSessionCookies } from '@/lib/auth/session-cookies';
import { webEnv } from '@/lib/env';
import { createServerSupabaseAuthClient } from '@/lib/supabase/server';

type LoginPayload = {
  email?: unknown;
  password?: unknown;
  next?: unknown;
};

export async function POST(request: NextRequest) {
  if (!webEnv.hasSupabaseConfig) {
    return NextResponse.json(
      {
        error: {
          message: 'Chưa cấu hình Supabase cho đăng nhập GateSync.'
        }
      },
      { status: 503 }
    );
  }

  const payload = await readLoginPayload(request);
  const email = typeof payload.email === 'string' ? payload.email.trim() : '';
  const password = typeof payload.password === 'string' ? payload.password : '';
  const nextPath = sanitizeAuthenticatedRedirectPath(
    typeof payload.next === 'string' ? payload.next : undefined
  );

  if (!email || !password) {
    return NextResponse.json(
      {
        error: {
          message: 'Vui lòng nhập email và mật khẩu GateSync.'
        }
      },
      { status: 400 }
    );
  }

  const supabase = createServerSupabaseAuthClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error || !data.session) {
    return NextResponse.json(
      {
        error: {
          message: 'Email hoặc mật khẩu GateSync không đúng.'
        }
      },
      { status: 401 }
    );
  }

  const response = NextResponse.json({ redirectTo: nextPath });
  setAuthSessionCookies(response, data.session);

  return response;
}

async function readLoginPayload(request: NextRequest): Promise<LoginPayload> {
  try {
    const payload = await request.json();

    return typeof payload === 'object' && payload !== null ? (payload as LoginPayload) : {};
  } catch {
    return {};
  }
}
