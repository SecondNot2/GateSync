import Link from 'next/link';
import { SignOutButton } from '@/components/sign-out-button';
import type { OrganizationAccessIssue } from '@/lib/operations/errors';

type NoOrganizationStateProps = {
  issue: OrganizationAccessIssue;
  message: string;
};

const issueCopy: Record<
  OrganizationAccessIssue,
  {
    title: string;
    description: string;
    actionLabel: string;
  }
> = {
  NO_ORGANIZATION: {
    title: 'Chưa có tổ chức GateSync',
    description:
      'Bạn cần tạo tổ chức doanh nghiệp hoặc được mời vào tổ chức hiện có trước khi xem dữ liệu vận hành.',
    actionLabel: 'Mở onboarding'
  },
  INVITED: {
    title: 'Lời mời chưa được kích hoạt',
    description:
      'Tài khoản đã có lời mời nhưng chưa ở trạng thái hoạt động. Hãy kiểm tra email mời hoặc nhờ quản trị viên gửi lại.',
    actionLabel: 'Xem bước tiếp theo'
  },
  SUSPENDED: {
    title: 'Quyền truy cập đang tạm dừng',
    description:
      'GateSync chưa thể mở dữ liệu tổ chức cho tài khoản này. Quản trị viên tổ chức cần mở lại quyền trước.',
    actionLabel: 'Xem hướng dẫn'
  },
  REMOVED: {
    title: 'Tài khoản đã rời tổ chức',
    description:
      'Bạn không còn quyền trong tổ chức này. Hãy dùng lời mời mới nếu cần quay lại không gian vận hành.',
    actionLabel: 'Xem onboarding'
  }
};

export function NoOrganizationState({ issue, message }: NoOrganizationStateProps) {
  const copy = issueCopy[issue];

  return (
    <section className="rounded-[1.75rem] border border-sky-100 bg-white/95 p-5 shadow-soft sm:p-6">
      <div className="grid gap-5 lg:grid-cols-[1fr_20rem] lg:items-start">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
            Onboarding tài khoản
          </p>
          <h2 className="mt-3 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
            {copy.title}
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">{copy.description}</p>
          <div className="mt-5 rounded-3xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
            {message}
          </div>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/onboarding"
              className="rounded-2xl bg-slate-950 px-5 py-3 text-center text-sm font-semibold text-white shadow-soft transition hover:bg-slate-800"
            >
              {copy.actionLabel}
            </Link>
            <SignOutButton
              label="Đổi tài khoản"
              className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-center text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-700"
            />
          </div>
        </div>

        <div className="rounded-3xl border border-amber-100 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          <p className="font-bold">An toàn dữ liệu tổ chức</p>
          <p className="mt-2">
            Driver, chủ hàng và đối tác chỉ nhìn thấy dữ liệu khi được mời hoặc liên kết bởi tổ chức
            vận hành. GateSync không cho tự nhận dữ liệu của doanh nghiệp.
          </p>
        </div>
      </div>
    </section>
  );
}
