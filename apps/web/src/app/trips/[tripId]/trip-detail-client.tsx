'use client';

import type { TripEventType } from '@gatesync/shared';
import Link from 'next/link';
import type { FormEvent, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { NoOrganizationState } from '@/components/no-organization-state';
import { PriorityBadge, TripStatusBadge } from '@/components/status-badge';
import { TripTimeline } from '@/components/trip-timeline';
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

export function TripDetailClient({ tripId }: { tripId: string }) {
  const [data, setData] = useState<TripDetailViewData>();
  const [error, setError] = useState<string>();
  const [organizationIssue, setOrganizationIssue] = useState<OrganizationAccessIssue>();
  const [isLoading, setIsLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [eventType, setEventType] = useState<TripEventType>('ARRIVED_BORDER_AREA');
  const [occurredAt, setOccurredAt] = useState(toLocalDateTimeInputValue(new Date()));
  const [note, setNote] = useState('');
  const [submitMessage, setSubmitMessage] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const shellProps = data?.organization ? { organization: data.organization } : {};

  useEffect(() => {
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
  }, [tripId]);

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
      setSubmitMessage('Đã ghi nhận sự kiện mới vào timeline chuyến.');
    } catch (submitError) {
      setSubmitMessage(
        submitError instanceof Error ? submitError.message : 'Không thể ghi nhận sự kiện mới.'
      );
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

          <section className="grid gap-5 xl:grid-cols-[1fr_22rem]">
            <div className="rounded-[1.75rem] border border-slate-200 bg-white/95 p-4 shadow-soft sm:p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap gap-2">
                    <TripStatusBadge status={trip.currentStatus} />
                    <PriorityBadge priority={trip.priority} />
                  </div>
                  <h2 className="mt-4 text-3xl font-bold text-slate-950">
                    {tripTypeLabels[trip.tripType]}
                  </h2>
                  <p className="mt-2 text-sm text-slate-600">
                    {tripDirectionLabels[trip.direction]} · Cập nhật trạng thái lúc{' '}
                    {trip.statusUpdatedAt}
                  </p>
                </div>
                <div className="rounded-3xl border border-amber-100 bg-amber-50 px-5 py-4 text-slate-950">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
                    Tiến độ
                  </p>
                  <p className="mt-2 text-2xl font-bold text-amber-800">
                    {formatDelay(trip.delayMinutes)}
                  </p>
                </div>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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

              <div className="mt-6 rounded-3xl border border-sky-100 bg-sky-50 p-5">
                <p className="text-sm font-semibold text-sky-900">{trip.nextActionLabel}</p>
                <p className="mt-2 text-sm leading-6 text-slate-700">{trip.nextAction}</p>
              </div>
            </div>

            <aside className="space-y-5">
              <div className="rounded-[1.75rem] border border-slate-200 bg-white/95 p-4 shadow-soft sm:p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                  Thao tác nhanh
                </p>
                <div className="mt-4 grid gap-3">
                  <button
                    type="button"
                    disabled={!canManageTrips || manualActionOptions.length === 0}
                    onClick={() => setIsFormOpen((value) => !value)}
                    className="min-h-12 rounded-2xl bg-slate-950 px-4 py-3 text-left text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
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
                      className="min-h-12 rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-left text-sm font-semibold text-sky-800 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:border-slate-100 disabled:bg-slate-50 disabled:text-slate-400"
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
                    <label className="block">
                      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                        Loại sự kiện
                      </span>
                      <select
                        className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                        value={eventType}
                        onChange={(inputEvent) =>
                          setEventType(inputEvent.target.value as TripEventType)
                        }
                      >
                        {manualActionOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                        Thời điểm xảy ra
                      </span>
                      <input
                        className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                        type="datetime-local"
                        value={occurredAt}
                        onChange={(inputEvent) => setOccurredAt(inputEvent.target.value)}
                        required
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                        Ghi chú
                      </span>
                      <textarea
                        className="mt-2 min-h-24 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                        placeholder="Nhập ghi chú vận hành ngắn gọn"
                        value={note}
                        onChange={(inputEvent) => setNote(inputEvent.target.value)}
                      />
                    </label>
                    <button
                      disabled={isSubmitting || manualActionOptions.length === 0}
                      className="min-h-12 w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                    >
                      {isSubmitting ? 'Đang ghi nhận...' : 'Lưu sự kiện'}
                    </button>
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

          <section className="grid gap-5 xl:grid-cols-[1fr_24rem]">
            <div className="rounded-[1.75rem] border border-slate-200 bg-white/95 p-4 shadow-soft sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                    Dòng thời gian sự kiện
                  </p>
                  <h2 className="mt-2 text-2xl font-bold text-slate-950">Lịch sử vận hành</h2>
                </div>
                <p className="max-w-xl text-sm leading-6 text-slate-600">
                  Mỗi sự kiện thể hiện một mốc vận hành quan trọng để đội điều phối theo dõi lại
                  lịch sử chuyến.
                </p>
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
    </AppShell>
  );
}

function InfoCard({ label, title, detail }: { label: string; title: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <p className="mt-2 font-semibold text-slate-950">{title}</p>
      <p className="mt-1 text-sm text-slate-600">{detail}</p>
    </div>
  );
}

function SidePanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-[1.75rem] border border-slate-200 bg-white/95 p-4 shadow-soft sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">{title}</p>
      <div className="mt-4 space-y-4 text-sm text-slate-600">{children}</div>
    </div>
  );
}

function StatePanel({
  message,
  tone = 'default'
}: {
  message: string;
  tone?: 'default' | 'error';
}) {
  const className =
    tone === 'error'
      ? 'border-rose-100 bg-rose-50 text-rose-700'
      : 'border-dashed border-slate-200 bg-slate-50 text-slate-600';

  return <div className={`rounded-3xl border p-5 text-sm ${className}`}>{message}</div>;
}

function toLocalDateTimeInputValue(date: Date) {
  const timezoneOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 16);
}
