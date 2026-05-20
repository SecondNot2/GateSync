/**
 * Shared Zod schema for `NotificationRule` writes.
 *
 * The schema is the single source of truth used by:
 * - Backend `NotificationRulesService` for cross-field validation (in
 *   particular the `custom_user_list` refine that enforces a non-empty
 *   `customUserIds` when `recipientScope === 'custom_user_list'`).
 * - Frontend `NotificationRuleEditor` (React Hook Form + zodResolver) so the
 *   client and server validate against the exact same constraints.
 *
 * Design references: Property 19, Requirements 6.1, 6.2, 6.3, 6.4, 6.5.
 */

import { z } from 'zod';
import { NOTIFICATION_EVENT_TYPES, type NotificationEventType } from './event-types.js';

/**
 * Channels exposed to admins when authoring a `NotificationRule`.
 *
 * Mirrors the Prisma `NotificationChannel` enum. We intentionally keep the
 * ordering stable so generated UI dropdowns are deterministic across
 * deployments.
 */
export const NOTIFICATION_RULE_CHANNELS = [
  'IN_APP',
  'WEB_PUSH',
  'ZALO_OA',
  'SMS',
  'EMAIL',
  'WEBHOOK'
] as const;

export type NotificationRuleChannel = (typeof NOTIFICATION_RULE_CHANNELS)[number];

/**
 * Recipient scopes supported by the orchestrator's `RecipientResolver`.
 *
 * Sourced from design §"Resolve recipients per rule" and Requirement 6.3.
 */
export const NOTIFICATION_RULE_RECIPIENT_SCOPES = [
  'trip_participants',
  'organization_admins',
  'organization_operators',
  'assigned_driver',
  'custom_user_list'
] as const;

export type NotificationRuleRecipientScope = (typeof NOTIFICATION_RULE_RECIPIENT_SCOPES)[number];

const eventTypeValues = NOTIFICATION_EVENT_TYPES as readonly NotificationEventType[];

/**
 * Internal base shape — kept separate so we can derive both the strict create
 * schema (with refine) and the partial update schema (without refine
 * interactions on absent fields) without duplicating field declarations.
 */
const notificationRuleBase = z.object({
  /**
   * Human-readable rule name shown in admin UI. Trimmed before validation so
   * a payload of `'   '` is treated as missing.
   */
  name: z
    .string()
    .trim()
    .min(1, 'name không được để trống')
    .max(200, 'name không được vượt quá 200 ký tự'),
  /**
   * Notification eventType. Must belong to the orchestrator allowlist.
   * The `as` cast widens the readonly tuple type for `z.enum`.
   */
  eventType: z.enum(
    eventTypeValues as readonly [NotificationEventType, ...NotificationEventType[]]
  ),
  /**
   * One or more delivery channels. We require at least one channel because a
   * rule with zero channels would never produce a `Notification_Delivery`
   * row, which is almost certainly an authoring mistake.
   */
  channels: z
    .array(
      z.enum(
        NOTIFICATION_RULE_CHANNELS as readonly [
          NotificationRuleChannel,
          ...NotificationRuleChannel[]
        ]
      )
    )
    .min(1, 'channels phải có ít nhất một kênh'),
  recipientScope: z.enum(
    NOTIFICATION_RULE_RECIPIENT_SCOPES as readonly [
      NotificationRuleRecipientScope,
      ...NotificationRuleRecipientScope[]
    ]
  ),
  /**
   * Custom user IDs referenced when `recipientScope === 'custom_user_list'`.
   * Must be UUIDs; cross-organization membership is enforced by the service
   * (Requirement 6.4 / 7.7) since the shared schema cannot reach the DB.
   */
  customUserIds: z.array(z.string().uuid()).default([]),
  mandatory: z.boolean().default(false),
  enabled: z.boolean().default(true)
});

/**
 * Cross-field invariant shared by create and update validation.
 *
 * When `recipientScope === 'custom_user_list'`, `customUserIds` must contain
 * at least one user id (Property 19, Requirement 6.5). Membership scope
 * (every user belongs to the rule's organization) is enforced server-side by
 * `NotificationRulesService` because it requires DB access.
 */
function customUserListRefine(data: {
  recipientScope?: NotificationRuleRecipientScope | undefined;
  customUserIds?: readonly string[] | undefined;
}): boolean {
  if (data.recipientScope !== 'custom_user_list') {
    return true;
  }
  return Array.isArray(data.customUserIds) && data.customUserIds.length > 0;
}

const customUserListRefineMessage: { message: string; path: (string | number)[] } = {
  message:
    'customUserIds phải có ít nhất một userId khi recipientScope = "custom_user_list" (Requirement 6.5).',
  path: ['customUserIds']
};

/**
 * Strict schema for `NotificationRule` writes (create or full-replace update).
 *
 * Values returned by `.parse()` apply the documented defaults
 * (`customUserIds = []`, `mandatory = false`, `enabled = true`).
 */
export const notificationRuleSchema = notificationRuleBase.refine(
  customUserListRefine,
  customUserListRefineMessage
);

export type NotificationRuleInput = z.input<typeof notificationRuleSchema>;
export type NotificationRuleParsed = z.output<typeof notificationRuleSchema>;

/**
 * Partial schema for PATCH updates.
 *
 * The same `custom_user_list` refine still holds: if the PATCH sets
 * `recipientScope = 'custom_user_list'`, then `customUserIds` must also be
 * provided in the same payload and must be non-empty. Updates that omit
 * `recipientScope` skip the refine because there is nothing to validate.
 */
export const notificationRuleUpdateSchema = notificationRuleBase.partial().refine((data) => {
  if (data.recipientScope === undefined) {
    return true;
  }
  return customUserListRefine(data);
}, customUserListRefineMessage);

export type NotificationRuleUpdateInput = z.input<typeof notificationRuleUpdateSchema>;
export type NotificationRuleUpdateParsed = z.output<typeof notificationRuleUpdateSchema>;
