import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import type { NotificationChannel, NotificationRule, Prisma } from '@prisma/client';
import {
  notificationRuleSchema,
  notificationRuleUpdateSchema,
  type NotificationRuleParsed,
  type NotificationRuleUpdateParsed
} from '@gatesync/shared';
import { AuditService } from '../../audit';
import type { RequestUser } from '../../auth/request-user';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Roles allowed to manage `NotificationRule`s.
 *
 * Per Requirement 6.6, only org admins (OWNER/ADMIN) may create, update, or
 * soft-delete rules. The decision is enforced once here so the controller
 * stays a thin pass-through.
 */
const ADMIN_ROLES = new Set(['OWNER', 'ADMIN']);

/**
 * Plain-object snapshot used for audit `before`/`after` payloads.
 *
 * `Date` values are rendered as ISO-8601 strings so the audit log JSON is
 * stable across serializers and timezone-agnostic.
 */
type RuleSnapshot = {
  id: string;
  organizationId: string;
  name: string;
  eventType: string;
  channels: NotificationChannel[];
  recipientScope: string;
  customUserIds: string[];
  mandatory: boolean;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

@Injectable()
export class NotificationRulesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  /**
   * List active (non-deleted) rules for the caller's organization.
   *
   * Sorted by `createdAt` DESC so newly created rules appear first in admin
   * UIs. Soft-deleted rules are excluded; admins inspect history through the
   * audit log.
   */
  async list(user: RequestUser, organizationId: string): Promise<NotificationRule[]> {
    this.assertAdmin(user, organizationId);
    return this.prisma.notificationRule.findMany({
      where: {
        organizationId,
        deletedAt: null
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * Read a single rule by id, scoped to the caller's organization.
   *
   * Returns `NOT_FOUND` rather than `FORBIDDEN` when the rule belongs to a
   * different organization so we never leak cross-tenant existence (per
   * design §"Error code map").
   */
  async getById(
    user: RequestUser,
    organizationId: string,
    ruleId: string
  ): Promise<NotificationRule> {
    this.assertAdmin(user, organizationId);
    const rule = await this.prisma.notificationRule.findFirst({
      where: { id: ruleId, organizationId, deletedAt: null }
    });
    if (!rule) {
      throw new NotFoundException('Không tìm thấy notification rule.');
    }
    return rule;
  }

  /**
   * Create a new `NotificationRule`.
   *
   * Validation pipeline:
   * 1. Zod parse via `notificationRuleSchema` — applies the
   *    `custom_user_list` non-empty refine (Property 19).
   * 2. Service-side cross-organization guard on `customUserIds` (Requirement
   *    6.4 / 7.7).
   *
   * Audit: a `NOTIFICATION_RULE` row is written inside the same transaction
   * that creates the rule, with the `before` snapshot omitted (creation has
   * no prior state) and `after` containing the persisted snapshot.
   */
  async create(
    user: RequestUser,
    organizationId: string,
    body: unknown
  ): Promise<NotificationRule> {
    this.assertAdmin(user, organizationId);
    const parsed = this.parseCreate(body);
    await this.assertCustomUserIdsBelongToOrg(organizationId, parsed.customUserIds);

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.notificationRule.create({
        data: {
          organizationId,
          name: parsed.name,
          eventType: parsed.eventType,
          channels: parsed.channels as NotificationChannel[],
          recipientScope: parsed.recipientScope,
          customUserIds: parsed.customUserIds,
          mandatory: parsed.mandatory,
          enabled: parsed.enabled
        }
      });

      await this.audit.record(tx, {
        action: 'notification_rule.create',
        entityType: 'NOTIFICATION_RULE',
        entityId: created.id,
        organizationId,
        actor: { kind: 'user', id: user.id },
        before: null,
        after: this.toSnapshot(created)
      });

      return created;
    });
  }

  /**
   * Partially update a `NotificationRule`.
   *
   * Validation pipeline mirrors {@link create} but uses
   * `notificationRuleUpdateSchema`, which keeps the `custom_user_list` refine
   * conditional: when the PATCH transitions the rule into `custom_user_list`
   * scope, `customUserIds` must be provided in the same payload and be
   * non-empty.
   *
   * Cross-org `customUserIds` are validated whenever the field is updated,
   * even if the scope is unchanged, because callers may add new ids to an
   * existing list.
   */
  async update(
    user: RequestUser,
    organizationId: string,
    ruleId: string,
    body: unknown
  ): Promise<NotificationRule> {
    this.assertAdmin(user, organizationId);
    const parsed = this.parseUpdate(body);

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.notificationRule.findFirst({
        where: { id: ruleId, organizationId, deletedAt: null }
      });
      if (!existing) {
        throw new NotFoundException('Không tìm thấy notification rule.');
      }

      // Compose the merged view to evaluate the `custom_user_list` invariant
      // against the row's post-update state, not just the patch payload.
      const mergedScope = parsed.recipientScope ?? existing.recipientScope;
      const mergedCustomUserIds = parsed.customUserIds ?? existing.customUserIds;
      if (mergedScope === 'custom_user_list' && mergedCustomUserIds.length === 0) {
        throw new BadRequestException(
          'customUserIds phải có ít nhất một userId khi recipientScope = "custom_user_list".'
        );
      }
      if (parsed.customUserIds !== undefined) {
        await this.assertCustomUserIdsBelongToOrg(organizationId, parsed.customUserIds);
      }

      const data: Prisma.NotificationRuleUpdateInput = {};
      if (parsed.name !== undefined) data.name = parsed.name;
      if (parsed.eventType !== undefined) data.eventType = parsed.eventType;
      if (parsed.channels !== undefined) {
        data.channels = { set: parsed.channels as NotificationChannel[] };
      }
      if (parsed.recipientScope !== undefined) data.recipientScope = parsed.recipientScope;
      if (parsed.customUserIds !== undefined) {
        data.customUserIds = { set: parsed.customUserIds };
      }
      if (parsed.mandatory !== undefined) data.mandatory = parsed.mandatory;
      if (parsed.enabled !== undefined) data.enabled = parsed.enabled;

      const updated = await tx.notificationRule.update({
        where: { id: existing.id },
        data
      });

      await this.audit.record(tx, {
        action: 'notification_rule.update',
        entityType: 'NOTIFICATION_RULE',
        entityId: updated.id,
        organizationId,
        actor: { kind: 'user', id: user.id },
        before: this.toSnapshot(existing),
        after: this.toSnapshot(updated)
      });

      return updated;
    });
  }

  /**
   * Soft-delete a rule by setting `deletedAt`.
   *
   * The orchestrator already filters on `deletedAt IS NULL`, so soft-deleted
   * rules immediately stop producing deliveries while remaining queryable
   * for audit purposes. Re-deleting an already-deleted rule returns
   * `NOT_FOUND` to match the existence-only contract of the read endpoints.
   */
  async softDelete(
    user: RequestUser,
    organizationId: string,
    ruleId: string
  ): Promise<NotificationRule> {
    this.assertAdmin(user, organizationId);
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.notificationRule.findFirst({
        where: { id: ruleId, organizationId, deletedAt: null }
      });
      if (!existing) {
        throw new NotFoundException('Không tìm thấy notification rule.');
      }

      const deleted = await tx.notificationRule.update({
        where: { id: existing.id },
        data: { deletedAt: new Date(), enabled: false }
      });

      await this.audit.record(tx, {
        action: 'notification_rule.delete',
        entityType: 'NOTIFICATION_RULE',
        entityId: deleted.id,
        organizationId,
        actor: { kind: 'user', id: user.id },
        before: this.toSnapshot(existing),
        after: this.toSnapshot(deleted)
      });

      return deleted;
    });
  }

  /**
   * Resolve the caller's active membership in the requested organization and
   * assert it carries an admin role. Throws `FORBIDDEN` for cross-tenant
   * attempts and for active members without admin privileges.
   */
  private assertAdmin(user: RequestUser, organizationId: string): void {
    const membership = user.memberships.find(
      (item) => item.organizationId === organizationId && item.status === 'ACTIVE'
    );
    if (!membership) {
      // We expose `FORBIDDEN` here rather than `NOT_FOUND` because route-level
      // membership has already been verified by `OrganizationMembershipGuard`
      // — reaching this branch indicates a guard misconfiguration or a stale
      // memberships list, neither of which should leak organization existence
      // beyond what the guard already determined.
      throw new ForbiddenException('Bạn không có quyền truy cập tổ chức này.');
    }
    if (!ADMIN_ROLES.has(membership.role)) {
      throw new ForbiddenException(
        'Chỉ admin tổ chức mới có quyền cấu hình notification rule (Requirement 6.6).'
      );
    }
  }

  private parseCreate(body: unknown): NotificationRuleParsed {
    const result = notificationRuleSchema.safeParse(body);
    if (!result.success) {
      throw this.toValidationException(result.error);
    }
    return result.data;
  }

  private parseUpdate(body: unknown): NotificationRuleUpdateParsed {
    const result = notificationRuleUpdateSchema.safeParse(body);
    if (!result.success) {
      throw this.toValidationException(result.error);
    }
    return result.data;
  }

  private toValidationException(error: {
    issues: ReadonlyArray<{ path: ReadonlyArray<string | number>; message: string }>;
  }): BadRequestException {
    const message = error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    return new BadRequestException(message || 'Notification rule payload không hợp lệ.');
  }

  /**
   * Cross-organization guard for `custom_user_list` (Requirement 6.4 / 7.7).
   *
   * Each user id must:
   *  - belong to a real `users` row, AND
   *  - have an active, non-deleted membership in the rule's organization.
   *
   * The check uses a single `findMany` keyed by membership and compares the
   * returned `userId` set to the requested set. Any missing id triggers a
   * `VALIDATION_ERROR` listing the offending ids.
   */
  private async assertCustomUserIdsBelongToOrg(
    organizationId: string,
    customUserIds: string[]
  ): Promise<void> {
    if (customUserIds.length === 0) {
      return;
    }
    const uniqueIds = [...new Set(customUserIds)];
    const memberships = await this.prisma.membership.findMany({
      where: {
        organizationId,
        deletedAt: null,
        status: 'ACTIVE',
        userId: { in: uniqueIds }
      },
      select: { userId: true }
    });
    const found = new Set(memberships.map((row) => row.userId));
    const missing = uniqueIds.filter((id) => !found.has(id));
    if (missing.length > 0) {
      throw new BadRequestException(
        `customUserIds chứa userId không thuộc tổ chức hoặc không active: ${missing.join(', ')}`
      );
    }
  }

  /**
   * Convert a Prisma `NotificationRule` row into the JSON-stable audit
   * snapshot. We expose a curated field set (no internal foreign keys, no
   * computed columns) so audit diffs stay readable.
   */
  private toSnapshot(rule: NotificationRule): RuleSnapshot {
    return {
      id: rule.id,
      organizationId: rule.organizationId,
      name: rule.name,
      eventType: rule.eventType,
      channels: rule.channels,
      recipientScope: rule.recipientScope,
      customUserIds: rule.customUserIds,
      mandatory: rule.mandatory,
      enabled: rule.enabled,
      createdAt: rule.createdAt.toISOString(),
      updatedAt: rule.updatedAt.toISOString(),
      deletedAt: rule.deletedAt ? rule.deletedAt.toISOString() : null
    };
  }
}
