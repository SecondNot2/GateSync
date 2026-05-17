/**
 * Vietnamese labels for the user-facing notification preferences matrix.
 *
 * The admin rules editor maintains its own `labels.ts`, but reusing its
 * exports from a non-admin route would cross a feature boundary; we keep
 * the user-facing copy colocated with the form that renders it.
 */

import type { NotificationChannel } from '@gatesync/shared';
import type { NotificationEventType } from '@gatesync/shared';

/**
 * Channels exposed to users in the preferences matrix.
 *
 * Matches the API's `PREFERENCE_CHANNELS` (server-side `WEBHOOK` is
 * excluded — webhooks are integration-level, not user-facing).
 *
 * The task wording allows skipping `WEB_PUSH` for now since it is not yet
 * wired in MVP, but the schema supports it; we include it so users can
 * pre-configure their preference and have it honoured the moment push
 * delivery ships.
 */
export const PREFERENCE_CHANNEL_ORDER: readonly NotificationChannel[] = [
  'IN_APP',
  'WEB_PUSH',
  'EMAIL',
  'ZALO_OA',
  'SMS'
] as const;

export const preferenceEventTypeLabels: Record<NotificationEventType, string> = {
  trip_status_changed: 'Trạng thái chuyến đổi',
  vehicle_arrived_gate: 'Xe đã đến cửa khẩu',
  vehicle_left_gate: 'Xe đã rời cửa khẩu',
  declaration_rejected: 'Tờ khai bị từ chối',
  fee_pending: 'Có phí chờ thanh toán',
  delay_threshold_exceeded: 'Trễ ngưỡng cho phép',
  sync_run_failed: 'Đồng bộ tích hợp thất bại'
};

export const preferenceEventTypeDescriptions: Record<NotificationEventType, string> = {
  trip_status_changed: 'Khi trạng thái tổng thể của chuyến hàng thay đổi.',
  vehicle_arrived_gate: 'Khi xe ghi nhận đến khu vực cửa khẩu hoặc bãi.',
  vehicle_left_gate: 'Khi xe rời cửa khẩu, bãi hoặc được giải phóng khỏi khu vực kiểm soát.',
  declaration_rejected: 'Khi tờ khai hải quan bị từ chối hoặc cần điều chỉnh.',
  fee_pending: 'Khi chuyến hàng có phí chờ thanh toán cần xử lý.',
  delay_threshold_exceeded: 'Khi chuyến hàng vượt ngưỡng trễ cho phép.',
  sync_run_failed: 'Khi một lần đồng bộ tích hợp thất bại (chỉ dành cho quản trị viên).'
};

export const preferenceChannelLabels: Record<NotificationChannel, string> = {
  IN_APP: 'Trong ứng dụng',
  WEB_PUSH: 'Web Push',
  EMAIL: 'Email',
  ZALO_OA: 'Zalo OA',
  SMS: 'Tin nhắn SMS',
  WEBHOOK: 'Webhook'
};

export const preferenceChannelShortLabels: Record<NotificationChannel, string> = {
  IN_APP: 'Ứng dụng',
  WEB_PUSH: 'Web Push',
  EMAIL: 'Email',
  ZALO_OA: 'Zalo',
  SMS: 'SMS',
  WEBHOOK: 'Webhook'
};
