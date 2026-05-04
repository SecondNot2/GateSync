import { NextResponse, type NextRequest } from 'next/server';
import { onboardingPath } from '@/lib/auth/paths';
import { setAuthSessionCookies } from '@/lib/auth/session-cookies';
import { webEnv } from '@/lib/env';
import { createServerSupabaseAuthClient } from '@/lib/supabase/server';

type SignupPersona = 'business' | 'driver' | 'cargo_owner';

type SignupPayload = {
  email?: unknown;
  password?: unknown;
  fullName?: unknown;
  persona?: unknown;
};

const supportedPersonas: SignupPersona[] = ['business', 'driver', 'cargo_owner'];

export async function POST(request: NextRequest) {
  if (!webEnv.hasSupabaseConfig) {
    return NextResponse.json(
      {
        error: {
          message: 'Chưa cấu hình Supabase cho đăng ký GateSync.'
        }
      },
      { status: 503 }
    );
  }

  const payload = await readSignupPayload(request);
  const email = typeof payload.email === 'string' ? payload.email.trim() : '';
  const password = typeof payload.password === 'string' ? payload.password : '';
  const fullName = typeof payload.fullName === 'string' ? payload.fullName.trim() : '';
  const persona = normalizePersona(payload.persona);

  if (!email || !password || !fullName) {
    return NextResponse.json(
      {
        error: {
          message: 'Vui lòng nhập họ tên, email và mật khẩu GateSync.'
        }
      },
      { status: 400 }
    );
  }

  if (password.length < 8) {
    return NextResponse.json(
      {
        error: {
          message: 'Mật khẩu GateSync cần tối thiểu 8 ký tự.'
        }
      },
      { status: 400 }
    );
  }

  const callbackUrl = new URL('/auth/callback', request.url);
  callbackUrl.searchParams.set('next', onboardingPath);

  const supabase = createServerSupabaseAuthClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: callbackUrl.toString(),
      data: {
        full_name: fullName,
        gatesync_persona: persona
      }
    }
  });

  if (error) {
    return NextResponse.json(
      {
        error: {
          message: normalizeSignupError(error.message)
        }
      },
      { status: 400 }
    );
  }

  if (!data.session) {
    return NextResponse.json(
      {
        requiresEmailConfirmation: true,
        message:
          'GateSync đã gửi email xác nhận. Sau khi xác nhận, bạn sẽ được đưa về onboarding để tạo hoặc liên kết tổ chức.'
      },
      { status: 202 }
    );
  }

  const response = NextResponse.json({ redirectTo: onboardingPath });
  setAuthSessionCookies(response, data.session);

  return response;
}

async function readSignupPayload(request: NextRequest): Promise<SignupPayload> {
  try {
    const payload = await request.json();

    return typeof payload === 'object' && payload !== null ? (payload as SignupPayload) : {};
  } catch {
    return {};
  }
}

function normalizePersona(value: unknown): SignupPersona {
  return typeof value === 'string' && supportedPersonas.includes(value as SignupPersona)
    ? (value as SignupPersona)
    : 'business';
}

function normalizeSignupError(message: string) {
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('already') || lowerMessage.includes('registered')) {
    return 'Email này đã có tài khoản GateSync. Vui lòng đăng nhập hoặc dùng email khác.';
  }

  if (lowerMessage.includes('password')) {
    return 'Mật khẩu chưa đạt yêu cầu bảo mật của GateSync.';
  }

  return 'Không thể tạo tài khoản GateSync. Vui lòng kiểm tra thông tin và thử lại.';
}
