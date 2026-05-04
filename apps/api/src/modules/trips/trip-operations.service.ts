import { Injectable } from '@nestjs/common';
import type { TripEventType, TripStatus } from '@prisma/client';

export const tripExceptionFilters = [
  'ATTENTION',
  'DELAYED',
  'BLOCKED',
  'STALE',
  'INSPECTION',
  'WAITING_YARD'
] as const;

export type TripExceptionFilter = (typeof tripExceptionFilters)[number];
export type TripOperationalPriority = 'HIGH' | 'MEDIUM' | 'NORMAL';
export type TripExceptionCode =
  | 'ARRIVAL_OVERDUE'
  | 'BLOCKED'
  | 'DELAYED_STATUS'
  | 'INSPECTION_REQUIRED'
  | 'PLANNED_START_OVERDUE'
  | 'STATUS_STALE'
  | 'WAITING_YARD';
export type TripNextActionCode =
  | 'CHECK_DELAY'
  | 'COMPLETE_INSPECTION'
  | 'CONFIRM_BORDER_ARRIVAL'
  | 'CONFIRM_BORDER_EXIT'
  | 'CONFIRM_YARD_ENTRY'
  | 'CONFIRM_YARD_EXIT'
  | 'PAY_FEE'
  | 'PROCESS_CUSTOMS'
  | 'REQUEST_YARD_ENTRY'
  | 'RESOLVE_BLOCKER'
  | 'REVIEW_CANCELLED'
  | 'REVIEW_COMPLETED'
  | 'SUBMIT_DECLARATION'
  | 'WAIT_DEPARTURE';

export type TripOperationalNextAction = {
  code: TripNextActionCode;
  label: string;
  description: string;
  suggestedEventTypes: TripEventType[];
};

export type TripOperationalState = {
  delayMinutes: number;
  statusDurationMinutes: number;
  priority: TripOperationalPriority;
  exceptionCodes: TripExceptionCode[];
  nextAction: TripOperationalNextAction;
  availableManualActions: TripEventType[];
  latestEventType?: TripEventType;
  latestEventOccurredAt?: string;
};

export type TripDelaySummary = {
  delayedTrips: number;
  blockedTrips: number;
  staleTrips: number;
  averageDelayMinutes: number;
  longestDelayMinutes: number;
  groups: Array<{
    key: TripExceptionCode;
    count: number;
  }>;
};

export type TripOperationEventInput = {
  eventType: TripEventType;
  occurredAt: Date | string;
  recordedAt?: Date | string | null;
};

export type TripOperationInput = {
  currentStatus: TripStatus;
  currentStatusUpdatedAt?: Date | string | null;
  plannedStartAt?: Date | string | null;
  plannedArrivalAt?: Date | string | null;
  events?: readonly TripOperationEventInput[];
};

export type TripWithOperationalState<T extends TripOperationInput> = T & {
  operationalState: TripOperationalState;
};

type DelayDetails = {
  arrivalDelayMinutes: number;
  plannedStartDelayMinutes: number;
  statusDelayMinutes: number;
  delayMinutes: number;
};

const terminalStatuses: readonly TripStatus[] = ['COMPLETED', 'CANCELLED'];
const attentionStatuses: readonly TripStatus[] = [
  'WAITING_YARD_ENTRY',
  'INSPECTION_REQUIRED',
  'BLOCKED',
  'DELAYED'
] as const;

const statusDelayThresholdMinutes: Partial<Record<TripStatus, number>> = {
  IN_PROGRESS: 240,
  WAITING_YARD_ENTRY: 45,
  IN_YARD: 180,
  AT_BORDER_GATE: 120,
  CUSTOMS_PROCESSING: 180,
  INSPECTION_REQUIRED: 120,
  BLOCKED: 0,
  DELAYED: 0
};

