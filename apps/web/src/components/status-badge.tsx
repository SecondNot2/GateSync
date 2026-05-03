import type { TripEventStatus, TripStatus } from '@gatesync/shared';
import type { OperationsPriority } from '@/lib/operations/view-model';
import { tripEventStatusLabels, tripStatusLabels } from '@/lib/ui-labels';

const tripStatusTones: Record<TripStatus, string> = {
  PLANNED: 'bg-slate-100 text-slate-700 ring-slate-200',
  IN_PROGRESS: 'bg-sky-100 text-sky-700 ring-sky-200',
  WAITING_YARD_ENTRY: 'bg-amber-100 text-amber-700 ring-amber-200',
  IN_YARD: 'bg-indigo-100 text-indigo-700 ring-indigo-200',
  AT_BORDER_GATE: 'bg-blue-100 text-blue-700 ring-blue-200',
  CUSTOMS_PROCESSING: 'bg-violet-100 text-violet-700 ring-violet-200',
  INSPECTION_REQUIRED: 'bg-fuchsia-100 text-fuchsia-700 ring-fuchsia-200',
  BLOCKED: 'bg-rose-100 text-rose-700 ring-rose-200',
  DELAYED: 'bg-orange-100 text-orange-700 ring-orange-200',
  COMPLETED: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
  CANCELLED: 'bg-zinc-100 text-zinc-700 ring-zinc-200'
};

const eventStatusTones: Record<TripEventStatus, string> = {
  RECORDED: 'bg-sky-100 text-sky-700 ring-sky-200',
  CONFIRMED: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
  REJECTED: 'bg-rose-100 text-rose-700 ring-rose-200',
  CORRECTED: 'bg-amber-100 text-amber-700 ring-amber-200',
  CONFLICTING: 'bg-orange-100 text-orange-700 ring-orange-200'
};

const priorityTones: Record<OperationsPriority, string> = {
  HIGH: 'bg-rose-100 text-rose-700 ring-rose-200',
  MEDIUM: 'bg-amber-100 text-amber-700 ring-amber-200',
  NORMAL: 'bg-slate-100 text-slate-700 ring-slate-200'
};

const priorityLabels: Record<OperationsPriority, string> = {
  HIGH: 'Ưu tiên cao',
  MEDIUM: 'Ưu tiên vừa',
  NORMAL: 'Theo dõi thường'
};

type BadgeProps = {
  children: string;
  className: string;
};

function Badge({ children, className }: BadgeProps) {
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ${className}`}
    >
      {children}
    </span>
  );
}

export function TripStatusBadge({ status }: { status: TripStatus }) {
  return <Badge className={tripStatusTones[status]}>{tripStatusLabels[status]}</Badge>;
}

export function EventStatusBadge({ status }: { status: TripEventStatus }) {
  return <Badge className={eventStatusTones[status]}>{tripEventStatusLabels[status]}</Badge>;
}

export function PriorityBadge({ priority }: { priority: OperationsPriority }) {
  return <Badge className={priorityTones[priority]}>{priorityLabels[priority]}</Badge>;
}
