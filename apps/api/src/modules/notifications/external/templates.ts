/**
 * Vietnamese-friendly template registry for external channels.
 *
 * Templates are deliberately stored as constant tables (one per channel) so
 * adapters stay stateless and pure. Each template is a plain string with
 * `{placeholder}` tokens that {@link renderTemplate} substitutes from a
 * context object built by the caller.
 *
 * Cross-ref: design.md sections "External Channel Dispatcher" (template
 * loading) and "Sensitive field policy" — rendered output is always passed
 * through `defaultSensitiveScrubber.scrubString` before being handed to the
 * provider, so templates themselves MUST NOT reference sensitive raw fields
 * (driver CMND/CCCD, plate numbers, declaration numbers). They reference
 * already-rendered, scrubbed `title`/`body` from the orchestrator instead.
 *
 * Validates: Requirements 9.1, 9.5, 11.4
 */

/** Channel identifier used to pick a template table. */
export type TemplateChannel = 'zalo' | 'sms' | 'email';

/** Shape of a single template. `bodyText` is required; `subject` is optional. */
export interface ExternalChannelTemplate {
  /** Email subject line / Zalo / SMS title. Optional for SMS where it is unused. */
  readonly subject?: string;
  /** Body text containing `{placeholder}` tokens. */
  readonly bodyText: string;
}

/**
 * Default fallback template used when an `eventType` has no entry in the
 * channel-specific table. Keeps adapters resilient when a new
 * `NotificationEventType` is added before its templates are wired up.
 */
const DEFAULT_TEMPLATE: ExternalChannelTemplate = {
  subject: 'GateSync: {title}',
  bodyText: '{title}\n\n{body}\n\nMã chuyến: {tripId}\nThời điểm: {occurredAt}'
};

/** Zalo OA templates. Plain text — Zalo OA renders structured cards upstream. */
const ZALO_TEMPLATES: Readonly<Record<string, ExternalChannelTemplate>> = {
  trip_status_changed: {
    subject: 'Cập nhật trạng thái chuyến',
    bodyText: '{title}\n{body}\nMã chuyến: {tripId}\nThời điểm: {occurredAt}'
  },
  vehicle_arrived_gate: {
    subject: 'Xe đến cửa khẩu',
    bodyText: 'Xe đã đến cửa khẩu.\n{body}\nMã chuyến: {tripId}\nThời điểm: {occurredAt}'
  },
  vehicle_left_gate: {
    subject: 'Xe rời cửa khẩu',
    bodyText: 'Xe đã rời cửa khẩu.\n{body}\nMã chuyến: {tripId}\nThời điểm: {occurredAt}'
  },
  declaration_rejected: {
    subject: 'Tờ khai bị từ chối',
    bodyText: 'Tờ khai bị từ chối.\n{body}\nMã chuyến: {tripId}\nThời điểm: {occurredAt}'
  },
  fee_pending: {
    subject: 'Chờ thanh toán phí',
    bodyText: 'Có phí chờ thanh toán.\n{body}\nMã chuyến: {tripId}\nThời điểm: {occurredAt}'
  },
  delay_threshold_exceeded: {
    subject: 'Cảnh báo trễ chuyến',
    bodyText: 'Chuyến có dấu hiệu trễ.\n{body}\nMã chuyến: {tripId}\nThời điểm: {occurredAt}'
  }
};

/** SMS templates — short, no subject, single-line body. */
const SMS_TEMPLATES: Readonly<Record<string, ExternalChannelTemplate>> = {
  trip_status_changed: {
    bodyText: 'GateSync: Trạng thái chuyến {tripId} đã đổi. {body} ({occurredAt})'
  },
  vehicle_arrived_gate: {
    bodyText: 'GateSync: Xe đã đến cửa khẩu (chuyến {tripId}). {body} ({occurredAt})'
  },
  vehicle_left_gate: {
    bodyText: 'GateSync: Xe đã rời cửa khẩu (chuyến {tripId}). {body} ({occurredAt})'
  },
  declaration_rejected: {
    bodyText: 'GateSync: Tờ khai bị từ chối (chuyến {tripId}). {body} ({occurredAt})'
  },
  fee_pending: {
    bodyText: 'GateSync: Có phí chờ thanh toán (chuyến {tripId}). {body} ({occurredAt})'
  },
  delay_threshold_exceeded: {
    bodyText: 'GateSync: Chuyến {tripId} có dấu hiệu trễ. {body} ({occurredAt})'
  }
};

/** Email templates — subject + multi-line body. */
const EMAIL_TEMPLATES: Readonly<Record<string, ExternalChannelTemplate>> = {
  trip_status_changed: {
    subject: '[GateSync] Cập nhật trạng thái chuyến {tripId}',
    bodyText:
      'Xin chào,\n\n{title}\n\n{body}\n\nMã chuyến: {tripId}\nThời điểm: {occurredAt}\n\n— GateSync'
  },
  vehicle_arrived_gate: {
    subject: '[GateSync] Xe đã đến cửa khẩu (chuyến {tripId})',
    bodyText:
      'Xin chào,\n\nXe đã đến cửa khẩu.\n\n{body}\n\nMã chuyến: {tripId}\nThời điểm: {occurredAt}\n\n— GateSync'
  },
  vehicle_left_gate: {
    subject: '[GateSync] Xe đã rời cửa khẩu (chuyến {tripId})',
    bodyText:
      'Xin chào,\n\nXe đã rời cửa khẩu.\n\n{body}\n\nMã chuyến: {tripId}\nThời điểm: {occurredAt}\n\n— GateSync'
  },
  declaration_rejected: {
    subject: '[GateSync] Tờ khai bị từ chối (chuyến {tripId})',
    bodyText:
      'Xin chào,\n\nTờ khai bị từ chối.\n\n{body}\n\nMã chuyến: {tripId}\nThời điểm: {occurredAt}\n\n— GateSync'
  },
  fee_pending: {
    subject: '[GateSync] Có phí chờ thanh toán (chuyến {tripId})',
    bodyText:
      'Xin chào,\n\nCó phí chờ thanh toán.\n\n{body}\n\nMã chuyến: {tripId}\nThời điểm: {occurredAt}\n\n— GateSync'
  },
  delay_threshold_exceeded: {
    subject: '[GateSync] Cảnh báo trễ chuyến {tripId}',
    bodyText:
      'Xin chào,\n\nChuyến có dấu hiệu trễ so với kế hoạch.\n\n{body}\n\nMã chuyến: {tripId}\nThời điểm: {occurredAt}\n\n— GateSync'
  }
};

const TEMPLATE_TABLES: Readonly<
  Record<TemplateChannel, Readonly<Record<string, ExternalChannelTemplate>>>
> = {
  zalo: ZALO_TEMPLATES,
  sms: SMS_TEMPLATES,
  email: EMAIL_TEMPLATES
};

/**
 * Look up a template for the given channel/eventType pair, falling back to
 * a generic template when the eventType is not yet wired up.
 */
export function getTemplate(channel: TemplateChannel, eventType: string): ExternalChannelTemplate {
  return TEMPLATE_TABLES[channel][eventType] ?? DEFAULT_TEMPLATE;
}

/**
 * Render a `{placeholder}` template against a context map.
 *
 * - Unknown placeholders are replaced with an empty string so the rendered
 *   output never leaks the raw `{key}` token to recipients.
 * - The function is total and pure; it does not mutate `context`.
 */
export function renderTemplate(template: string, context: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => {
    const value = context[key];
    return typeof value === 'string' ? value : '';
  });
}