const manualActionsByStatus: Record<TripStatus, TripEventType[]> = {
  PLANNED: ['DEPARTED', 'TRIP_CANCELLED'],
  IN_PROGRESS: [
    'ARRIVED_BORDER_AREA',
    'WAITING_YARD_ENTRY',
    'BORDER_GATE_ENTRY_CONFIRMED',
    'DECLARATION_SUBMITTED',
    'DRIVER_NOTE_ADDED',
    'TRIP_CANCELLED'
  ],
  WAITING_YARD_ENTRY: [
    'YARD_ENTRY_CONFIRMED',
    'DRIVER_REPORTED_YARD_ENTRY',
    'DRIVER_NOTE_ADDED',
    'TRIP_CANCELLED'
  ],
  IN_YARD: ['YARD_EXIT_CONFIRMED', 'DECLARATION_SUBMITTED', 'DRIVER_NOTE_ADDED', 'TRIP_CANCELLED'],
  AT_BORDER_GATE: [
    'BORDER_GATE_ENTRY_CONFIRMED',
    'DECLARATION_SUBMITTED',
    'CUSTOMS_PROCESSING',
    'INSPECTION_REQUIRED',
    'BORDER_GATE_EXIT_CONFIRMED',
    'TRIP_COMPLETED',
    'DRIVER_NOTE_ADDED'
  ],
  CUSTOMS_PROCESSING: [
    'DECLARATION_APPROVED',
    'DECLARATION_REJECTED',
    'INSPECTION_REQUIRED',
    'INSPECTION_COMPLETED',
    'FEE_PAID',
    'BORDER_GATE_EXIT_CONFIRMED',
    'TRIP_COMPLETED',
    'DRIVER_NOTE_ADDED'
  ],
  INSPECTION_REQUIRED: [
    'INSPECTION_COMPLETED',
    'DECLARATION_APPROVED',
    'FEE_PAID',
    'BORDER_GATE_EXIT_CONFIRMED',
    'DRIVER_NOTE_ADDED',
    'TRIP_CANCELLED'
  ],
  BLOCKED: ['DRIVER_NOTE_ADDED', 'DECLARATION_APPROVED', 'TRIP_CANCELLED'],
  DELAYED: [
    'DRIVER_NOTE_ADDED',
    'ARRIVED_BORDER_AREA',
    'YARD_ENTRY_CONFIRMED',
    'YARD_EXIT_CONFIRMED',
    'BORDER_GATE_EXIT_CONFIRMED',
    'TRIP_CANCELLED'
  ],
  COMPLETED: [],
  CANCELLED: []
};

const priorityRank: Record<TripOperationalPriority, number> = {
  HIGH: 0,
  MEDIUM: 1,
  NORMAL: 2
};

@Injectable()
export class TripOperationsService {
  enrichTrip<T extends TripOperationInput>(trip: T, now = new Date()): TripWithOperationalState<T> {
    return {
      ...trip,
      operationalState: this.getOperationalState(trip, now)
    };
  }

  enrichTrips<T extends TripOperationInput>(
    trips: readonly T[],
    now = new Date()
  ): Array<TripWithOperationalState<T>> {
    return trips.map((trip) => this.enrichTrip(trip, now));
  }

  sortTripsForOperations<
    T extends TripOperationInput & { operationalState?: TripOperationalState }
  >(trips: readonly T[]): T[] {
    return [...trips].sort((firstTrip, secondTrip) => {
      const firstState = firstTrip.operationalState ?? this.getOperationalState(firstTrip);
      const secondState = secondTrip.operationalState ?? this.getOperationalState(secondTrip);
      const priorityDiff = priorityRank[firstState.priority] - priorityRank[secondState.priority];

      if (priorityDiff !== 0) {
        return priorityDiff;
      }

      const delayDiff = secondState.delayMinutes - firstState.delayMinutes;

      if (delayDiff !== 0) {
        return delayDiff;
      }

      return (
        this.toSortableTime(firstTrip.plannedArrivalAt) -
        this.toSortableTime(secondTrip.plannedArrivalAt)
      );
    });
  }

