'use client';

import type { OrganizationType } from '@gatesync/shared';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { SignOutButton } from '@/components/sign-out-button';
import type { ApiOrganization, CreateOrganizationPayload } from '@/lib/api/types';
import { resolveWebApiSession } from '@/lib/api/session';
import { gatesyncApi } from '@/lib/api/gatesync';
import {
  membershipRoleLabels,
  membershipStatusLabels,
  organizationTypeLabels
} from '@/lib/ui-labels';

type ProfileType = 'business' | 'driver' | 'cargo_owner';

type OrganizationFormState = {
  name: string;
  type: OrganizationType;
  taxCode: string;
  phone: string;
  email: string;
  address: string;
};

const emptyOrganizationForm: OrganizationFormState = {
  name: '',
  type: 'LOGISTICS_COMPANY',
  taxCode: '',
  phone: '',
  email: '',
  address: ''
};

const profileOptions: Array<{
  value: ProfileType;
  title: string;
  description: string;
  badge: string;
}> = [
  {
    value: 'business',
    title: 'Doanh nghiệp / đội vận hành',
    description: 'Tạo tổ chức mới và trở thành OWNER đầu tiên của không gian vận hành.',
    badge: 'Tạo tổ chức'
  },
  {
    value: 'driver',
    title: 'Tài xế',
    description: 'Dùng lời mời hoặc mã liên kết từ doanh nghiệp để gắn với hồ sơ tài xế.',
    badge: 'Invite-only'
  },
  {
    value: 'cargo_owner',
    title: 'Chủ hàng / đối tác',
    description: 'Chỉ xem chuyến được chia sẻ qua TripParticipant và visibility phù hợp.',
    badge: 'Liên kết có kiểm soát'
  }
];

