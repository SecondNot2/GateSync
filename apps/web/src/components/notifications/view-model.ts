/**
 * View-model layer for notifications (task 15.5, requirements 11.4 / 15.1).
 *
 * Decouples the notification panel UI from the backend API schema by mapping
 * `ApiNotification` rows into a UI-ready `NotificationViewModel` shape.
 *
 * Per Requirement 11.4, the backend never sends raw external payloads across
 * the realtime / API boundary — the orchestrator pre-renders Vietnamese
 * `title` and `body` strings (see `NOTIFICATION_TITLES` in
 * `apps/api/src/modules/notifications/orchestrator/notification-orchestrator.service.ts`)
 * and persists only those plus the safe `eventType`, `tripEventType`, `kind`,
 * and `occurredAt` keys. This mapper deliberately reads only those whitelisted
 * fields plus the top-level `Notification` row's safe columns (`id`, `tripId`,
 * `channel`, `status`, `createdAt`, `readAt`, `failureReason`). It never
 * touches anything that could leak provider-specific data such as
 * `rawProviderId`, integration credentials, declaration numbers, or driver
 * contact details.
 *
 * Per Requirement 15.1, the panel renders Vietnamese copy for each event
 * type. The backend orchestrator already pre-renders `payload.title` /
 * `payload.body`; if either is missing this mapper falls back to a stable
 * Vietnamese default keyed by `eventType` so the UI never shows an empty
 * cell.
 */

import type { NotificationEventType } from '@gatesync/shared';

import type { ApiNotification } from '@/lib/api/types';

/**
 * Vietnamese titles for the notification eventType allowlist. Mirrors the
 * backend's `NOTIFICATION_TITLES` map exactly so the inbox renders identical
 * copy regardless of which path (realtime broadcast vs. REST list) populated
 * the row.
 */
export const NOTIFICATION_TITLES: Readonly<Record<NotificationEventType, string>> = {
  trip_status_changed: 'Trạng thái chuyến đổi',
  vehicle_arrived_gate: 'Đã đến cửa khẩu',
  vehicle_left_gate: 'Đã rời cửa khẩu',
  declaration_rejected: 'Tờ khai bị từ chối',
  fee_pending: 'Có phí chờ thanh toán',
  delay_threshold_exceeded: 'Trễ ngưỡng cho phép',
  sync_run_failed: 'Đồng bộ tích hợp thất bại'
};

/**
 * Default Vietnamese body text per event type. Used only as a last-resort
 * fallback when neither `payload.body` nor `payload.message` is present
 * (older rows written before the orchestrator unified on `payload.body`,
 * or rows that originated outside the orchestrator path).
 */
const NOTIFICATION_DEFAULT_BODIES: Readonly<Record<NotificationEventType, string>> = {
  trip_status_changed: 'Trạng thái của chuyến đã thay đổi.',
  vehicle_arrived_gate: 'Phương tiện đã đến cửa khẩu.',
  vehicle_left_gate: 'Phương tiện đã rời cửa khẩu.',
  declaration_rejected: 'Tờ khai hải quan đã bị từ chối.',
  fee_pending: 'Có khoản phí đang chờ thanh toán.',
  delay_threshold_exceeded: 'Chuyến đã trễ vượt ngưỡng cho phép.',
  sync_run_failed: 'Đồng bộ dữ liệu tích hợp thất bại.'
};

/**
 * UI-facing channel set. Subset of the Prisma `NotificationChannel` enum that
 * the inbox renders (we deliberately omit `WEBHOOK` since admin-only webhook
 * deliveries are not surfaced in the user inbox).
 */
export type NotificationViewModelChannel = 'IN_APP' | 'WEB_PUSH' | 'ZALO_OA' | 'SMS' | 'EMAIL';