  matchesExceptionFilter(
    trip: TripOperationInput & { operationalState?: TripOperationalState },
    exception: TripExceptionFilter
  ): boolean {
    const state = trip.operationalState ?? this.getOperationalState(trip);

    if (exception === 'ATTENTION') {
      return state.priority !== 'NORMAL' || attentionStatuses.includes(trip.currentStatus);
    }

    if (exception === 'DELAYED') {
      return (
        state.delayMinutes > 0 ||
        state.exceptionCodes.includes('ARRIVAL_OVERDUE') ||
        state.exceptionCodes.includes('DELAYED_STATUS') ||
        state.exceptionCodes.includes('PLANNED_START_OVERDUE') ||
        state.exceptionCodes.includes('STATUS_STALE')
      );
    }

    if (exception === 'BLOCKED') {
      return state.exceptionCodes.includes('BLOCKED');
    }

    if (exception === 'STALE') {
      return (
        state.exceptionCodes.includes('PLANNED_START_OVERDUE') ||
        state.exceptionCodes.includes('STATUS_STALE')
      );
    }

    if (exception === 'INSPECTION') {
      return state.exceptionCodes.includes('INSPECTION_REQUIRED');
    }

    return state.exceptionCodes.includes('WAITING_YARD');
  }

  createDelaySummary(
    trips: ReadonlyArray<TripOperationInput & { operationalState?: TripOperationalState }>
  ): TripDelaySummary {
    const states = trips.map((trip) => trip.operationalState ?? this.getOperationalState(trip));
    const delayedStates = states.filter(
      (state) =>
        state.delayMinutes > 0 ||
        state.exceptionCodes.includes('ARRIVAL_OVERDUE') ||
        state.exceptionCodes.includes('DELAYED_STATUS') ||
        state.exceptionCodes.includes('PLANNED_START_OVERDUE') ||
        state.exceptionCodes.includes('STATUS_STALE')
    );
    const totalDelayMinutes = delayedStates.reduce((total, state) => total + state.delayMinutes, 0);
    const groups = this.countExceptionGroups(states);

    return {
      delayedTrips: delayedStates.length,
      blockedTrips: states.filter((state) => state.exceptionCodes.includes('BLOCKED')).length,
      staleTrips: states.filter(
        (state) =>
          state.exceptionCodes.includes('PLANNED_START_OVERDUE') ||
          state.exceptionCodes.includes('STATUS_STALE')
      ).length,
      averageDelayMinutes:
        delayedStates.length > 0 ? Math.round(totalDelayMinutes / delayedStates.length) : 0,
      longestDelayMinutes: delayedStates.reduce(
        (longestDelay, state) => Math.max(longestDelay, state.delayMinutes),
        0
      ),
      groups
    };
  }

  getOperationalState(trip: TripOperationInput, now = new Date()): TripOperationalState {
    const latestEvent = this.getLatestEvent(trip.events ?? []);
    const statusDurationMinutes = this.calculateElapsedMinutes(
      trip.currentStatusUpdatedAt ?? latestEvent?.occurredAt,
      now
    );
    const delayDetails = this.calculateDelayDetails(trip, statusDurationMinutes, now);
    const exceptionCodes = this.getExceptionCodes(trip, delayDetails);
    const priority = this.getPriority(
      trip.currentStatus,
      delayDetails.delayMinutes,
      exceptionCodes
    );
    const nextAction = this.getNextAction(
      trip.currentStatus,
      latestEvent?.eventType,
      exceptionCodes,
      delayDetails.delayMinutes
    );
    const state: TripOperationalState = {
      delayMinutes: delayDetails.delayMinutes,
      statusDurationMinutes,
      priority,
      exceptionCodes,
      nextAction,
      availableManualActions: this.getAvailableManualActions(trip.currentStatus, nextAction)
    };

    if (latestEvent) {
      state.latestEventType = latestEvent.eventType;
      state.latestEventOccurredAt = this.toIsoString(latestEvent.occurredAt);
    }

    return state;
  }

