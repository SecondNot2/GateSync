'use client';

import type { TripEventType } from '@gatesync/shared';
import Link from 'next/link';
import type { FormEvent, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AppShell } from '@/components/app-shell';
import { ConflictDialog } from '@/components/conflict-dialog';
import { NoOrganizationState } from '@/components/no-organization-state';
import { PriorityBadge, TripStatusBadge } from '@/components/status-badge';
import { TripTimeline } from '@/components/trip-timeline';
import { Button, DateTimeInput, SelectInput, StatePanel, TextareaInput } from '@/components/ui';
import { ConflictError } from '@/lib/api/client';
import { createManualTripEvent, loadTripDetailData } from '@/lib/operations/data';
import { isOrganizationAccessError, type OrganizationAccessIssue } from '@/lib/operations/errors';
import type { TripDetailViewData } from '@/lib/operations/view-model';
import {
  formatDelay,
  tripDirectionLabels,
  tripEventSourceLabels,
  tripEventTypeLabels,
  tripStatusLabels,
  tripTypeLabels,
  vehicleTypeLabels
} from '@/lib/ui-labels';

const manualEventOptions: Array<{ value: TripEventType; label: string }> = [
  { value: 'DEPARTED', label: tripEventTypeLabels.DEPARTED },
  { value: 'ARRIVED_BORDER_AREA', label: tripEventTypeLabels.ARRIVED_BORDER_AREA },
  { value: 'WAITING_YARD_ENTRY', label: tripEventTypeLabels.WAITING_YARD_ENTRY },
  { value: 'YARD_ENTRY_CONFIRMED', label: tripEventTypeLabels.YARD_ENTRY_CONFIRMED },
  { value: 'YARD_EXIT_CONFIRMED', label: tripEventTypeLabels.YARD_EXIT_CONFIRMED },
  { value: 'DECLARATION_SUBMITTED', label: tripEventTypeLabels.DECLARATION_SUBMITTED },
  { value: 'CUSTOMS_PROCESSING', label: tripEventTypeLabels.CUSTOMS_PROCESSING },
  { value: 'INSPECTION_REQUIRED', label: tripEventTypeLabels.INSPECTION_REQUIRED },
  { value: 'INSPECTION_COMPLETED', label: tripEventTypeLabels.INSPECTION_COMPLETED },
  { value: 'BORDER_GATE_EXIT_CONFIRMED', label: tripEventTypeLabels.BORDER_GATE_EXIT_CONFIRMED },
  { value: 'TRIP_COMPLETED', label: tripEventTypeLabels.TRIP_COMPLETED }
];

function resolveManualEventOptions(actions?: TripEventType[]) {
  if (actions === undefined) {
    return manualEventOptions;
  }

  return actions.map((value) => ({
    value,
    label: tripEventTypeLabels[value]
  }));
}

type TripDetailClientProps = {
  tripId: string;
  initialData?: TripDetailViewData;
  initialError?: string;
  initialOrganizationIssue?: OrganizationAccessIssue;
};