/**
 * Full lifecycle status surface. Includes `PENDING_IN_APP` (offline fallback,
 * see Requirement 8.4) and `HIDDEN` (user-dismissed, see Requirement 12.4)
 * which the backend persists but the legacy `ApiNotificationStatus` type does
 * not yet enumerate. The mapper normalises any unknown string to `PENDING`.
 */
export type NotificationViewModelStatus =
  | 'PENDING'
  | 'PENDING_IN_APP'
  | 'SENT'
  | 'READ'
  | 'HIDDEN'
  | 'FAILED';

/**
 * UI-shaped notification row. Built once per `ApiNotification` and consumed
 * by the notification center / toast components without further reshaping.
 *
 * Field set is intentionally narrow: only the columns the UI actually
 * displays. `createdAt` and `readAt` are passed through as ISO-8601 strings
 * (the same shape the API returns) so consumers can hand them to date
 * formatters without a Date round-trip.
 */
export interface NotificationViewModel {
  id: string;
  eventType: NotificationEventType;
  /** Vietnamese title — pre-rendered by the backend or derived from `eventType`. */
  title: string;
  /** Vietnamese body — pre-rendered by the backend or per-eventType default. */
  body: string;
  /** Optional trip association — drives the "Mở chuyến" deep link. */
  tripId?: string;
  channel: NotificationViewModelChannel;
  status: NotificationViewModelStatus;
  /** ISO-8601 string from the API. */
  createdAt: string;
  /** ISO-8601 string when the recipient marked the row read. */
  readAt?: string;
  /**
   * Sanitized failure reason, only populated when `status === 'FAILED'`.
   * Already scrubbed by the backend (Requirement 9.5 / 11.4); the mapper
   * passes it through verbatim.
   */
  failureReason?: string;
}

const VIEW_MODEL_CHANNELS: ReadonlySet<NotificationViewModelChannel> = new Set([
  'IN_APP',
  'WEB_PUSH',
  'ZALO_OA',
  'SMS',
  'EMAIL'
]);

const VIEW_MODEL_STATUSES: ReadonlySet<NotificationViewModelStatus> = new Set([
  'PENDING',
  'PENDING_IN_APP',
  'SENT',
  'READ',
  'HIDDEN',
  'FAILED'
]);

const NOTIFICATION_EVENT_TYPE_KEYS: ReadonlySet<NotificationEventType> = new Set(
  Object.keys(NOTIFICATION_TITLES) as NotificationEventType[]
);

/**
 * `ApiNotification` plus the optional `failureReason` column the backend
 * exposes on FAILED rows. The shared `ApiNotification` type does not yet
 * enumerate this field; we widen here rather than in `lib/api/types.ts`
 * because task 15.5 is scoped to `components/notifications/`.
 */
type ApiNotificationWithFailure = ApiNotification & {
  failureReason?: string | null;
};

/**
 * Maps a single API row into the UI shape. Pure and stateless — safe to call
 * inside `useMemo` / TanStack Query `select`.
 */
export function toNotificationViewModel(apiRow: ApiNotification): NotificationViewModel {
  const row = apiRow as ApiNotificationWithFailure;
  const payload = readSafePayload(row.payload);
  const eventType = resolveEventType(payload);
  const title = resolveTitle(payload, eventType);
  const body = resolveBody(payload, eventType);
  const channel = normalizeChannel(row.channel);
  const status = normalizeStatus(row.status);
  const failureReason = resolveFailureReason(row, status);

  return {
    id: row.id,
    eventType,
    title,
    body,
    ...(row.tripId ? { tripId: row.tripId } : {}),
    channel,
    status,
    createdAt: row.createdAt,
    ...(row.readAt ? { readAt: row.readAt } : {}),
    ...(failureReason ? { failureReason } : {})
  };
}

/**
 * Convenience: maps a list of API rows. Order is preserved.
 */
export function toNotificationViewModelList(
  list: readonly ApiNotification[]
): NotificationViewModel[] {
  return list.map(toNotificationViewModel);
}

