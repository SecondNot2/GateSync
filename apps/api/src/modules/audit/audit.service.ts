import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createSensitiveScrubber, type SensitiveScrubber } from '@gatesync/shared';
import type { AuditRecordInput } from './audit.types';

/**
 * AuditService
 *
 * Writes sanitised before/after snapshots into the `audit_logs` table.
 *
 * Contract:
 * - `record()` MUST run inside the caller's transaction. The first argument
 *   is a `Prisma.TransactionClient` (or `PrismaClient`); the service does
 *   NOT open its own transaction. This guarantees the audit row rolls back
 *   if the surrounding domain mutation fails.
 * - `before` and `after` are passed through three sanitisation steps:
 *     1. `customUserIds: string[]` arrays are reduced to
 *        `{ count, ids }` summaries (uuid list, no PII) at every depth.
 *     2. The `SensitiveScrubber` from `@gatesync/shared` masks credentials,
 *        phone numbers, emails, vehicle plates, declaration numbers, CMND,
 *        JWT/Bearer tokens, and similar sensitive substrings.
 *     3. The result is persisted as JSON.
 * - `encryptedCredentials` and contact details (`phone`, `email`) are stripped
 *   by the scrubber via field-name match.
 * - `actor.kind === 'user'` → `actorUserId = actor.id`; for `system` and
 *   `integration` actors, `actorUserId` is left null.
 *
 * Design references: Requirements 4.8, 6.7, 16.1, 16.2, 16.3.
 */
@Injectable()
export class AuditService {
  private readonly scrubber: SensitiveScrubber = createSensitiveScrubber();

  /**
   * Persist an audit log entry inside the caller's transaction.
   *
   * @param tx - The active `Prisma.TransactionClient`. Pass the `tx` argument
   *   from inside `prisma.$transaction(async (tx) => { ... })`.
   * @param input - The audit payload.
   */
  async record(tx: Prisma.TransactionClient, input: AuditRecordInput): Promise<void> {
    const before = this.sanitizeSnapshot(input.before);
    const after = this.sanitizeSnapshot(input.after);
    const actorUserId = input.actor.kind === 'user' && input.actor.id ? input.actor.id : null;

    await tx.auditLog.create({
      data: {
        organizationId: input.organizationId ?? null,
        actorUserId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        before: before ?? Prisma.JsonNull,
        after: after ?? Prisma.JsonNull,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null
      }
    });
  }

  /**
   * Reduce + scrub a snapshot. Returns `undefined` when input is null/undefined
   * so the caller can persist `Prisma.JsonNull` without leaking the literal
   * value `null` masked as a string.
   */
  private sanitizeSnapshot(value: unknown): Prisma.InputJsonValue | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }
    const reduced = reduceCustomUserIds(value);
    const scrubbed = this.scrubber.scrub(reduced);
    return scrubbed as Prisma.InputJsonValue;
  }
}

/**
 * Walk a JSON-compatible value tree and replace any `customUserIds: string[]`
 * with `{ count, ids }`. The uuids themselves are not PII, but the summary
 * makes long arrays readable in audit views and signals that the field is a
 * user reference list rather than a free-form payload.
 *
 * Non-array values at the `customUserIds` key are left untouched (so a
 * pre-existing `{ count, ids }` summary survives a round-trip).
 */
function reduceCustomUserIds(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => reduceCustomUserIds(entry));
  }
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source)) {
      const child = source[key];
      if (key === 'customUserIds' && Array.isArray(child)) {
        out[key] = {
          count: child.length,
          ids: child.slice()
        };
      } else {
        out[key] = reduceCustomUserIds(child);
      }
    }
    return out;
  }
  return value;
}