  private calculateDelayDetails(
    trip: TripOperationInput,
    statusDurationMinutes: number,
    now: Date
  ): DelayDetails {
    if (terminalStatuses.includes(trip.currentStatus)) {
      return {
        arrivalDelayMinutes: 0,
        plannedStartDelayMinutes: 0,
        statusDelayMinutes: 0,
        delayMinutes: 0
      };
    }

    const plannedArrivalAt = this.toDate(trip.plannedArrivalAt);
    const plannedStartAt = this.toDate(trip.plannedStartAt);
    const arrivalDelayMinutes = plannedArrivalAt
      ? Math.max(0, Math.floor((now.getTime() - plannedArrivalAt.getTime()) / 60000))
      : 0;
    const plannedStartDelayMinutes =
      trip.currentStatus === 'PLANNED' && plannedStartAt
        ? Math.max(0, Math.floor((now.getTime() - plannedStartAt.getTime()) / 60000) - 30)
        : 0;
    const statusThreshold = statusDelayThresholdMinutes[trip.currentStatus];
    const statusDelayMinutes =
      statusThreshold !== undefined ? Math.max(0, statusDurationMinutes - statusThreshold) : 0;

    return {
      arrivalDelayMinutes,
      plannedStartDelayMinutes,
      statusDelayMinutes,
      delayMinutes: Math.max(arrivalDelayMinutes, plannedStartDelayMinutes, statusDelayMinutes)
    };
  }

  private getExceptionCodes(
    trip: TripOperationInput,
    delayDetails: DelayDetails
  ): TripExceptionCode[] {
    const exceptionCodes = new Set<TripExceptionCode>();

    if (delayDetails.arrivalDelayMinutes > 0) {
      exceptionCodes.add('ARRIVAL_OVERDUE');
    }

    if (delayDetails.plannedStartDelayMinutes > 0) {
      exceptionCodes.add('PLANNED_START_OVERDUE');
    }

    if (delayDetails.statusDelayMinutes > 0) {
      exceptionCodes.add('STATUS_STALE');
    }

    if (trip.currentStatus === 'BLOCKED') {
      exceptionCodes.add('BLOCKED');
    }

    if (trip.currentStatus === 'DELAYED') {
      exceptionCodes.add('DELAYED_STATUS');
    }

    if (trip.currentStatus === 'INSPECTION_REQUIRED') {
      exceptionCodes.add('INSPECTION_REQUIRED');
    }

    if (trip.currentStatus === 'WAITING_YARD_ENTRY') {
      exceptionCodes.add('WAITING_YARD');
    }

    return [...exceptionCodes];
  }

  private getPriority(
    status: TripStatus,
    delayMinutes: number,
    exceptionCodes: readonly TripExceptionCode[]
  ): TripOperationalPriority {
    if (
      status === 'BLOCKED' ||
      status === 'DELAYED' ||
      delayMinutes >= 120 ||
      exceptionCodes.includes('ARRIVAL_OVERDUE')
    ) {
      return 'HIGH';
    }

    if (
      delayMinutes > 0 ||
      status === 'WAITING_YARD_ENTRY' ||
      status === 'INSPECTION_REQUIRED' ||
      exceptionCodes.length > 0
    ) {
      return 'MEDIUM';
    }

    return 'NORMAL';
  }

