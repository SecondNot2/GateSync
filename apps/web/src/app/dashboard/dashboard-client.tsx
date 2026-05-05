'use client';

import type { MembershipRole } from '@gatesync/shared';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { NoOrganizationState } from '@/components/no-organization-state';
import { PriorityBadge, TripStatusBadge } from '@/components/status-badge';
import { loadDashboardData } from '@/lib/operations/data';
import { isOrganizationAccessError, type OrganizationAccessIssue } from '@/lib/operations/errors';
import type { DashboardViewData } from '@/lib/operations/view-model';
import {
  formatDelay,
  membershipRoleLabels,
  tripEventSourceLabels,
  tripEventTypeLabels,
  tripStatusLabels
} from '@/lib/ui-labels';

type DashboardClientProps = {
  initialData?: DashboardViewData;
  initialError?: string;
  initialOrganizationIssue?: OrganizationAccessIssue;
};

export function DashboardClient({
  initialData,
  initialError,
  initialOrganizationIssue
}: DashboardClientProps = {}) {
  const hasInitialState = Boolean(initialData || initialOrganizationIssue);
  const [data, setData] = useState<DashboardViewData | undefined>(initialData);
  const [error, setError] = useState<string | undefined>(initialError);
  const [organizationIssue, setOrganizationIssue] = useState<OrganizationAccessIssue | undefined>(
    initialOrganizationIssue
  );
  const [isLoading, setIsLoading] = useState(!hasInitialState);
  const shellProps = data?.organization ? { organization: data.organization } : {};

  useEffect(() => {
    if (hasInitialState) {
      return;
    }

    let isMounted = true;

    async function loadData() {
      setIsLoading(true);
      setError(undefined);
      setOrganizationIssue(undefined);

      try {
        const result = await loadDashboardData();

        if (isMounted) {
          setData(result);
        }
      } catch (loadError) {
        if (isMounted) {
          if (isOrganizationAccessError(loadError)) {
            setOrganizationIssue(loadError.issue);
          }

          setError(
            loadError instanceof Error ? loadError.message : 'Không thể tải bảng điều phối.'
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadData();

    return () => {
      isMounted = false;
    };
  }, [hasInitialState]);

  return (
    <AppShell
      activeNav="dashboard"
      eyebrow="Vận hành thời gian thực"
      title="Bảng điều phối cửa khẩu"
      description="Ưu tiên việc cần xử lý trước, sau đó theo dõi luồng xe, cảnh báo và sự kiện mới trong ca trực."
      {...shellProps}
      action={
        <Link
          href="/trips"
          className="rounded-2xl bg-slate-950 px-5 py-3 text-center text-sm font-semibold text-white shadow-soft transition hover:bg-slate-800"
        >
          Mở danh sách chuyến
        </Link>
      }
    >
      {isLoading ? <DashboardLoadingState /> : null}
      {!isLoading && organizationIssue && error ? (
        <NoOrganizationState issue={organizationIssue} message={error} />
      ) : null}
      {!isLoading && !organizationIssue && error ? <DashboardErrorState message={error} /> : null}
      {!isLoading && !error && data ? <DashboardContent data={data} /> : null}
    </AppShell>
  );
}

function DashboardContent({ data }: { data: DashboardViewData }) {
  return (
    <>
      {data.notice ? (
        <div className="rounded-3xl border border-amber-100 bg-amber-50 px-5 py-4 text-sm font-semibold text-amber-800">
          {data.notice}
        </div>
      ) : null}

      <section className="grid gap-5 xl:grid-cols-[1fr_22rem]">
        <div className="rounded-[1.75rem] border border-slate-200 bg-white/95 p-4 shadow-soft sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-700">
                Việc cần xử lý
              </p>
              <h2 className="mt-2 text-2xl font-bold text-slate-950">Ưu tiên trong ca trực</h2>
            </div>
            <Link href="/trips" className="text-sm font-semibold text-sky-700 hover:text-sky-900">
              Xem tất cả chuyến
            </Link>
          </div>
          {data.urgentTrips.length > 0 ? (
            <div className="mt-5 grid gap-3 lg:grid-cols-3">
              {data.urgentTrips.slice(0, 3).map((trip) => (
                <Link
                  key={trip.id}
                  href={`/trips/${trip.id}`}
                  className="block rounded-3xl border border-slate-100 bg-slate-50 p-4 transition hover:border-sky-200 hover:bg-sky-50/60"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-950">{trip.tripCode}</p>
                      <p className="mt-1 text-sm text-slate-600">
                        {trip.vehicle.plateNumber} · {trip.borderGate}
                      </p>
                    </div>
                    <PriorityBadge priority={trip.priority} />
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-700">{trip.nextAction}</p>
                  <p className="mt-3 text-xs font-semibold text-amber-700">
                    {formatDelay(trip.delayMinutes)}
                  </p>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyPanel message="Chưa có chuyến ưu tiên trong ca trực hiện tại." />
          )}
        </div>

        <div className="rounded-[1.75rem] border border-amber-100 bg-amber-50 p-4 shadow-soft sm:p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
            Tóm tắt ca trực
          </p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{data.urgentTrips.length}</p>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            Chuyến đang có ưu tiên hoặc chậm tiến độ cần điều phối viên theo dõi.
          </p>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {data.metrics.map((metric) => (
          <div
            key={metric.label}
            className="rounded-[1.5rem] border border-slate-200 bg-white/95 p-4 shadow-soft sm:p-5"
          >
            <div className={`h-1.5 w-12 rounded-full ${metric.indicatorClass}`} />
            <p className="mt-4 text-sm font-medium text-slate-500">{metric.label}</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{metric.value}</p>
            <p className="mt-2 text-sm text-slate-600">{metric.trend}</p>
          </div>
        ))}
      </section>

      <RoleFocusPanel data={data} />

      <section className="grid gap-5 xl:grid-cols-[1fr_24rem]">
        <div className="rounded-[1.75rem] border border-slate-200 bg-white/95 p-4 shadow-soft sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                Nhóm trạng thái
              </p>
              <h2 className="mt-2 text-2xl font-bold text-slate-950">Luồng xe trong ngày</h2>
            </div>
            <p className="max-w-xl text-sm leading-6 text-slate-600">
              Các nhóm này bám theo luồng vận hành, giúp điều phối viên phát hiện khu vực bị nghẽn
              nhanh hơn.
            </p>
          </div>
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {data.statusGroups.map((group) => (
              <div
                key={group.label}
                className="rounded-3xl border border-slate-100 bg-slate-50 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-950">{group.label}</p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{group.description}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-sm font-bold ${group.tone}`}>
                    {group.count}
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {group.statuses.map((status) => (
                    <span
                      key={status}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600"
                    >
                      {tripStatusLabels[status]}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[1.75rem] border border-slate-200 bg-white/95 p-4 shadow-soft sm:p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
            Gợi ý điều phối
          </p>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">Theo dõi theo khu vực</h2>
          <div className="mt-5 space-y-3 text-sm leading-6 text-slate-700">
            <p className="rounded-3xl bg-slate-50 p-4">
              Ưu tiên kiểm tra các chuyến đang chờ bãi quá lâu.
            </p>
            <p className="rounded-3xl bg-slate-50 p-4">
              Đối chiếu lại tờ khai với các chuyến đang xử lý hải quan.
            </p>
            <p className="rounded-3xl bg-slate-50 p-4">
              Liên hệ tài xế khi có sự kiện mới nhưng chưa xác nhận.
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <div className="rounded-[1.75rem] border border-slate-200 bg-white/95 p-4 shadow-soft sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                Hàng chờ điều phối
              </p>
              <h2 className="mt-2 text-2xl font-bold text-slate-950">Chuyến nổi bật</h2>
            </div>
            <Link href="/trips" className="text-sm font-semibold text-sky-700 hover:text-sky-900">
              Xem tất cả
            </Link>
          </div>
          {data.featuredTrips.length > 0 ? (
            <div className="mt-5 space-y-3">
              {data.featuredTrips.map((trip) => (
                <Link
                  key={trip.id}
                  href={`/trips/${trip.id}`}
                  className="grid gap-3 rounded-3xl border border-slate-100 bg-slate-50 p-4 transition hover:border-sky-200 hover:bg-sky-50/60 lg:grid-cols-[1.1fr_0.8fr_auto] lg:items-center"
                >
                  <div>
                    <p className="font-semibold text-slate-950">{trip.tripCode}</p>
                    <p className="mt-1 text-sm text-slate-600">
                      {trip.vehicle.plateNumber} · {trip.driver.name}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-700">{trip.borderGate}</p>
                    <p className="mt-1 text-xs text-slate-500">{trip.yard}</p>
                  </div>
                  <TripStatusBadge status={trip.currentStatus} />
                </Link>
              ))}
            </div>
          ) : (
            <EmptyPanel message="Chưa có chuyến nào cần hiển thị." />
          )}
        </div>

        <div className="rounded-[1.75rem] border border-slate-200 bg-white/95 p-4 shadow-soft sm:p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
            Sự kiện gần đây
          </p>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">Sự kiện mới ghi nhận</h2>
          {data.recentEvents.length > 0 ? (
            <div className="mt-5 space-y-3">
              {data.recentEvents.slice(0, 6).map((event) => (
                <Link
                  key={event.id}
                  href={`/trips/${event.tripId}`}
                  className="block rounded-3xl border border-slate-100 bg-slate-50 p-4 transition hover:border-sky-200 hover:bg-sky-50/60"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-semibold text-slate-950">
                        {tripEventTypeLabels[event.eventType]}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        {event.tripCode ?? event.tripId} · {event.borderGate ?? 'Chưa có cửa khẩu'}
                      </p>
                    </div>
                    <p className="text-xs font-semibold text-slate-500">{event.occurredAt}</p>
                  </div>
                  <p className="mt-3 text-sm text-slate-600">
                    {tripEventSourceLabels[event.source]}
                  </p>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyPanel message="Chưa có sự kiện nào được ghi nhận." />
          )}
        </div>
      </section>
    </>
  );
}

type RoleDashboardSummary = {
  title: string;
  description: string;
  primaryHref: string;
  primaryLabel: string;
  secondaryHref: string;
  secondaryLabel: string;
  tasks: Array<{ title: string; detail: string }>;
};

function RoleFocusPanel({ data }: { data: DashboardViewData }) {
  const summary = getRoleDashboardSummary(data);
  const currentUser = data.organization.currentUser;

  return (
    <section className="rounded-[1.75rem] border border-sky-100 bg-sky-50 p-3 shadow-soft sm:p-4">
      <details>
        <summary className="flex cursor-pointer list-none flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
              Bàn làm việc theo vai trò
            </p>
            <h2 className="mt-1 text-xl font-bold text-slate-950 sm:text-2xl">{summary.title}</h2>
          </div>
          <span className="w-fit rounded-full bg-white px-4 py-2 text-sm font-semibold text-sky-700">
            {currentUser ? membershipRoleLabels[currentUser.role] : 'Đang xác thực'}
          </span>
        </summary>

        <div className="mt-4 grid gap-3 xl:grid-cols-[1fr_1.2fr]">
          <div className="rounded-3xl bg-white/80 p-4">
            <p className="text-sm leading-6 text-slate-700">{summary.description}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <RoleActionLink href={summary.primaryHref} label={summary.primaryLabel} primary />
              <RoleActionLink href={summary.secondaryHref} label={summary.secondaryLabel} />
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-1">
            {summary.tasks.map((task) => (
              <div key={task.title} className="rounded-3xl border border-white bg-white/80 p-4">
                <p className="font-semibold text-slate-950">{task.title}</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">{task.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </details>
    </section>
  );
}

function RoleActionLink({
  href,
  label,
  primary = false
}: {
  href: string;
  label: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`min-h-12 rounded-2xl px-4 py-3 text-center text-sm font-semibold transition ${
        primary
          ? 'bg-slate-950 text-white hover:bg-slate-800'
          : 'border border-slate-200 bg-white text-slate-700 hover:border-sky-300 hover:text-sky-700'
      }`}
    >
      {label}
    </Link>
  );
}

function getRoleDashboardSummary(data: DashboardViewData): RoleDashboardSummary {
  const role = data.organization.currentUser?.role ?? 'VIEWER';
  const firstPriorityTrip = data.urgentTrips[0] ?? data.featuredTrips[0];
  const priorityHref = firstPriorityTrip ? `/trips/${firstPriorityTrip.id}` : '/trips';
  const roleSummaries: Record<MembershipRole, RoleDashboardSummary> = {
    OWNER: {
      title: 'Tổng quan điều hành tổ chức',
      description:
        'Theo dõi rủi ro vận hành, hiệu suất ca trực và các cấu hình nền tảng cần hoàn thiện trước khi mở rộng pilot.',
      primaryHref: '/admin',
      primaryLabel: 'Mở quản trị nội bộ',
      secondaryHref: '/trips?exception=ATTENTION',
      secondaryLabel: 'Xem chuyến rủi ro',
      tasks: [
        {
          title: `${data.urgentTrips.length} chuyến cần chú ý`,
          detail: 'Ưu tiên rà soát chuyến chậm, bị chặn hoặc quá lâu chưa cập nhật.'
        },
        {
          title: 'Kiểm tra phân quyền và đội xe',
          detail:
            'Đảm bảo thành viên, phương tiện và tài xế đã được thiết lập đúng trước ca vận hành.'
        }
      ]
    },
    ADMIN: {
      title: 'Tổng quan điều hành tổ chức',
      description:
        'Theo dõi rủi ro vận hành, hiệu suất ca trực và các cấu hình nền tảng cần hoàn thiện trước khi mở rộng pilot.',
      primaryHref: '/admin',
      primaryLabel: 'Mở quản trị nội bộ',
      secondaryHref: '/trips?exception=ATTENTION',
      secondaryLabel: 'Xem chuyến rủi ro',
      tasks: [
        {
          title: `${data.urgentTrips.length} chuyến cần chú ý`,
          detail: 'Ưu tiên rà soát chuyến chậm, bị chặn hoặc quá lâu chưa cập nhật.'
        },
        {
          title: 'Kiểm tra phân quyền và đội xe',
          detail:
            'Đảm bảo thành viên, phương tiện và tài xế đã được thiết lập đúng trước ca vận hành.'
        }
      ]
    },
    DISPATCHER: {
      title: 'Bàn điều phối ca trực',
      description:
        'Mở đúng chuyến cần xử lý, cập nhật sự kiện thủ công phù hợp và dùng bộ lọc ngoại lệ để giảm thời gian rà soát.',
      primaryHref: priorityHref,
      primaryLabel: 'Mở chuyến ưu tiên',
      secondaryHref: '/trips?exception=DELAYED',
      secondaryLabel: 'Lọc chuyến chậm',
      tasks: [
        {
          title: 'Xử lý việc ưu tiên trước',
          detail: 'Bắt đầu từ chuyến có mức ưu tiên cao hoặc thời gian chậm lớn nhất.'
        },
        {
          title: 'Ghi nhận mốc mới đúng timeline',
          detail: 'Dùng thao tác nhanh trong chi tiết chuyến để tránh chọn sai sự kiện.'
        }
      ]
    },
    DOCUMENT_STAFF: {
      title: 'Bàn xử lý chứng từ',
      description:
        'Tập trung vào tờ khai, kiểm hóa, phí và dữ liệu Cửa khẩu số đã được doanh nghiệp ủy quyền.',
      primaryHref: '/integrations/cua-khau-so',
      primaryLabel: 'Mở Cửa khẩu số',
      secondaryHref: '/trips?status=CUSTOMS_PROCESSING',
      secondaryLabel: 'Lọc chuyến hải quan',
      tasks: [
        {
          title: 'Đối chiếu hồ sơ cần xác nhận',
          detail: 'Ưu tiên các chuyến đang xử lý hải quan hoặc cần kiểm hóa.'
        },
        {
          title: 'Đồng bộ dữ liệu được phép',
          detail: 'Chỉ đồng bộ Cửa khẩu số sau khi đăng nhập GateSync và có đúng quyền tổ chức.'
        }
      ]
    },
    FIELD_OPERATOR: {
      title: 'Việc hiện trường cần xác nhận',
      description:
        'Mở các chuyến cần cập nhật mốc tại bãi, cửa khẩu hoặc kết quả kiểm tra thực địa từ mobile.',
      primaryHref: priorityHref,
      primaryLabel: 'Mở việc hiện trường',
      secondaryHref: '/trips?status=WAITING_YARD_ENTRY',
      secondaryLabel: 'Lọc xe chờ bãi',
      tasks: [
        {
          title: 'Xác nhận mốc tại hiện trường',
          detail: 'Cập nhật vào bãi, rời bãi hoặc ghi chú tài xế ngay khi có thông tin.'
        },
        {
          title: 'Giữ rõ nguồn sự kiện',
          detail: 'Timeline hiển thị nguồn thủ công, tài xế, bãi, GPS hoặc hệ thống để truy vết.'
        }
      ]
    },
    VIEWER: {
      title: 'Theo dõi chỉ đọc',
      description:
        'Nắm tình hình vận hành và mở chi tiết chuyến được phép xem, không thực hiện thao tác ghi dữ liệu.',
      primaryHref: '/trips',
      primaryLabel: 'Xem danh sách chuyến',
      secondaryHref: '/trips?exception=ATTENTION',
      secondaryLabel: 'Xem chuyến cần chú ý',
      tasks: [
        {
          title: 'Theo dõi trạng thái hiện tại',
          detail: 'Dùng danh sách chuyến và timeline để xem dữ liệu đã được phân quyền.'
        },
        {
          title: 'Liên hệ quản trị viên khi cần thao tác',
          detail: 'Các nút ghi dữ liệu bị khóa theo vai trò và API vẫn kiểm tra RBAC.'
        }
      ]
    },
    BILLING_ADMIN: {
      title: 'Theo dõi vận hành phục vụ đối soát',
      description:
        'Quan sát tình hình chuyến, sự kiện và rủi ro vận hành để chuẩn bị dữ liệu đối soát nội bộ.',
      primaryHref: '/trips',
      primaryLabel: 'Xem dữ liệu chuyến',
      secondaryHref: '/dashboard',
      secondaryLabel: 'Xem lại tổng quan',
      tasks: [
        {
          title: 'Đối chiếu chuyến hoàn tất',
          detail: 'Theo dõi sự kiện hoàn tất, phí và mốc vận hành trước khi xử lý thanh toán.'
        },
        {
          title: 'Không can thiệp điều phối',
          detail: 'Vai trò thanh toán không thay thế điều phối viên hoặc quản trị vận hành.'
        }
      ]
    }
  };

  return roleSummaries[role];
}

function DashboardLoadingState() {
  return (
    <div className="rounded-[1.75rem] border border-slate-200 bg-white/95 p-6 text-sm text-slate-600 shadow-soft">
      Đang tải dữ liệu điều phối từ GateSync API...
    </div>
  );
}

function DashboardErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-[1.75rem] border border-rose-100 bg-rose-50 p-6 text-sm text-rose-700 shadow-soft">
      {message}
    </div>
  );
}

function EmptyPanel({ message }: { message: string }) {
  return (
    <div className="mt-5 rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
      {message}
    </div>
  );
}
