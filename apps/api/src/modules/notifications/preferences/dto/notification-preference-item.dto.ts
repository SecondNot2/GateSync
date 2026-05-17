import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';
import { NotificationChannel } from '@prisma/client';
import { NOTIFICATION_EVENT_TYPES, type NotificationEventType } from '@gatesync/shared';

/**
 * Channels exposed to users for self-managed notification preferences.
 *
 * `WEBHOOK` is intentionally excluded — webhooks are an integration
 * channel, not a user-facing one, so users have nothing to opt in/out of.
 * Mirrors the Prisma `NotificationChannel` enum for the remaining values.
 */
export const PREFERENCE_CHANNELS = [
  NotificationChannel.IN_APP,
  NotificationChannel.WEB_PUSH,
  NotificationChannel.ZALO_OA,
  NotificationChannel.SMS,
  NotificationChannel.EMAIL
] as const satisfies readonly NotificationChannel[];

export type PreferenceChannel = (typeof PREFERENCE_CHANNELS)[number];

const eventTypeValues = NOTIFICATION_EVENT_TYPES as readonly NotificationEventType[];

/**
 * Zod schema for a single preference toggle.
 *
 * Validates `(eventType, channel, enabled)` shape coming from the client.
 * The schema is deliberately small — composite identity
 * `(userId, organizationId, eventType, channel)` is enforced at the service
 * layer because `userId`/`organizationId` are derived from auth context, not
 * from the body.
 */
export const notificationPreferenceItemSchema = z.object({
  eventType: z.enum(
    eventTypeValues as readonly [NotificationEventType, ...NotificationEventType[]]
  ),
  channel: z.enum(PREFERENCE_CHANNELS as readonly [PreferenceChannel, ...PreferenceChannel[]]),
  enabled: z.boolean()
});

export type NotificationPreferenceItemInput = z.infer<typeof notificationPreferenceItemSchema>;

/**
 * Swagger DTO mirror of the Zod schema.
 *
 * Nest's `class-validator` pipeline is bypassed in favour of Zod parsing in
 * the service, but exposing the shape via `@ApiProperty` keeps Swagger UI
 * documentation accurate.
 */
export class NotificationPreferenceItemDto {
  @ApiProperty({
    enum: NOTIFICATION_EVENT_TYPES as readonly string[],
    example: 'vehicle_arrived_gate',
    description: 'Domain event type the preference applies to.'
  })
  eventType!: NotificationEventType;

  @ApiProperty({
    enum: PREFERENCE_CHANNELS as readonly string[],
    example: NotificationChannel.IN_APP,
    description: 'Delivery channel the preference toggles.'
  })
  channel!: PreferenceChannel;

  @ApiProperty({
    example: true,
    description: 'Whether the user wants to receive this `(eventType, channel)` combination.'
  })
  enabled!: boolean;
}
