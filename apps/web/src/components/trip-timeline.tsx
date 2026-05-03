import type { OperationsTripEvent } from '@/lib/operations/view-model';
import { tripEventSourceLabels, tripEventTypeLabels } from '@/lib/ui-labels';
import { EventStatusBadge } from '@/components/status-badge';

type TripTimelineProps = {
  events: OperationsTripEvent[];
  compact?: boolean;
};

export function TripTimeline({ events, compact = false }: TripTimelineProps) {
  return (
    <div className="space-y-3">
      {events.map((event, index) => (
        <div key={event.id} className="relative flex gap-3 sm:gap-4">
          <div className="flex flex-col items-center">
            <span className="mt-1 h-3 w-3 rounded-full bg-sky-500 ring-4 ring-sky-100" />
            {index < events.length - 1 ? (
              <span className="mt-2 h-full min-h-14 w-px bg-slate-200" />
            ) : null}
          </div>
          <div className="min-w-0 flex-1 rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="font-semibold text-slate-950">
                  {tripEventTypeLabels[event.eventType]}
                </p>
                <p className="mt-1 text-sm text-slate-500">{event.occurredAt}</p>
              </div>
              <EventStatusBadge status={event.eventStatus} />
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-700">{event.note}</p>
            <div
              className={`mt-4 grid gap-2 text-xs text-slate-500 ${compact ? 'sm:grid-cols-2' : 'sm:grid-cols-4'}`}
            >
              <span>Nguồn: {tripEventSourceLabels[event.source]}</span>
              <span>Người ghi nhận: {event.actor}</span>
              <span>Ghi vào hệ thống: {event.recordedAt}</span>
              {event.confidence ? (
                <span>Độ tin cậy: {Math.round(event.confidence * 100)}%</span>
              ) : null}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
