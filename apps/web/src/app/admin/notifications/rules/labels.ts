/**
 * Vietnamese UI labels for `NotificationRule` admin forms.
 *
 * Sourced from design §"Filter eventType vs allowlist" and the task brief.
 * Kept colocated with the editor pages so Vietnamese copy stays close to the
 * forms that render it (the broader `ui-labels.ts` covers domain enums shared
 * across the app, while these labels are admin-specific).
 */

import {
  NOTIFICATION_RULE_CHANNELS,
  NOTIFICATION_RULE_RECIPIENT_SCOPES,
  type NotificationEventType,
  type NotificationRuleChannel,
  type NotificationRuleRecipientScope
} from '@gatesync/shared';

export const notificationEventTypeLabels: Record<NotificationEventType, string> = {
  trip_status_changed: 'Trạng thái chuyến đổi',
  vehicle_arrived_gate: 'Xe đã đến cửa khẩu',
  vehicle_left_gate: 'Xe đã rời cửa khẩu',
  declaration_rejected: 'Tờ khai bị từ chối',
  fee_pending: 'Có phí chờ thanh toán',
  delay_threshold_exceeded: 'Trễ ngưỡng cho phép',
  sync_run_failed: 'Đồng bộ tích hợp thất bại'
};

export const notificationChannelLabels: Record<NotificationRuleChannel, string> = {
  IN_APP: 'Trong ứng dụng',
  WEB_PUSH: 'Web Push',
  ZALO_OA: 'Zalo OA',
  SMS: 'Tin nhắn SMS',
  EMAIL: 'Email',
  WEBHOOK: 'Webhook'
};

export const notificationRecipientScopeLabels: Record<NotificationRuleRecipientScope, string> = {
  trip_participants: 'Thành viên tham gia chuyến',
  organization_admins: 'Quản trị viên tổ chức',
  organization_operators: 'Nhân sự điều phối tổ chức',
  assigned_driver: 'Tài xế được phân công',
  custom_user_list: 'Danh sách người dùng tùy chỉnh'
};

export const notificationChannelOptions = NOTIFICATION_RULE_CHANNELS.map((channel) => ({
  value: channel,
  label: notificationChannelLabels[channel]
}));

export const notificationRecipientScopeOptions = NOTIFICATION_RULE_RECIPIENT_SCOPES.map(
  (scope) => ({ value: scope, label: notificationRecipientScopeLabels[scope] })
);