export function TripDetailClient({
  tripId,
  initialData,
  initialError,
  initialOrganizationIssue
}: TripDetailClientProps) {
  const hasInitialState = Boolean(initialData || initialError || initialOrganizationIssue);
  const [data, setData] = useState<TripDetailViewData | undefined>(initialData);
  const [error, setError] = useState<string | undefined>(initialError);
  const [organizationIssue, setOrganizationIssue] = useState<OrganizationAccessIssue | undefined>(
    initialOrganizationIssue
  );
  const [isLoading, setIsLoading] = useState(!hasInitialState);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [eventType, setEventType] = useState<TripEventType>('ARRIVED_BORDER_AREA');
  const [occurredAt, setOccurredAt] = useState(toLocalDateTimeInputValue(new Date()));
  const [note, setNote] = useState('');
  const [submitMessage, setSubmitMessage] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [conflictMessage, setConflictMessage] = useState<string>();
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
        const result = await loadTripDetailData(tripId);

        if (isMounted) {
          setData(result);
        }
      } catch (loadError) {
        if (isMounted) {
          if (isOrganizationAccessError(loadError)) {
            setOrganizationIssue(loadError.issue);
          }

          setError(
            loadError instanceof Error ? loadError.message : 'Không thể tải chi tiết chuyến.'
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
  }, [hasInitialState, tripId]);

  useEffect(() => {
    const firstAction = data?.trip.availableManualActions[0];

    if (firstAction && !data.trip.availableManualActions.includes(eventType)) {
      setEventType(firstAction);
    }
  }, [data?.trip.availableManualActions, eventType]);

  async function submitManualEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setSubmitMessage(undefined);

    const previousData = data;

    // Optimistic: show a temporary pending event in the timeline
    if (data?.trip) {
      setData({
        ...data,
        trip: {
          ...data.trip,
          events: [
            ...data.trip.events,
            {
              id: `optimistic-${Date.now()}`,
              tripId,
              eventType,
              occurredAt: new Date(occurredAt).toISOString(),
              recordedAt: new Date().toISOString(),
              eventStatus: 'RECORDED' as const,
              source: 'MANUAL' as const,
              actor: 'Bạn',
              note: note.trim() || ''
            }
          ]
        }
      });
    }

    try {
      const payload: Parameters<typeof createManualTripEvent>[1] = {
        eventType,
        occurredAt: new Date(occurredAt).toISOString(),
        source: 'MANUAL'
      };

      if (note.trim()) {
        payload.note = note.trim();
      }

      await createManualTripEvent(tripId, payload);
      const result = await loadTripDetailData(tripId);

      setData(result);
      setNote('');
      setIsFormOpen(false);
      toast.success('Đã ghi nhận sự kiện mới vào timeline chuyến.');
    } catch (submitError) {
      // Rollback optimistic update
      setData(previousData);

      if (submitError instanceof ConflictError) {
        setConflictMessage(submitError.message);
        setConflictOpen(true);
      } else {
        toast.error(
          submitError instanceof Error ? submitError.message : 'Không thể ghi nhận sự kiện mới.'
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  const trip = data?.trip;
  const latestEvent = trip?.events[trip.events.length - 1];
  const manualActionOptions = resolveManualEventOptions(trip?.availableManualActions);
  const canManageTrips = data?.organization.currentUser?.canManageTrips ?? true;

  return (
    <AppShell
      activeNav="trips"
      eyebrow="Chi tiết chuyến"
      title={trip?.tripCode ?? 'Đang tải chuyến'}
      description="Xem trạng thái hiện tại, việc cần làm tiếp theo, thông tin vận hành và lịch sử sự kiện của chuyến."
      {...shellProps}
      action={
        <Link
          href="/trips"
          className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-center text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-700"
        >
          Quay lại danh sách
        </Link>
      }
    >
      {isLoading ? <StatePanel message="Đang tải chi tiết chuyến từ GateSync API..." /> : null}
      {!isLoading && organizationIssue && error ? (
        <NoOrganizationState issue={organizationIssue} message={error} />
      ) : null}
      {!isLoading && !organizationIssue && error ? (
        <StatePanel tone="error" message={error} />
      ) : null}
      {!isLoading && !error && data && trip ? (
        <>
          {data.notice ? (
            <div className="rounded-3xl border border-amber-100 bg-amber-50 px-5 py-4 text-sm font-semibold text-amber-800">
              {data.notice}
            </div>
          ) : null}

          {submitMessage ? (
            <div className="rounded-3xl border border-sky-100 bg-sky-50 px-5 py-4 text-sm font-semibold text-sky-800">
              {submitMessage}
            </div>
          ) : null}

          <section className="grid gap-3 xl:grid-cols-[1fr_20rem]">
            <div className="rounded-[1.75rem] border border-slate-200 bg-white/95 p-4 shadow-soft sm:p-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap gap-2">
                    <TripStatusBadge status={trip.currentStatus} />
                    <PriorityBadge priority={trip.priority} />
                  </div>
                  <h2 className="mt-3 text-2xl font-bold text-slate-950">
                    {tripTypeLabels[trip.tripType]}
                  </h2>
                  <p className="mt-2 text-sm text-slate-600">
                    {tripDirectionLabels[trip.direction]} · Cập nhật trạng thái lúc{' '}
                    {trip.statusUpdatedAt}
                  </p>
                </div>
                <div className="rounded-3xl border border-amber-100 bg-amber-50 px-4 py-3 text-slate-950">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
                    Tiến độ
                  </p>
                  <p className="mt-2 text-2xl font-bold text-amber-800">
                    {formatDelay(trip.delayMinutes)}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <InfoCard
                  label="Phương tiện"
                  title={trip.vehicle.plateNumber}
                  detail={vehicleTypeLabels[trip.vehicle.type]}
                />
                <InfoCard label="Tài xế" title={trip.driver.name} detail={trip.driver.phone} />
                <InfoCard label="Cửa khẩu" title={trip.borderGate} detail={trip.yard} />
                <InfoCard
                  label="Trạng thái"
                  title={tripStatusLabels[trip.currentStatus]}
                  detail={`${trip.events.length} sự kiện`}
                />
              </div>

              {trip.declarationSignal ? (
                <div className="mt-4 rounded-3xl border border-sky-100 bg-sky-50 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                        Tín hiệu Cửa khẩu số
                      </p>
                      <p className="mt-2 text-lg font-bold text-slate-950">
                        Tờ khai {trip.declarationSignal.number}
                      </p>
                      <p className="mt-1 text-sm text-slate-700">
                        {trip.declarationSignal.status} · {trip.declarationSignal.paymentStatus}
                      </p>
                    </div>
                    <span
                      className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${
                        trip.declarationSignal.stale
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {trip.declarationSignal.freshness}
                    </span>
                  </div>
                  {trip.declarationSignal.warnings.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {trip.declarationSignal.warnings.map((warning) => (
                        <span
                          key={warning.code}
                          className={`rounded-full px-3 py-1 text-xs font-bold ring-1 ${warning.tone}`}
                        >
                          {warning.label}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-4 rounded-3xl border border-sky-100 bg-sky-50 p-4">
                <p className="text-sm font-semibold text-sky-900">{trip.nextActionLabel}</p>
                <p className="mt-2 text-sm leading-6 text-slate-700">{trip.nextAction}</p>
              </div>
            </div>

            <aside className="space-y-3">
              <div className="rounded-[1.75rem] border border-slate-200 bg-white/95 p-3 shadow-soft sm:p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                  Thao tác nhanh
                </p>
                <div className="mt-3 grid gap-2">
                  <button
                    type="button"
                    disabled={!canManageTrips || manualActionOptions.length === 0}
                    onClick={() => setIsFormOpen((value) => !value)}
                    className="min-h-11 rounded-2xl bg-slate-950 px-4 py-2.5 text-left text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                  >
                    {canManageTrips ? 'Ghi nhận sự kiện mới' : 'Chỉ xem timeline'}
                  </button>
                  {manualActionOptions.slice(0, 4).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      disabled={!canManageTrips}
                      onClick={() => {
                        setEventType(option.value);
                        setIsFormOpen(true);
                      }}
                      className="min-h-11 rounded-2xl border border-sky-100 bg-sky-50 px-4 py-2.5 text-left text-sm font-semibold text-sky-800 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:border-slate-100 disabled:bg-slate-50 disabled:text-slate-400"
                    >
                      {option.label}
                    </button>
                  ))}
                  {!canManageTrips ? (
                    <p className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      Vai trò hiện tại chỉ được xem dữ liệu chuyến. Mọi thao tác ghi sự kiện vẫn
                      được API kiểm tra RBAC trước khi lưu.
                    </p>
                  ) : null}
                  {manualActionOptions.length === 0 ? (
                    <p className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                      Chuyến đã kết thúc hoặc chưa có thao tác thủ công phù hợp.
                    </p>
                  ) : null}
                </div>

                {isFormOpen ? (
                  <form
                    onSubmit={submitManualEvent}
                    className="mt-5 space-y-4 rounded-3xl bg-slate-50 p-4"
                  >
                    <SelectInput
                      label="Loại sự kiện"
                      value={eventType}
                      options={manualActionOptions}
                      onChange={(inputEvent) =>
                        setEventType(inputEvent.target.value as TripEventType)
                      }
                    />
                    <DateTimeInput
                      label="Thời điểm xảy ra"
                      value={occurredAt}
                      onChange={(inputEvent) => setOccurredAt(inputEvent.target.value)}
                      required
                    />
                    <TextareaInput
                      label="Ghi chú"
                      placeholder="Nhập ghi chú vận hành ngắn gọn"
                      value={note}
                      onChange={(inputEvent) => setNote(inputEvent.target.value)}
                    />
                    <Button disabled={isSubmitting || manualActionOptions.length === 0} fullWidth>
                      {isSubmitting ? 'Đang ghi nhận...' : 'Lưu sự kiện'}
                    </Button>
                  </form>
                ) : null}
              </div>

              <SidePanel title="Hàng hóa & tờ khai">
                <div>
                  <p className="font-semibold text-slate-950">{trip.shipment.description}</p>
                  <p className="mt-1">Số container: {trip.shipment.containerNumber}</p>
                  <p className="mt-1">Số niêm phong: {trip.shipment.sealNumber}</p>
                  <p className="mt-1">Khối lượng: {trip.shipment.weightKg}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p>Tờ khai: {trip.declaration.number}</p>
                  <p className="mt-1">Trạng thái: {trip.declaration.status}</p>
                  <p className="mt-1">Chi cục: {trip.declaration.customsOfficeCode}</p>
                </div>
              </SidePanel>

              <SidePanel title="Phân quyền xem">
                <div className="flex flex-wrap gap-2">
                  {trip.participants.map((participant) => (
                    <span
                      key={participant.id}
                      className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600"
                    >
                      {participant.label}
                    </span>
                  ))}
                </div>
              </SidePanel>
            </aside>
          </section>

          {trip.cuaKhauSoDeclaration ? (
            <CuaKhauSoDeclarationSection declaration={trip.cuaKhauSoDeclaration} />
          ) : (
            <section className="rounded-[1.75rem] border border-dashed border-slate-200 bg-white/80 p-5 text-sm text-slate-600 shadow-soft">
              Chuyến này chưa có bản sao tờ khai Cửa khẩu số. Khi worker đồng bộ hoặc tờ khai được
              liên kết, GateSync sẽ hiển thị chi tiết nghiệp vụ tại đây.
            </section>
          )}

          <section className="grid gap-3 xl:grid-cols-[1fr_22rem]">
            <div className="rounded-[1.75rem] border border-slate-200 bg-white/95 p-4 shadow-soft sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                    Dòng thời gian sự kiện
                  </p>
                  <h2 className="mt-2 text-2xl font-bold text-slate-950">Lịch sử vận hành</h2>
                </div>
                <details className="max-w-xl text-sm leading-6 text-slate-600">
                  <summary className="cursor-pointer list-none text-xs font-semibold text-slate-400">
                    Nguồn sự kiện
                  </summary>
                  <p className="mt-1">
                    Mỗi sự kiện thể hiện một mốc vận hành quan trọng kèm nguồn ghi nhận như thủ
                    công, tài xế, Cửa khẩu số, bãi, GPS hoặc hệ thống.
                  </p>
                </details>
              </div>
              <div className="mt-5">
                {trip.events.length > 0 ? (
                  <TripTimeline events={trip.events} />
                ) : (
                  <StatePanel message="Chưa có sự kiện nào được ghi nhận cho chuyến này." />
                )}
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-slate-200 bg-white/95 p-4 text-slate-950 shadow-soft sm:p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                Sự kiện mới nhất
              </p>
              {latestEvent ? (
                <div className="mt-5 rounded-3xl border border-slate-100 bg-slate-50 p-4">
                  <p className="font-semibold">{latestEvent.occurredAt}</p>
                  <p className="mt-3 text-sm leading-6 text-slate-700">{latestEvent.note}</p>
                  <p className="mt-4 text-xs font-semibold text-sky-700">
                    Nguồn: {tripEventSourceLabels[latestEvent.source]}
                  </p>
                </div>
              ) : (
                <div className="mt-5 rounded-3xl border border-dashed border-slate-200 p-4 text-sm text-slate-600">
                  Chưa có sự kiện nào được ghi nhận cho chuyến này.
                </div>
              )}
            </div>
          </section>
        </>
      ) : null}

      <ConflictDialog
        isOpen={conflictOpen}
        {...(conflictMessage ? { message: conflictMessage } : {})}
        onClose={() => setConflictOpen(false)}
        onReload={async () => {
          setConflictOpen(false);
          const result = await loadTripDetailData(tripId);
          setData(result);
        }}
      />
    </AppShell>
  );
}

function InfoCard({ label, title, detail }: { label: string; title: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <p className="mt-2 font-semibold text-slate-950">{title}</p>
      <p className="mt-1 text-sm text-slate-600">{detail}</p>
    </div>
  );
}

function CuaKhauSoDeclarationSection({
  declaration
}: {
  declaration: NonNullable<TripDetailViewData['trip']['cuaKhauSoDeclaration']>;
}) {
  return (
    <section className="rounded-[1.75rem] border border-sky-100 bg-white/95 p-4 shadow-soft sm:p-5">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
            Bản sao Cửa khẩu số
          </p>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">
            Tờ khai {declaration.summary.number}
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            GateSync hiển thị dữ liệu chuẩn hóa đã ingested từ Cửa khẩu số. Không hiển thị raw
            payload và không gọi trực tiếp hệ thống nguồn từ trang chi tiết chuyến.
          </p>
        </div>
        <div
          className={`rounded-3xl border px-4 py-3 text-sm ${
            declaration.freshness.stale
              ? 'border-amber-100 bg-amber-50 text-amber-800'
              : 'border-emerald-100 bg-emerald-50 text-emerald-800'
          }`}
        >
          <p className="font-bold">{declaration.freshness.label}</p>
          <p className="mt-1 text-xs">Ingested: {declaration.freshness.lastIngestedAt}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <InfoCard
          label="Luồng"
          title={declaration.summary.direction}
          detail={declaration.summary.status}
        />
        <InfoCard
          label="Phương tiện nguồn"
          title={declaration.summary.plateNumber}
          detail={`Mooc: ${declaration.summary.trailerNumber}`}
        />
        <InfoCard
          label="Cửa khẩu"
          title={declaration.summary.gateName}
          detail={declaration.summary.gateCode}
        />
        <InfoCard
          label="Sang tải"
          title={declaration.transshipment.statusLabel}
          detail={`GPLV: ${declaration.transshipment.licenseNumber}`}
        />
      </div>

      <div
        className={`mt-5 rounded-3xl border p-4 ${
          declaration.transshipment.eligible
            ? 'border-emerald-100 bg-emerald-50 text-emerald-900'
            : declaration.transshipment.borderGuardLagging
              ? 'border-amber-100 bg-amber-50 text-amber-900'
              : 'border-slate-100 bg-slate-50 text-slate-700'
        }`}
      >
        <p className="text-sm font-bold text-slate-950">Điều kiện ký sang tải</p>
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          <StatusRow
            label="Mục 9 - giấy phép"
            value={declaration.transshipment.licenseNumber}
            active={declaration.transshipment.licenseRegistered}
          />
          <StatusRow
            label="Mục 11 - xác nhận GPLV"
            value={
              declaration.transshipment.transportLicenseConfirmed ? 'Đã xác nhận' : 'Chưa xác nhận'
            }
            active={declaration.transshipment.transportLicenseConfirmed}
          />
          <StatusRow
            label="Xe không VN vào cửa khẩu"
            value={
              declaration.transshipment.foreignVehicleRequired
                ? declaration.transshipment.chinaVehicleEntered
                  ? 'Đủ CBBP + CBHQ'
                  : 'Chưa đủ CBBP + CBHQ'
                : 'Không bắt buộc'
            }
            active={declaration.transshipment.foreignVehicleEntered}
          />
          <StatusRow
            label="Xe VN nhận sang tải"
            value={
              declaration.transshipment.vietnamVehicleEntered ? 'Đủ BP + HQ' : 'Chưa đủ BP + HQ'
            }
            active={declaration.transshipment.vietnamVehicleEntered}
          />
        </div>
      </div>

      <div className="mt-5 grid gap-3 xl:grid-cols-[1fr_0.9fr]">
        <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
          <p className="text-sm font-bold text-slate-950">Thông tin nghiệp vụ</p>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {declaration.generalInfo.map((item) => (
              <div key={item.label} className="rounded-2xl bg-white px-4 py-3 text-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                  {item.label}
                </p>
                <p className="mt-1 font-semibold text-slate-800">{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
          <p className="text-sm font-bold text-slate-950">Phí & kiểm tra</p>
          <div className="mt-3 space-y-2">
            {declaration.payments.map((payment) => (
              <StatusRow
                key={payment.label}
                label={payment.label}
                value={`${payment.amount} · ${payment.status}`}
                active={payment.paid}
              />
            ))}
            {declaration.checks.map((check) => (
              <StatusRow
                key={check.label}
                label={check.label}
                value={check.detail}
                active={check.done}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 xl:grid-cols-[0.8fr_1fr]">
        <div className="rounded-3xl border border-slate-100 bg-white p-4">
          <p className="text-sm font-bold text-slate-950">Bước thủ tục</p>
          <div className="mt-3 space-y-2">
            {declaration.procedureSteps.length > 0 ? (
              declaration.procedureSteps.map((step) => (
                <StatusRow
                  key={`${step.step}-${step.label}`}
                  label={`${step.step}. ${step.label}`}
                  value={`${step.status} · ${step.occurredAt}`}
                  active={step.done}
                />
              ))
            ) : (
              <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-3 text-sm text-slate-500">
                Chưa có bước thủ tục từ bản sao Cửa khẩu số.
              </p>
            )}
          </div>
        </div>
      </div>

      <CksDataTable
        title="Thông tin hàng hóa đại diện"
        emptyText="Chưa có hàng hóa đại diện từ Cửa khẩu số."
        headers={['STT', 'Tên hàng', 'HS', 'Khối lượng', 'Giá trị hàng hóa']}
        rows={declaration.representativeGoods.map((item, index) => ({
          key: item.id,
          cells: [index + 1, item.name, item.hsCode, item.weight, item.priceVnd]
        }))}
      />

      <CksDataTable
        title="Thông tin tờ khai"
        emptyText="Chưa có thông tin tờ khai hải quan."
        headers={['STT', 'Tên công ty', 'Mã số thuế', 'Số tờ khai HQ', 'Loại hình XNK']}
        rows={declaration.customsDeclarations.map((item, index) => ({
          key: item.id,
          cells: [
            index + 1,
            item.companyName,
            item.companyTaxCode,
            item.declarationNumber,
            item.declarationType
          ]
        }))}
      />

      <CksDataTable
        title="Danh sách phương tiện"
        emptyText="Chưa có phương tiện trong tờ khai."
        headers={[
          'STT',
          'Biển số xe',
          'Số Container',
          'Số Mooc',
          'Loại phương tiện',
          'Lái xe',
          'Số điện thoại',
          'Trạng thái',
          'Biển số sang tải',
          'Biển số xe chuyên trách',
          'Nhóm hàng hóa',
          'Ghi chú',
          'Giấy phép vận tải quốc tế',
          'Vào BP',
          'Vào HQ'
        ]}
        rows={declaration.vehicles.map((vehicle, index) => ({
          key: vehicle.id,
          cells: [
            index + 1,
            vehicle.plateNumber,
            vehicle.containerNumber,
            vehicle.trailerNumber,
            vehicle.vehicleType,
            vehicle.driverName,
            vehicle.phoneNumber,
            vehicle.statusLabel,
            vehicle.transshipmentPlateNumber,
            vehicle.responsiblePlateNumber,
            vehicle.goodsGroup,
            vehicle.note,
            vehicle.transportLicenseNumber,
            vehicle.borderGuardAt,
            vehicle.customsArrivalAt
          ]
        }))}
      />

      {declaration.transshipmentVehicles.length > 0 ? (
        <CksDataTable
          title="Xe nhận sang tải"
          emptyText="Không có xe nhận sang tải."
          headers={[
            'STT',
            'Biển số xe',
            'Biển số sang tải',
            'Loại phương tiện',
            'Số Container',
            'Số Mooc',
            'Lái xe',
            'Phí 01',
            'Địa điểm sang tải',
            'Tờ khai Hải Quan',
            'Trạng thái',
            'Ghi chú',
            'Vào BP',
            'Vào HQ'
          ]}
          rows={declaration.transshipmentVehicles.map((vehicle, index) => ({
            key: vehicle.id,
            cells: [
              index + 1,
              vehicle.sourcePlateNumber,
              vehicle.plateNumber,
              vehicle.vehicleType,
              vehicle.containerNumber,
              vehicle.trailerNumber,
              vehicle.driverName,
              vehicle.price,
              vehicle.areaChange,
              vehicle.customsDeclarationNumbers,
              vehicle.statusLabel,
              vehicle.note,
              vehicle.borderGuardEnteredAt,
              vehicle.customsEnteredAt
            ]
          }))}
        />
      ) : null}

      <details className="mt-5 rounded-3xl border border-slate-100 bg-slate-50 p-4">
        <summary className="cursor-pointer list-none text-sm font-bold text-slate-950">
          Sự kiện đề xuất
        </summary>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {declaration.eventCandidates.length > 0 ? (
            declaration.eventCandidates.map((event) => (
              <div
                key={`${event.eventType}-${event.occurredAt}`}
                className="rounded-2xl bg-white px-4 py-3 text-sm"
              >
                <p className="font-bold text-slate-950">{tripEventTypeLabels[event.eventType]}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {event.occurredAt} · độ tin cậy {event.confidence}
                </p>
                <p className="mt-2 text-xs leading-5 text-slate-600">{event.note}</p>
              </div>
            ))
          ) : (
            <p className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
              Chưa có sự kiện đủ tin cậy từ bản sao Cửa khẩu số.
            </p>
          )}
        </div>
      </details>
    </section>
  );
}

function CksDataTable({
  title,
  emptyText,
  headers,
  rows
}: {
  title: string;
  emptyText: string;
  headers: string[];
  rows: Array<{
    key: string;
    cells: Array<string | number>;
  }>;
}) {
  return (
    <div className="mt-5 overflow-hidden rounded-3xl border border-slate-100 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3">
        <p className="text-sm font-bold text-sky-700">{title}</p>
        <p className="text-xs font-semibold text-slate-400">{rows.length} dòng</p>
      </div>
      {rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-0 text-left text-xs">
            <thead>
              <tr className="bg-slate-100 text-[0.68rem] font-bold uppercase tracking-[0.08em] text-slate-500">
                {headers.map((header) => (
                  <th key={header} className="whitespace-nowrap px-3 py-2 first:pl-4 last:pr-4">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-b border-slate-100 even:bg-slate-50/60">
                  {row.cells.map((cell, index) => (
                    <td
                      key={`${row.key}-${headers[index] ?? index}`}
                      className="max-w-[18rem] border-b border-slate-100 px-3 py-3 align-top text-slate-700 first:pl-4 last:pr-4"
                    >
                      <span className={index === 1 ? 'font-bold text-slate-950' : ''}>{cell}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-4 py-5 text-sm text-slate-500">{emptyText}</p>
      )}
    </div>
  );
}

function StatusRow({ label, value, active }: { label: string; value: string; active: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-2xl bg-white px-4 py-3 text-sm">
      <div>
        <p className="font-semibold text-slate-900">{label}</p>
        <p className="mt-1 text-xs text-slate-500">{value}</p>
      </div>
      <span
        className={`rounded-full px-3 py-1 text-xs font-bold ${
          active ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
        }`}
      >
        {active ? 'Đã xong' : 'Theo dõi'}
      </span>
    </div>
  );
}

function SidePanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="rounded-[1.75rem] border border-slate-200 bg-white/95 p-3 shadow-soft sm:p-4">
      <summary className="cursor-pointer list-none text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
        {title}
      </summary>
      <div className="mt-3 space-y-3 text-sm text-slate-600">{children}</div>
    </details>
  );
}

function toLocalDateTimeInputValue(date: Date) {
  const timezoneOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 16);
}