/**
 * Reads only the safe subset of payload keys the backend orchestrator
 * persists. Returns an empty object for any non-object payload (`null`,
 * arrays, primitives) so downstream code can rely on plain property access.
 *
 * The orchestrator-persisted payload (see `notification-orchestrator.service.ts`,
 * `insertNotificationRow`) writes the keys read here. We deliberately avoid
 * reading anything else (no `rawProviderId`, no contact details, no
 * declaration numbers) per Requirement 11.4.
 */
interface SafePayload {
  eventType?: NotificationEventType;
  title?: string;
  body?: string;
  message?: string;
}

function readSafePayload(raw: ApiNotification['payload']): SafePayload {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }

  const candidate = raw as Record<string, unknown>;
  const safe: SafePayload = {};

  if (typeof candidate.eventType === 'string' && isNotificationEventType(candidate.eventType)) {
    safe.eventType = candidate.eventType;
  }

  if (typeof candidate.title === 'string') {
    safe.title = candidate.title;
  }

  // The backend orchestrator stores the rendered body under `body`. The
  // legacy `message` key is retained as a fallback for older rows that
  // were written before the orchestrator unified on `body`.
  if (typeof candidate.body === 'string') {
    safe.body = candidate.body;
  } else if (typeof candidate.message === 'string') {
    safe.message = candidate.message;
  }

  return safe;
}

function isNotificationEventType(value: string): value is NotificationEventType {
  return NOTIFICATION_EVENT_TYPE_KEYS.has(value as NotificationEventType);
}

function resolveEventType(payload: SafePayload): NotificationEventType {
  return payload.eventType ?? 'trip_status_changed';
}

function resolveTitle(payload: SafePayload, eventType: NotificationEventType): string {
  if (payload.title && payload.title.trim().length > 0) {
    return payload.title;
  }

  return NOTIFICATION_TITLES[eventType];
}

function resolveBody(payload: SafePayload, eventType: NotificationEventType): string {
  if (payload.body && payload.body.trim().length > 0) {
    return payload.body;
  }

  if (payload.message && payload.message.trim().length > 0) {
    return payload.message;
  }

  return NOTIFICATION_DEFAULT_BODIES[eventType];
}

function normalizeChannel(channel: ApiNotification['channel']): NotificationViewModelChannel {
  if (VIEW_MODEL_CHANNELS.has(channel as NotificationViewModelChannel)) {
    return channel as NotificationViewModelChannel;
  }

  // `WEBHOOK` (and any future enum addition) is not user-facing — surface it
  // as `IN_APP` so the inbox does not crash, while the admin webhook log
  // remains the source of truth for those rows.
  return 'IN_APP';
}

function normalizeStatus(status: ApiNotification['status']): NotificationViewModelStatus {
  if (VIEW_MODEL_STATUSES.has(status as NotificationViewModelStatus)) {
    return status as NotificationViewModelStatus;
  }

  return 'PENDING';
}

/**
 * Returns the sanitized failure reason for FAILED rows only. The backend
 * scrubs sensitive substrings before persisting (see
 * `external-channel-dispatcher.service.ts#sanitizeFailureReason`) so the
 * mapper passes the value through unchanged. Non-FAILED rows are coerced
 * to `undefined` so the UI never surfaces stale reasons after a retry.
 */
function resolveFailureReason(
  row: ApiNotificationWithFailure,
  status: NotificationViewModelStatus
): string | undefined {
  if (status !== 'FAILED') {
    return undefined;
  }

  if (typeof row.failureReason === 'string' && row.failureReason.trim().length > 0) {
    return row.failureReason;
  }

  // `errorMessage` is the legacy column kept on the Notification model. The
  // orchestrator no longer writes to it directly, but older rows may carry
  // a value there; surface it as a last resort so the UI does not show an
  // empty failure cell.
  if (typeof row.errorMessage === 'string' && row.errorMessage.trim().length > 0) {
    return row.errorMessage;
  }

  return undefined;
}
