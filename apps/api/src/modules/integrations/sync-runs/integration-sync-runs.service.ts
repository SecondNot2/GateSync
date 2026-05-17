import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { ListIntegrationSyncRunsQueryDto } from './dto/list-integration-sync-runs-query.dto';

const DEFAULT_PAGE_SIZE = 50;

/**
 * Read-side helper for the integration sync-runs admin endpoint.
 *
 * Mirrors the shape of `AuditQueryService` (the canonical template) so the
 * `GET /api/v1/integration-sync-runs` controller stays a thin pass-through.
 *
 * Tenant isolation: the controller is responsible for resolving
 * `organizationId` from an authenticated OWNER/ADMIN membership; this service
 * only receives an already-validated `organizationId` and applies it as a
 * hard filter. The caller cannot influence it.
 *
 * Sort order: `startedAt DESC, id DESC` — `id` is the cursor key and acts as
 * a deterministic tiebreaker for rows sharing a `startedAt` timestamp.
 *
 * Design references: Requirements 4.1, 4.2, 4.3, 4.4, 4.5.
 */
@Injectable()
export class IntegrationSyncRunsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(organizationId: string, query: ListIntegrationSyncRunsQueryDto) {
    const take = query.limit ?? DEFAULT_PAGE_SIZE;

    const where: Prisma.IntegrationSyncRunWhereInput = {
      organizationId
    };

    if (query.provider) {
      // `provider` lives on the related `IntegrationAccount`; keep the tenant
      // filter on both sides so a manipulated `integrationAccountId` cannot
      // leak rows from another organization through the relation.
      where.integrationAccount = { provider: query.provider, organizationId };
    }

    if (query.integrationAccountId) {
      where.integrationAccountId = query.integrationAccountId;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.from || query.to) {
      where.startedAt = {};
      if (query.from) {
        where.startedAt.gte = query.from;
      }
      if (query.to) {
        where.startedAt.lte = query.to;
      }
    }

    const findArgs: Prisma.IntegrationSyncRunFindManyArgs = {
      where,
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      take
    };

    if (query.cursor) {
      findArgs.skip = 1;
      findArgs.cursor = { id: query.cursor };
    }

    const rows = await this.prisma.integrationSyncRun.findMany(findArgs);
    const lastRow = rows.length === take ? rows[rows.length - 1] : undefined;
    const nextCursor = lastRow?.id ?? null;

    return {
      data: rows,
      nextCursor
    };
  }
}
