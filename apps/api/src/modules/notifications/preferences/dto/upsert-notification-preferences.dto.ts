import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { z } from 'zod';
import { NOTIFICATION_EVENT_TYPES } from '@gatesync/shared';
import {
  notificationPreferenceItemSchema,
  NotificationPreferenceItemDto,
  PREFERENCE_CHANNELS
} from './notification-preference-item.dto';

/**
 * Maximum number of preference rows accepted in a single PUT.
 *
 * Bounded by the full Cartesian product of `eventType × channel` so a
 * client can send the entire matrix in one round-trip without abusing the
 * endpoint as a generic bulk-write surface.
 */
const MAX_PREFERENCES = NOTIFICATION_EVENT_TYPES.length * PREFERENCE_CHANNELS.length;

/**
 * Zod schema for the bulk-upsert payload.
 *
 * Authorization-relevant rules:
 * - The body is allowed to optionally include a `userId`, but the service
 *   MUST reject any value that does not match the resolved request user
 *   (Requirement 10.4). This prevents a user from "addressing" preferences
 *   to someone else even by accident.
 * - `organizationId` is taken from the body (the route is `me`, so we have
 *   no organization context in the URL). The service verifies the caller
 *   has an active membership in the named organization before doing work.
 *
 * Structural rules:
 * - `(eventType, channel)` pairs MUST be unique within the payload so the
 *   composite-unique upsert is deterministic.
 */
export const upsertNotificationPreferencesSchema = z
  .object({
    organizationId: z.string().uuid({ message: 'organizationId phải là UUID hợp lệ.' }),
    /**
     * Optional caller-supplied `userId`. If present, MUST equal the
     * authenticated user's id. Anything else is treated as an attempt to
     * write preferences for another user and is rejected with `FORBIDDEN`.
     */
    userId: z.string().uuid({ message: 'userId phải là UUID hợp lệ.' }).optional(),
    preferences: z
      .array(notificationPreferenceItemSchema)
      .max(MAX_PREFERENCES, `preferences vượt quá ${MAX_PREFERENCES} mục.`)
  })
  .superRefine((payload, ctx) => {
    const seen = new Set<string>();
    for (let i = 0; i < payload.preferences.length; i += 1) {
      const item = payload.preferences[i]!;
      const key = `${item.eventType}\u0000${item.channel}`;
      if (seen.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['preferences', i],
          message: `Trùng (eventType, channel) trong payload: ${item.eventType}/${item.channel}`
        });
      }
      seen.add(key);
    }
  });

export type UpsertNotificationPreferencesInput = z.infer<
  typeof upsertNotificationPreferencesSchema
>;

/**
 * Swagger DTO mirror of the bulk-upsert payload.
 *
 * Used purely for OpenAPI documentation; runtime validation is performed by
 * `upsertNotificationPreferencesSchema` in the service layer.
 */
export class UpsertNotificationPreferencesDto {
  @ApiProperty({
    description:
      'Organization the preferences belong to. The caller must be an active member of this organization.',
    format: 'uuid'
  })
  organizationId!: string;

  @ApiPropertyOptional({
    description:
      'Optional caller-supplied user id. When present it MUST match the authenticated user; mismatches are rejected with `FORBIDDEN` (Requirement 10.4).',
    format: 'uuid'
  })
  userId?: string;

  @ApiProperty({
    type: [NotificationPreferenceItemDto],
    description:
      'Preference toggles to upsert. Items are unique on (eventType, channel) within a single payload.'
  })
  preferences!: NotificationPreferenceItemDto[];
}