  private getNextAction(
    status: TripStatus,
    latestEventType: TripEventType | undefined,
    exceptionCodes: readonly TripExceptionCode[],
    delayMinutes: number
  ): TripOperationalNextAction {
    if (exceptionCodes.includes('BLOCKED')) {
      return this.nextAction(
        'RESOLVE_BLOCKER',
        'Xử lý điểm nghẽn',
        'Xác định nguyên nhân bị chặn, liên hệ đội hiện trường và chỉ ghi nhận mốc tiếp theo khi đã có xác nhận.',
        ['DRIVER_NOTE_ADDED', 'DECLARATION_APPROVED', 'TRIP_CANCELLED']
      );
    }

    if (delayMinutes >= 120 || exceptionCodes.includes('ARRIVAL_OVERDUE')) {
      return this.nextAction(
        'CHECK_DELAY',
        'Rà soát xe chậm',
        'Kiểm tra nguyên nhân chậm, liên hệ tài xế hoặc hiện trường và ghi nhận mốc vận hành mới nhất.',
        ['DRIVER_NOTE_ADDED', 'ARRIVED_BORDER_AREA', 'YARD_ENTRY_CONFIRMED']
      );
    }

    if (status === 'PLANNED') {
      return this.nextAction(
        'WAIT_DEPARTURE',
        'Chờ xe xuất phát',
        'Theo dõi kế hoạch xuất phát và ghi nhận mốc xe xuất phát khi tài xế bắt đầu chuyến.',
        ['DEPARTED']
      );
    }

    if (status === 'IN_PROGRESS') {
      return this.nextAction(
        'CONFIRM_BORDER_ARRIVAL',
        'Xác nhận đến khu vực cửa khẩu',
        'Theo dõi xe đến khu vực cửa khẩu, sau đó ghi nhận mốc đến nơi hoặc bắt đầu chờ vào bãi.',
        ['ARRIVED_BORDER_AREA', 'WAITING_YARD_ENTRY']
      );
    }

    if (status === 'WAITING_YARD_ENTRY') {
      return this.nextAction(
        'CONFIRM_YARD_ENTRY',
        'Xác nhận vào bãi',
        'Liên hệ bãi hoặc đội hiện trường để xác nhận xe được điều phối vào bãi.',
        ['YARD_ENTRY_CONFIRMED', 'DRIVER_REPORTED_YARD_ENTRY']
      );
    }

    if (status === 'IN_YARD') {
      return this.nextAction(
        'CONFIRM_YARD_EXIT',
        'Xác nhận rời bãi',
        'Theo dõi điều kiện rời bãi và ghi nhận mốc xe rời bãi khi đã có xác nhận.',
        ['YARD_EXIT_CONFIRMED']
      );
    }

    if (status === 'AT_BORDER_GATE') {
      if (
        latestEventType === 'YARD_EXIT_CONFIRMED' ||
        latestEventType === 'BORDER_GATE_ENTRY_CONFIRMED'
      ) {
        return this.nextAction(
          'SUBMIT_DECLARATION',
          'Cập nhật tờ khai',
          'Đối chiếu chứng từ, ghi nhận tờ khai hoặc chuyển sang xử lý hải quan khi hồ sơ đã sẵn sàng.',
          ['DECLARATION_SUBMITTED', 'CUSTOMS_PROCESSING']
        );
      }

      return this.nextAction(
        'REQUEST_YARD_ENTRY',
        'Điều phối bãi hoặc cửa khẩu',
        'Xác nhận xe đang chờ bãi, vào cửa khẩu hoặc đủ điều kiện đi tiếp theo luồng vận hành.',
        ['WAITING_YARD_ENTRY', 'BORDER_GATE_ENTRY_CONFIRMED']
      );
    }

    if (status === 'CUSTOMS_PROCESSING') {
      if (latestEventType === 'INSPECTION_COMPLETED') {
        return this.nextAction(
          'PAY_FEE',
          'Hoàn tất phí và xác nhận ra cửa khẩu',
          'Cập nhật phí, kiểm tra hồ sơ và ghi nhận mốc rời cửa khẩu khi chuyến đã đủ điều kiện.',
          ['FEE_PAID', 'BORDER_GATE_EXIT_CONFIRMED', 'TRIP_COMPLETED']
        );
      }

      return this.nextAction(
        'PROCESS_CUSTOMS',
        'Theo dõi xử lý hải quan',
        'Đối chiếu trạng thái tờ khai, cập nhật duyệt/từ chối hoặc yêu cầu kiểm hóa nếu phát sinh.',
        ['DECLARATION_APPROVED', 'DECLARATION_REJECTED', 'INSPECTION_REQUIRED']
      );
    }

    if (status === 'INSPECTION_REQUIRED') {
      return this.nextAction(
        'COMPLETE_INSPECTION',
        'Hoàn tất kiểm hóa',
        'Phối hợp chứng từ và hiện trường để cập nhật kết quả kiểm hóa, sau đó tiếp tục luồng hải quan.',
        ['INSPECTION_COMPLETED', 'DECLARATION_APPROVED']
      );
    }

    if (status === 'DELAYED') {
      return this.nextAction(
        'CHECK_DELAY',
        'Rà soát xe chậm',
        'Ưu tiên xác nhận vị trí, nguyên nhân chậm và ghi nhận sự kiện mới nhất để khôi phục timeline.',
        ['DRIVER_NOTE_ADDED', 'ARRIVED_BORDER_AREA', 'YARD_ENTRY_CONFIRMED']
      );
    }

    if (status === 'COMPLETED') {
      return this.nextAction(
        'REVIEW_COMPLETED',
        'Rà soát sau hoàn tất',
        'Chuyến đã hoàn tất; chỉ cập nhật nếu cần bổ sung ghi chú hoặc xử lý hiệu chỉnh theo quy trình.',
        []
      );
    }

    return this.nextAction(
      'REVIEW_CANCELLED',
      'Rà soát chuyến đã hủy',
      'Chuyến đã hủy; không ghi nhận mốc vận hành thường lệ ngoài các hiệu chỉnh được phân quyền.',
      []
    );
  }

