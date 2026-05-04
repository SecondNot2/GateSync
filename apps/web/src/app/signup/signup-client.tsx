'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import { useState } from 'react';

type SignupPersona = 'business' | 'driver' | 'cargo_owner';

type SignupResponse = {
  redirectTo?: string;
  requiresEmailConfirmation?: boolean;
  message?: string;
  error?: {
    message?: string;
  };
};

const personas: Array<{
  value: SignupPersona;
  title: string;
  description: string;
}> = [
  {
    value: 'business',
    title: 'Doanh nghiệp vận hành',
    description: 'Tạo tài khoản rồi lập tổ chức để trở thành OWNER đầu tiên.'
  },
  {
    value: 'driver',
    title: 'Tài xế',
    description: 'Tạo danh tính GateSync, sau đó chỉ vào dữ liệu qua lời mời hoặc mã liên kết.'
  },
  {
    value: 'cargo_owner',
    title: 'Chủ hàng / đối tác',
    description: 'Không tự xem tenant vận hành; quyền xem dựa trên lời mời và chuyến được chia sẻ.'
  }
];

export function SignupClient() {
  const router = useRouter();
  const [persona, setPersona] = useState<SignupPersona>('business');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submitSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setMessage(undefined);

    const normalizedFullName = fullName.trim();
    const normalizedEmail = email.trim();

    if (!normalizedFullName || !normalizedEmail || !password) {
      setError('Vui lòng nhập họ tên, email và mật khẩu GateSync.');
      return;
    }

    if (password.length < 8) {
      setError('Mật khẩu GateSync cần tối thiểu 8 ký tự.');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/auth/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          email: normalizedEmail,
          password,
          fullName: normalizedFullName,
          persona
        })
      });
      const result = (await response.json().catch(() => ({}))) as SignupResponse;

      if (!response.ok && response.status !== 202) {
        setError(result.error?.message ?? 'Không thể tạo tài khoản GateSync. Vui lòng thử lại.');
        return;
      }

      if (result.requiresEmailConfirmation) {
        setMessage(result.message ?? 'Vui lòng kiểm tra email để xác nhận tài khoản GateSync.');
        return;
      }

      router.replace(result.redirectTo ?? '/onboarding');
      router.refresh();
    } catch {
      setError('Không thể kết nối dịch vụ đăng ký GateSync. Vui lòng thử lại sau.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="mx-auto grid min-h-screen w-full max-w-7xl gap-6 px-4 py-5 sm:px-8 lg:grid-cols-[0.95fr_1.05fr] lg:px-12">
      <section className="flex min-h-[calc(100vh-2.5rem)] flex-col justify-between rounded-[2rem] border border-slate-200 bg-white/95 p-5 shadow-soft backdrop-blur sm:p-6 lg:min-h-0">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/gs-logo.png"
              alt="Logo GateSync"
              width={44}
              height={44}
              priority
              className="h-11 w-11 rounded-full bg-white object-cover"
            />
            <div>
              <p className="text-sm font-bold text-slate-950">GateSync</p>
              <p className="text-xs text-slate-500">Onboarding an toàn</p>
            </div>
          </Link>
          <Link
            href="/login"
            className="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-200"
          >
            Đăng nhập
          </Link>
        </div>

        <div className="my-10 sm:mx-auto sm:w-full sm:max-w-xl lg:mx-0">
          <p className="mb-4 inline-flex rounded-full border border-sky-100 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700">
            Đăng ký GateSync
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-5xl">
            Tạo danh tính trước, mở dữ liệu theo đúng tổ chức sau.
          </h1>
          <p className="mt-4 text-sm leading-6 text-slate-600 sm:text-base">
            GateSync tách tài khoản người dùng khỏi credential nguồn. Doanh nghiệp có thể tạo tổ
            chức; tài xế và chủ hàng cần lời mời hoặc mã liên kết để thấy dữ liệu.
          </p>

          {error ? (
            <div className="mt-5 rounded-3xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
              {error}
            </div>
          ) : null}
          {message ? (
            <div className="mt-5 rounded-3xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
              {message}
            </div>
          ) : null}

          <form onSubmit={submitSignup} className="mt-6 space-y-5">
            <div>
              <p className="text-sm font-semibold text-slate-700">
                Bạn tham gia GateSync với vai trò
              </p>
              <div className="mt-3 grid gap-3">
                {personas.map((item) => {
                  const isSelected = item.value === persona;

                  return (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setPersona(item.value)}
                      className={`rounded-3xl border px-4 py-3 text-left transition ${
                        isSelected
                          ? 'border-sky-300 bg-sky-50 text-slate-950 ring-4 ring-sky-100'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-sky-200'
                      }`}
                    >
                      <span className="text-sm font-bold">{item.title}</span>
                      <span className="mt-1 block text-sm leading-6 text-slate-600">
                        {item.description}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Họ tên</span>
              <input
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                autoComplete="name"
                placeholder="Nguyễn Văn An"
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Email GateSync</span>
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="ban@doanhnghiep.vn"
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Mật khẩu</span>
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                autoComplete="new-password"
                placeholder="Tối thiểu 8 ký tự"
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
              />
            </label>
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-2xl bg-slate-950 px-5 py-3 text-center text-sm font-semibold text-white shadow-soft transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {isSubmitting ? 'Đang tạo tài khoản...' : 'Tạo tài khoản và tiếp tục'}
            </button>
          </form>
        </div>

        <p className="text-sm leading-6 text-slate-500">
          Đã có tài khoản?{' '}
          <Link href="/login" className="font-semibold text-sky-700 hover:text-sky-800">
            Đăng nhập GateSync
          </Link>
        </p>
      </section>

      <section className="hidden min-h-[calc(100vh-2.5rem)] flex-col justify-between rounded-[2rem] border border-slate-200 bg-slate-950 p-6 text-white shadow-soft lg:flex">
        <div>
          <p className="inline-flex rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-sky-100">
            Hybrid controlled onboarding
          </p>
          <h2 className="mt-6 max-w-2xl text-5xl font-bold tracking-tight">
            Mỗi persona có đường vào riêng, không tự claim dữ liệu tenant.
          </h2>
          <p className="mt-5 max-w-xl text-base leading-7 text-slate-300">
            Doanh nghiệp lập không gian vận hành và mời người dùng. Driver, chủ hàng và đối tác chỉ
            nhận dữ liệu qua liên kết đã kiểm soát.
          </p>
        </div>

        <div className="grid gap-3">
          {[
            'Đăng ký GateSync bằng email và mật khẩu riêng',
            'Doanh nghiệp tạo tổ chức để nhận vai trò OWNER',
            'Driver/chủ hàng chờ lời mời hoặc mã liên kết từ tổ chức vận hành'
          ].map((item, index) => (
            <div key={item} className="rounded-3xl border border-white/10 bg-white/10 p-4">
              <p className="text-sm font-semibold text-sky-100">Bước {index + 1}</p>
              <p className="mt-2 text-lg font-bold">{item}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
