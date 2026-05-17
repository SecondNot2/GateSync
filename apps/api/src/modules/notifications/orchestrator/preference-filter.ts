import { Inject, Injectable } from '@nestjs/common';
import type { NotificationChannel } from '@prisma/client';
import type { NotificationEventType } from '@gatesync/shared';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Input for {@link PreferenceFilter.filterChannelsForRecipient}.
 *
 * `channels` is the channel set configured on the matching `NotificationRule`
 * (already de-duplicated by the orchestrator). `mandatory` mirrors
 * `NotificationRule.mandatory` so the filter can short-circuit per
 * Requirement 10.3 without re-loading the rule.
 */
export interface FilterChannelsForRecipientInput {
  userId: string;
  organizationId: string;
  eventType: NotificationEventType;
  channels: NotificationChannel[];
  mandatory: boolean;
}

/**
 * Applies user `NotificationPreference` opt-outs to a rule's channel set.
 *
 * Behaviour (Requirements 10.2, 10.3):
 * - When `mandatory === true`, preferences are bypassed entirely and every
 *   configured channel is returned unchanged. This guarantees safety- and
 *   operations-critical notifications (e.g. `sync_run_failed`) cannot be
 *   silenced by a user.
 * - Otherwise, the filter loads `NotificationPreference` rows on the
 *   composite `(userId, organizationId, eventType, channel)` key and keeps
 *   only channels whose preference resolves to `enabled = true`. When no
 *   row exists for a `(userId, organizationId, eventType, channel)` tuple,
 *   the channel is treated as enabled (default-on per Requirement 10.2).
 *
 * The filter preserves the input order of `channels` and never returns
 * duplicates, matching the orchestrator's expectation of a stable,
 * deduplicated channel list per recipient.
 */
@Injectable()
export class PreferenceFilter {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async filterChannelsForRecipient(
    input: FilterChannelsForRecipientInput
  ): Promise<NotificationChannel[]> {
    const { userId, organizationId, eventType, channels, mandatory } = input;

    // Mandatory bypass — Requirement 10.3.
    if (mandatory) {
      return [...channels];
    }

    if (channels.length === 0) {
      return [];
    }

    // Load only rows relevant to this recipient + event + candidate channels.
    // Anything missing from the result set is treated as `enabled = true`
    // (default-on, Requirement 10.2). We deliberately fetch by `channel: { in }`
    // so a single round-trip covers every channel on the rule.
    const rows = await this.prisma.notificationPreference.findMany({
      where: {
        userId,
        organizationId,
        eventType,
        channel: { in: channels }
      },
      select: {
        channel: true,
        enabled: true
      }
    });

    const explicitDisabled = new Set<NotificationChannel>();
    for (const row of rows) {
      if (row.enabled === false) {
        explicitDisabled.add(row.channel);
      }
    }

    if (explicitDisabled.size === 0) {
      // No opt-outs — preserve the rule's channel ordering verbatim.
      return [...channels];
    }

    return channels.filter((channel) => !explicitDisabled.has(channel));
  }
}