  private getAvailableManualActions(
    status: TripStatus,
    nextAction: TripOperationalNextAction
  ): TripEventType[] {
    return [...new Set([...nextAction.suggestedEventTypes, ...manualActionsByStatus[status]])];
  }

  private nextAction(
    code: TripNextActionCode,
    label: string,
    description: string,
    suggestedEventTypes: TripEventType[]
  ): TripOperationalNextAction {
    return {
      code,
      label,
      description,
      suggestedEventTypes
    };
  }

  private getLatestEvent(events: readonly TripOperationEventInput[]) {
    return [...events].sort((firstEvent, secondEvent) => {
      const occurredDiff =
        this.toSortableTime(secondEvent.occurredAt) - this.toSortableTime(firstEvent.occurredAt);

      if (occurredDiff !== 0) {
        return occurredDiff;
      }

      return (
        this.toSortableTime(secondEvent.recordedAt) - this.toSortableTime(firstEvent.recordedAt)
      );
    })[0];
  }

  private countExceptionGroups(states: readonly TripOperationalState[]) {
    const counts = new Map<TripExceptionCode, number>();

    states.forEach((state) => {
      state.exceptionCodes.forEach((code) => {
        counts.set(code, (counts.get(code) ?? 0) + 1);
      });
    });

    return [...counts.entries()]
      .map(([key, count]) => ({ key, count }))
      .sort((firstGroup, secondGroup) => secondGroup.count - firstGroup.count);
  }

  private calculateElapsedMinutes(value: Date | string | null | undefined, now: Date) {
    const date = this.toDate(value);

    if (!date) {
      return 0;
    }

    return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 60000));
  }

  private toSortableTime(value: Date | string | null | undefined) {
    return this.toDate(value)?.getTime() ?? Number.MAX_SAFE_INTEGER;
  }

  private toIsoString(value: Date | string) {
    return this.toDate(value)?.toISOString() ?? new Date(0).toISOString();
  }

  private toDate(value: Date | string | null | undefined) {
    if (!value) {
      return undefined;
    }

    const date = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(date.getTime())) {
      return undefined;
    }

    return date;
  }
}
