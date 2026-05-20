import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditController } from './audit.controller';
import { AuditQueryService } from './audit-query.service';
import { AuditService } from './audit.service';

/**
 * AuditModule
 *
 * Provides a tenant-scoped, sanitised audit-logging service that writes into
 * the `audit_logs` table inside the caller's Prisma transaction.
 *
 * Consumers should import `AuditModule` and inject `AuditService`. The audit
 * log query endpoint (`GET /api/v1/audit-logs`) is exposed via
 * `AuditController` + `AuditQueryService` (admin-only, tenant-scoped).
 *
 * Design references: Requirements 4.8, 6.7, 16.1, 16.2, 16.3, 16.4.
 */
@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [AuditController],
  providers: [AuditService, AuditQueryService],
  exports: [AuditService]
})
export class AuditModule {}
