import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto';

const DEFAULT_PAGE_SIZE = 50;

/**
 * Read-side helper for the audit module.
 *
 * Lives next to the write-side {@link AuditService}, but does NOT participate
 * in caller transactions: this is a query-only service consumed by the
 * `GET /api/v1/audit-logs` controller. It is deliberately split from
 * `AuditService.record(tx, ...)` so the write contract (must run inside the
 * caller's tx) stays clean.
 *
 * Tenant isolation: the controller is responsible for resolving `organizationId`
 * from an authenticated OWNER/ADMIN membership; this service only receives
 * an already-validated `organizationId` and applies it as a hard filter.
 *
 * Sort order: `createdAt DESC, id DESC` — `id` is the cursor key and acts as
 * a deterministic tiebreaker for rows sharing a `createdAt` timestamp.
 *
 * Design references: Requirements 16.4.
 */
@Injectable()
export class AuditQueryService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(organizationId: string, query: ListAuditLogsQueryDto) {
    const take = query.limit ?? DEFAULT_PAGE_SIZE;

    const where: Prisma.AuditLogWhereInput = {
      organizationId
    };

    if (query.entityType) {
      where.entityType = query.entityType;
    }

    if (query.entityId) {
      where.entityId = query.entityId;
    }

    const findArgs: Prisma.AuditLogFindManyArgs = {
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take
    };

    if (query.cursor) {
      findArgs.skip = 1;
      findArgs.cursor = { id: query.cursor };
    }

    const rows = await this.prisma.auditLog.findMany(findArgs);
    const lastRow = rows.length === take ? rows[rows.length - 1] : undefined;
    const nextCursor = lastRow?.id ?? null;

    return {
      data: rows,
      nextCursor
    };
  }
}
