'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import { useState } from 'react';
import type { LoginReason } from '@/lib/auth/paths';

const reasonMessages: Record<LoginReason, string> = {
  auth_required: 'Bạn cần đăng nhập GateSync trước khi mở khu vực vận hành.',
  session_expired: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại để tiếp tục.',
  signed_out: 'Bạn đã đăng xuất khỏi GateSync.'
};

type LoginClientProps = {
  nextPath: string;
  reason?: LoginReason | undefined;
};

type LoginResponse = {
  redirectTo?: string;
  error?: {
    message?: string;
  };
};

export function LoginClient({ nextPath, reason }: LoginClientProps) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);

    const normalizedEmail = email.trim();

    if (!normalizedEmail || !password) {
      setError('Vui lòng nhập email và mật khẩu GateSync.');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          email: normalizedEmail,
          password,
          next: nextPath
        })
      });
      const result = (await response.json().catch(() => ({}))) as LoginResponse;

      if (!response.ok) {
        setError(result.error?.message ?? 'Không thể đăng nhập GateSync. Vui lòng thử lại.');
        return;
      }

      router.replace(result.redirectTo ?? nextPath);
      router.refresh();
    } catch {
      setError('Không thể kết nối dịch vụ đăng nhập GateSync. Vui lòng thử lại sau.');
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
              <p className="text-xs text-slate-500">Điều phối logistics cửa khẩu</p>
            </div>
          </Link>
          <span className="rounded-full bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
            Nội bộ doanh nghiệp
          </span>
        </div>

        <div className="my-10 sm:mx-auto sm:w-full sm:max-w-md lg:mx-0">
          <p className="mb-4 inline-flex rounded-full border border-sky-100 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700">
            Đăng nhập GateSync
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-5xl">
            Mở bảng điều phối an toàn cho ca vận hành.
          </h1>
          <p className="mt-4 text-sm leading-6 text-slate-600 sm:text-base">
            Dùng tài khoản GateSync của doanh nghiệp để theo dõi chuyến, sự kiện, quản trị nội bộ và
            tích hợp dữ liệu được ủy quyền.
          </p>

          {reason ? (
            <div className="mt-5 rounded-3xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-800">
              {reasonMessages[reason]}
            </div>
          ) : null}
          {error ? (
            <div className="mt-5 rounded-3xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
              {error}
            </div>
          ) : null}

          <form onSubmit={submitLogin} className="mt-6 space-y-4">
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
                autoComplete="current-password"
                placeholder="Nhập mật khẩu"
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
              />
            </label>
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-2xl bg-slate-950 px-5 py-3 text-center text-sm font-semibold text-white shadow-soft transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {isSubmitting ? 'Đang đăng nhập...' : 'Đăng nhập và mở vận hành'}
            </button>
          </form>

          <div className="mt-5 rounded-3xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
            Tài khoản Cửa khẩu số chỉ được kết nối sau khi bạn đã đăng nhập GateSync và có quyền
            trong tổ chức.
          </div>
        </div>

        <div className="flex flex-col gap-3 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>Chưa có tài khoản GateSync?</span>
          <Link href="/signup" className="font-semibold text-sky-700 hover:text-sky-800">
            Đăng ký hoặc nhận lời mời
          </Link>
        </div>
      </section>

      <section className="hidden min-h-[calc(100vh-2.5rem)] flex-col justify-between rounded-[2rem] border border-slate-200 bg-slate-950 p-6 text-white shadow-soft lg:flex">
        <div>
          <p className="inline-flex rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-sky-100">
            Kiểm soát truy cập Phase 1
          </p>
          <h2 className="mt-6 max-w-2xl text-5xl font-bold tracking-tight">
            Một danh tính GateSync cho toàn bộ vận hành biên giới.
          </h2>
          <p className="mt-5 max-w-xl text-base leading-7 text-slate-300">
            Dashboard, chuyến, quản trị và tích hợp chỉ mở sau khi xác thực. Backend vẫn kiểm tra
            membership và RBAC ở từng API path.
          </p>
        </div>

        <div className="grid gap-3">
          {[
            'Đăng nhập bằng tài khoản GateSync của doanh nghiệp',
            'Chọn hoặc kiểm tra tổ chức đang hoạt động',
            'Kết nối nguồn dữ liệu chỉ sau khi có quyền phù hợp'
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