export function OnboardingClient() {
  const router = useRouter();
  const [accessToken, setAccessToken] = useState<string>();
  const [organizations, setOrganizations] = useState<ApiOrganization[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<ProfileType>('business');
  const [form, setForm] = useState<OrganizationFormState>(emptyOrganizationForm);
  const [inviteCode, setInviteCode] = useState('');
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  const activeOrganizations = useMemo(
    () =>
      organizations.filter(
        (organization) => organization.currentUserMembership.status === 'ACTIVE'
      ),
    [organizations]
  );
  const pendingOrganizations = useMemo(
    () =>
      organizations.filter(
        (organization) => organization.currentUserMembership.status !== 'ACTIVE'
      ),
    [organizations]
  );

  useEffect(() => {
    let isMounted = true;

    async function loadOnboardingState() {
      setIsLoading(true);
      setError(undefined);

      try {
        const session = await resolveWebApiSession();

        if (session.mode === 'dev') {
          throw new Error(
            'Onboarding cần phiên đăng nhập GateSync thật. Hãy cấu hình Supabase và API để tiếp tục.'
          );
        }

        const result = await gatesyncApi.listOrganizations({ accessToken: session.accessToken });

        if (isMounted) {
          setAccessToken(session.accessToken);
          setOrganizations(result);
        }
      } catch (loadError) {
        if (isMounted) {
          setError(
            loadError instanceof Error ? loadError.message : 'Không thể tải trạng thái onboarding.'
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadOnboardingState();

    return () => {
      isMounted = false;
    };
  }, []);

  async function submitOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setMessage(undefined);

    if (!accessToken) {
      setError('Phiên đăng nhập GateSync chưa sẵn sàng. Vui lòng tải lại trang.');
      return;
    }

    if (!form.name.trim()) {
      setError('Vui lòng nhập tên tổ chức.');
      return;
    }

    const payload = toCreateOrganizationPayload(form);
    setIsCreating(true);

    try {
      await gatesyncApi.createOrganization(payload, { accessToken });
      router.replace('/dashboard');
      router.refresh();
    } catch (createError) {
      setError(
        createError instanceof Error ? createError.message : 'Không thể tạo tổ chức GateSync.'
      );
    } finally {
      setIsCreating(false);
    }
  }

  function submitInviteCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setMessage(undefined);

    if (!inviteCode.trim()) {
      setError('Vui lòng nhập mã mời hoặc liên kết từ tổ chức vận hành.');
      return;
    }

    setMessage(
      'GateSync đã ghi nhận mã mời ở bước giao diện. Backend invite thật sẽ xử lý liên kết ở Phase 5; hiện tại tài khoản không thể tự nhận dữ liệu tổ chức.'
    );
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-4 py-5 sm:px-8 lg:px-12">
      <header className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white/95 px-4 py-3 shadow-soft backdrop-blur sm:flex-row sm:items-center sm:justify-between">
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
            <p className="text-xs text-slate-500">Thiết lập tài khoản</p>
          </div>
        </Link>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link
            href="/dashboard"
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-center text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-700"
          >
            Mở dashboard
          </Link>
          <SignOutButton className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-center text-sm font-semibold text-slate-700 transition hover:border-rose-200 hover:text-rose-600" />
        </div>
      </header>

      <section className="grid gap-6 py-6 lg:grid-cols-[0.9fr_1.1fr] lg:py-8">
        <div className="rounded-[1.75rem] border border-slate-200 bg-white/95 p-5 shadow-soft sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
            Phase 2 onboarding
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 sm:text-5xl">
            Chọn đường vào phù hợp trước khi mở dữ liệu vận hành.
          </h1>
          <p className="mt-4 text-sm leading-6 text-slate-600 sm:text-base">
            GateSync dùng tenant isolation: không có tổ chức hoạt động thì không có dashboard dữ
            liệu. Doanh nghiệp tạo tổ chức; tài xế và chủ hàng cần lời mời hoặc liên kết từ tổ chức.
          </p>

          <div className="mt-6 grid gap-3">
            {profileOptions.map((option) => {
              const isSelected = option.value === selectedProfile;

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setSelectedProfile(option.value);
                    setError(undefined);
                    setMessage(undefined);
                  }}
                  className={`rounded-3xl border p-4 text-left transition ${
                    isSelected
                      ? 'border-sky-300 bg-sky-50 ring-4 ring-sky-100'
                      : 'border-slate-200 bg-white hover:border-sky-200'
                  }`}
                >
                  <span className="flex items-start justify-between gap-3">
                    <span>
                      <span className="block text-sm font-bold text-slate-950">{option.title}</span>
                      <span className="mt-1 block text-sm leading-6 text-slate-600">
                        {option.description}
                      </span>
                    </span>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-sky-700 ring-1 ring-sky-100">
                      {option.badge}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-5">
          {isLoading ? <StatePanel message="Đang kiểm tra tài khoản và tổ chức..." /> : null}
          {!isLoading && error ? <StatePanel tone="error" message={error} /> : null}
          {!isLoading && message ? <StatePanel tone="info" message={message} /> : null}

          {!isLoading && activeOrganizations.length > 0 ? (
            <ReadyState organizations={activeOrganizations} />
          ) : null}

          {!isLoading && activeOrganizations.length === 0 ? (
            <>
              {pendingOrganizations.length > 0 ? (
                <PendingOrganizationsState organizations={pendingOrganizations} />
              ) : null}

              {selectedProfile === 'business' ? (
                <OrganizationForm
                  value={form}
                  isSubmitting={isCreating}
                  onChange={setForm}
                  onSubmit={submitOrganization}
                />
              ) : (
                <InviteOnlyForm
                  profile={selectedProfile}
                  inviteCode={inviteCode}
                  onInviteCodeChange={setInviteCode}
                  onSubmit={submitInviteCode}
                />
              )}
            </>
          ) : null}
        </div>
      </section>
    </main>
  );
}

function ReadyState({ organizations }: { organizations: ApiOrganization[] }) {
  return (
    <section className="rounded-[1.75rem] border border-emerald-100 bg-emerald-50 p-5 shadow-soft sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
        Sẵn sàng vận hành
      </p>
      <h2 className="mt-3 text-2xl font-bold text-slate-950">Bạn đã có tổ chức hoạt động</h2>
      <div className="mt-5 grid gap-3">
        {organizations.map((organization) => (
          <div key={organization.id} className="rounded-3xl border border-emerald-100 bg-white p-4">
            <p className="font-semibold text-slate-950">{organization.name}</p>
            <p className="mt-1 text-sm text-slate-600">
              {organizationTypeLabels[organization.type]} · Vai trò{' '}
              {membershipRoleLabels[organization.currentUserMembership.role]}
            </p>
          </div>
        ))}
      </div>
      <Link
        href="/dashboard"
        className="mt-5 inline-flex rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-soft transition hover:bg-slate-800"
      >
        Vào bảng điều phối
      </Link>
    </section>
  );
}

function PendingOrganizationsState({ organizations }: { organizations: ApiOrganization[] }) {
  return (
    <section className="rounded-[1.75rem] border border-amber-100 bg-amber-50 p-5 shadow-soft sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
        Đang chờ kích hoạt
      </p>
      <h2 className="mt-3 text-2xl font-bold text-slate-950">Bạn có lời mời chưa hoạt động</h2>
      <div className="mt-5 grid gap-3">
        {organizations.map((organization) => (
          <div key={organization.id} className="rounded-3xl border border-amber-100 bg-white p-4">
            <p className="font-semibold text-slate-950">{organization.name}</p>
            <p className="mt-1 text-sm text-slate-600">
              Trạng thái: {membershipStatusLabels[organization.currentUserMembership.status]}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function OrganizationForm({
  value,
  isSubmitting,
  onChange,
  onSubmit
}: {
  value: OrganizationFormState;
  isSubmitting: boolean;
  onChange: (value: OrganizationFormState) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section className="rounded-[1.75rem] border border-slate-200 bg-white/95 p-5 shadow-soft sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
        Tạo tổ chức doanh nghiệp
      </p>
      <h2 className="mt-3 text-2xl font-bold text-slate-950">Thiết lập không gian vận hành</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        Người tạo tổ chức sẽ là OWNER đầu tiên. Các thành viên khác đi vào bằng lời mời quản trị.
      </p>
      <form onSubmit={onSubmit} className="mt-5 grid gap-4">
        <InputField
          label="Tên tổ chức"
          value={value.name}
          placeholder="Công ty Logistics Hữu Nghị"
          onChange={(name) => onChange({ ...value, name })}
        />
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Loại tổ chức
          </span>
          <select
            className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
            value={value.type}
            onChange={(event) =>
              onChange({ ...value, type: event.target.value as OrganizationType })
            }
          >
            {(
              [
                'LOGISTICS_COMPANY',
                'TRANSPORT_COMPANY',
                'CUSTOMS_AGENT',
                'YARD_OPERATOR',
                'OTHER'
              ] satisfies OrganizationType[]
            ).map((type) => (
              <option key={type} value={type}>
                {organizationTypeLabels[type]}
              </option>
            ))}
          </select>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <InputField
            label="Mã số thuế"
            value={value.taxCode}
            placeholder="0109988776"
            onChange={(taxCode) => onChange({ ...value, taxCode })}
          />
          <InputField
            label="Điện thoại"
            value={value.phone}
            placeholder="+84988123456"
            onChange={(phone) => onChange({ ...value, phone })}
          />
        </div>
        <InputField
          label="Email tổ chức"
          value={value.email}
          placeholder="ops@doanhnghiep.vn"
          type="email"
          onChange={(email) => onChange({ ...value, email })}
        />
        <InputField
          label="Địa bàn vận hành"
          value={value.address}
          placeholder="Lạng Sơn, Việt Nam"
          onChange={(address) => onChange({ ...value, address })}
        />
        <button
          type="submit"
          disabled={isSubmitting}
          className="min-h-12 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-soft transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {isSubmitting ? 'Đang tạo tổ chức...' : 'Tạo tổ chức và vào dashboard'}
        </button>
      </form>
    </section>
  );
}

function InviteOnlyForm({
  profile,
  inviteCode,
  onInviteCodeChange,
  onSubmit
}: {
  profile: Exclude<ProfileType, 'business'>;
  inviteCode: string;
  onInviteCodeChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const title = profile === 'driver' ? 'Liên kết hồ sơ tài xế' : 'Liên kết chủ hàng / đối tác';

  return (
    <section className="rounded-[1.75rem] border border-slate-200 bg-white/95 p-5 shadow-soft sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Invite-only</p>
      <h2 className="mt-3 text-2xl font-bold text-slate-950">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        Nhập mã mời hoặc liên kết do tổ chức vận hành gửi. Khi invite backend hoàn tất, mã này sẽ
        tạo liên kết an toàn với hồ sơ tài xế, chủ hàng hoặc chuyến được chia sẻ.
      </p>
      <form onSubmit={onSubmit} className="mt-5 grid gap-4">
        <InputField
          label="Mã mời hoặc liên kết"
          value={inviteCode}
          placeholder="GS-INVITE-..."
          onChange={onInviteCodeChange}
        />
        <button className="min-h-12 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-700">
          Kiểm tra mã mời
        </button>
      </form>
      <div className="mt-5 rounded-3xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
        GateSync chưa cho tài xế hoặc chủ hàng tự claim dữ liệu tổ chức. Quản trị viên vẫn là người
        cấp quyền cuối cùng.
      </div>
    </section>
  );
}

function InputField({
  label,
  value,
  placeholder,
  type = 'text',
  onChange
}: {
  label: string;
  value: string;
  placeholder: string;
  type?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </span>
      <input
        className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function StatePanel({
  message,
  tone = 'default'
}: {
  message: string;
  tone?: 'default' | 'error' | 'info';
}) {
  const className =
    tone === 'error'
      ? 'border-rose-100 bg-rose-50 text-rose-700'
      : tone === 'info'
        ? 'border-emerald-100 bg-emerald-50 text-emerald-800'
        : 'border-slate-200 bg-white/95 text-slate-700';

  return (
    <div className={`rounded-[1.75rem] border p-5 text-sm font-semibold shadow-soft ${className}`}>
      {message}
    </div>
  );
}

function toCreateOrganizationPayload(form: OrganizationFormState): CreateOrganizationPayload {
  const payload: CreateOrganizationPayload = {
    name: form.name.trim(),
    type: form.type
  };

  if (form.taxCode.trim()) {
    payload.taxCode = form.taxCode.trim();
  }

  if (form.phone.trim()) {
    payload.phone = form.phone.trim();
  }

  if (form.email.trim()) {
    payload.email = form.email.trim();
  }

  if (form.address.trim()) {
    payload.address = form.address.trim();
  }

  return payload;
}
