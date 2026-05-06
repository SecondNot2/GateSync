import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type {
  DeclarationStatus,
  DeclarationType,
  IntegrationAccount,
  Prisma,
  TripStatus,
  TripDirection,
  TripType
} from '@prisma/client';
import type { RequestUser } from '../../auth/request-user';
import { NotificationsService } from '../../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { CreateTripEventDto } from '../../trips/dto/create-trip-event.dto';
import { TripsService } from '../../trips/trips.service';
import { CuaKhauSoClient } from './cua-khau-so.client';
import { CuaKhauSoMapper } from './cua-khau-so.mapper';
import { CuaKhauSoSessionStore } from './cua-khau-so-session.store';
import type { CuaKhauSoLoginDto } from './dto/cua-khau-so-login.dto';
import type { ListCuaKhauSoDeclarationsQueryDto } from './dto/list-cua-khau-so-declarations-query.dto';
import type { SyncCuaKhauSoDeclarationDto } from './dto/sync-cua-khau-so-declaration.dto';
import type {
  CuaKhauSoDeclarationDetail,
  CuaKhauSoDeclarationDetailView,
  CuaKhauSoDeclarationSummary,
  CuaKhauSoEmptyVehicleLogItem,
  CuaKhauSoListStatus,
  CuaKhauSoPageSize
} from './cua-khau-so.types';

type LinkedTrip = {
  id: string;
  tripCode: string;
  customsDeclarationId: string | null;
  vehicleId: string | null;
  driverProfileId: string | null;
  currentStatus: TripStatus;
};
type TripSourceAssignment = {
  vehicleId?: string;
  driverProfileId?: string;
  driverUserId?: string | null;
};
type LinkMode = 'requested' | 'declaration' | 'tripCode' | 'created' | 'none';
type CustomsDeclarationSyncData = {
  declarationNumber: string;
  declarationType: DeclarationType;
  customsOfficeCode?: string;
  status: DeclarationStatus;
  submittedAt?: Date;
  approvedAt?: Date;
  rejectedAt?: Date;
};
type CustomsDeclarationSourceWriteData = {
  externalId: string;
  normalizedSummary: CuaKhauSoDeclarationSummary;
  sourceSnapshot: CuaKhauSoDeclarationDetailView;
  sourceObservedAt: Date;
  sourceUpdatedAt: Date;
  syncRunId?: string;
};
type StoredCuaKhauSoCredentials = {
  username: string;
  password: string;
};
type SourceSession = {
  accessToken: string;
  refreshCookies: string[];
  username: string;
};
type SyncRunMode = 'AUTO' | 'MANUAL' | 'REFRESH_ON_OPEN';
type OrganizationSyncResult = {
  recordsFetched: number;
  detailsFetched: number;
  eventsCreated: number;
  eventsSkipped: number;
  failedDeclarations: number;
  syncedDeclarations: string[];
  lastObservedAt?: Date;
};
type AccountSyncRunResult = OrganizationSyncResult & {
  skipped: boolean;
  syncRunId?: string;
};
type MirrorDeclarationRecord = {
  id: string;
  declarationNumber: string;
  declarationType: DeclarationType;
  customsOfficeCode: string | null;
  status: DeclarationStatus;
  sourceExternalId: string | null;
  sourceStatus: string | null;
  sourceUpdatedAt: Date | null;
  sourceObservedAt: Date | null;
  lastIngestedAt: Date | null;
  latestSyncRunId: string | null;
  normalizedSummary: Prisma.JsonValue | null;
  sourceSnapshot: Prisma.JsonValue | null;
  submittedAt: Date | null;
  approvedAt: Date | null;
  rejectedAt: Date | null;
  trips: Array<{
    id: string;
    tripCode: string;
    currentStatus: TripStatus;
  }>;
};
type IntegrationSyncRunDelegate = {
  create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
  update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
  findMany(args: Record<string, unknown>): Promise<Array<Record<string, unknown>>>;
};
type PrismaWithIntegrationSyncRun = PrismaService & {
  integrationSyncRun: IntegrationSyncRunDelegate;
};

const integrationDisplayName = 'Cửa khẩu số';
const localCredentialSecret = 'gatesync-local-development-secret';
const defaultRecentWindowDays = 7;
const filteredListPageSize: CuaKhauSoPageSize = 100;
const terminalTripStatuses: readonly TripStatus[] = ['COMPLETED', 'CANCELLED'];
const defaultRefreshThrottleMs = 10 * 60_000;
const defaultStaleAfterMs = 30 * 60_000;
const defaultLeaseMs = 3 * 60_000;
const maxBackoffMs = 30 * 60_000;
const defaultBorderGuardLagAlertMs = 5 * 60_000;

@Injectable()
export class CuaKhauSoService {
  private readonly workerId = `cks-worker-${process.pid}-${randomBytes(4).toString('hex')}`;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(CuaKhauSoClient) private readonly client: CuaKhauSoClient,
    @Inject(CuaKhauSoMapper) private readonly mapper: CuaKhauSoMapper,
    @Inject(CuaKhauSoSessionStore) private readonly sessionStore: CuaKhauSoSessionStore,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(TripsService) private readonly tripsService: TripsService
  ) {}

  private get syncRuns() {
    return (this.prisma as PrismaWithIntegrationSyncRun).integrationSyncRun;
  }

  async connect(user: RequestUser, organizationId: string, dto: CuaKhauSoLoginDto) {
    const credentials = {
      username: dto.username.trim(),
      password: dto.password
    };
    const sourceSession = await this.client.login({
      username: credentials.username,
      password: credentials.password
    });
    const summary = this.sessionStore.save(organizationId, user.id, sourceSession);
    const account = await this.upsertIntegrationAccount(
      organizationId,
      this.encryptCredentials(credentials)
    );

    await this.prisma.auditLog.create({
      data: {
        organizationId,
        actorUserId: user?.id ?? null,
        action: 'integration.cua_khau_so.connect',
        entityType: 'IntegrationAccount',
        entityId: account.id,
        after: {
          provider: 'CUA_KHAU_SO',
          displayName: integrationDisplayName,
          username: credentials.username
        }
      }
    });

    return summary;
  }

  async getSession(user: RequestUser, organizationId: string) {
    const sessionSummary = this.sessionStore.getSummary(organizationId, user.id);

    if (sessionSummary.authenticated) {
      return sessionSummary;
    }

    const account = await this.prisma.integrationAccount.findFirst({
      where: {
        organizationId,
        provider: 'CUA_KHAU_SO',
        displayName: integrationDisplayName,
        status: {
          in: ['ACTIVE', 'ERROR']
        },
        deletedAt: null,
        encryptedCredentials: {
          not: null
        }
      }
    });

    if (!account?.encryptedCredentials) {
      return sessionSummary;
    }

    const credentials = this.decryptCredentials(account.encryptedCredentials);

    return {
      authenticated: true,
      username: credentials.username
    };
  }

  async listDeclarations(
    user: RequestUser,
    organizationId: string,
    query: ListCuaKhauSoDeclarationsQueryDto
  ) {
    void this.refreshOnOpenIfStale(user, organizationId);
    return this.listMirrorDeclarations(organizationId, query);
  }

  async getDeclaration(user: RequestUser, organizationId: string, externalId: string) {
    const mirrored = await this.getMirrorDeclarationDetail(organizationId, externalId);

    if (mirrored) {
      return mirrored;
    }

    const detail = await this.fetchDeclarationDetail(user, organizationId, externalId);
    return this.mapper.mapDetail(detail, organizationId);
  }

  async getProcedureSteps(user: RequestUser, organizationId: string, externalId: string) {
    const mirrored = await this.getMirrorDeclarationDetail(organizationId, externalId);

    if (mirrored) {
      return mirrored.procedureSteps;
    }

    const detail = await this.fetchDeclarationDetail(user, organizationId, externalId);
    return this.mapper.deriveProcedureSteps(detail);
  }

  async syncDeclaration(
    user: RequestUser,
    organizationId: string,
    externalId: string,
    dto: SyncCuaKhauSoDeclarationDto
  ) {
    const detail = await this.fetchDeclarationDetail(user, organizationId, externalId);
    const account = await this.upsertIntegrationAccount(organizationId);

    return this.syncDeclarationDetail(
      user,
      organizationId,
      externalId,
      detail,
      account,
      undefined,
      dto.tripId
    );
  }

  async runSyncNow(user: RequestUser, organizationId: string) {
    const account = await this.getConnectedAccount(organizationId);
    const throttleMs =
      this.configService.get<number>('CUA_KHAU_SO_REFRESH_THROTTLE_MS') ?? defaultRefreshThrottleMs;

    if (await this.hasRecentSyncRun(account.id, throttleMs)) {
      throw new BadRequestException(
        'GateSync vừa kiểm tra nguồn Cửa khẩu số, vui lòng thử lại sau.'
      );
    }

    return this.runAccountSync(account, 'MANUAL', user);
  }

  listSyncRuns(organizationId: string) {
    return this.syncRuns.findMany({
      where: {
        organizationId
      },
      orderBy: {
        startedAt: 'desc'
      },
      take: 25
    });
  }

  async getHealth(organizationId: string) {
    return this.resolveHealth(organizationId);
  }

  async pollActiveAccounts() {
    const accounts = await this.prisma.integrationAccount.findMany({
      where: {
        provider: 'CUA_KHAU_SO',
        displayName: integrationDisplayName,
        status: {
          in: ['ACTIVE', 'ERROR']
        },
        deletedAt: null,
        encryptedCredentials: {
          not: null
        },
        OR: [
          {
            nextRetryAt: null
          },
          {
            nextRetryAt: {
              lte: new Date()
            }
          }
        ]
      }
    });
    const results = [] as Array<{ organizationId: string; syncRunId?: string; status: string }>;

    for (const account of accounts) {
      try {
        const result = await this.runAccountSync(account, 'AUTO');
        const syncResult: { organizationId: string; syncRunId?: string; status: string } = {
          organizationId: account.organizationId,
          status: result.skipped
            ? 'SKIPPED'
            : result.failedDeclarations > 0
              ? 'PARTIAL'
              : 'SUCCEEDED'
        };

        if (result.syncRunId) {
          syncResult.syncRunId = result.syncRunId;
        }

        results.push(syncResult);
      } catch {
        results.push({
          organizationId: account.organizationId,
          status: 'FAILED'
        });
      }
    }

    return {
      accountsProcessed: accounts.length,
      results
    };
  }

  private async listMirrorDeclarations(
    organizationId: string,
    query: ListCuaKhauSoDeclarationsQueryDto
  ) {
    const pageNumber = query.pageNumber ?? 1;
    const pageSize = query.pageSize ?? 20;
    const from =
      this.parseDate(query.from) ??
      (!query.to && !query.keyword && (!query.status || query.status === 1)
        ? this.getDefaultRecentFromDate()
        : undefined);
    const to = this.parseDate(query.to);

    if (from && to && from > to) {
      throw new BadRequestException('From date must be before to date.');
    }

    const where: Prisma.CustomsDeclarationWhereInput = {
      organizationId,
      sourceProvider: 'CUA_KHAU_SO'
    };

    if (query.status === 1 || query.status === undefined) {
      where.status = {
        notIn: ['APPROVED', 'CANCELLED']
      };
    } else if (query.status === 2) {
      where.status = 'APPROVED';
    } else if (query.status === 3) {
      where.status = 'CANCELLED';
    }

    if (query.direction) {
      where.declarationType = query.direction;
    }

    if (from || to) {
      where.submittedAt = {
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: to } : {})
      };
    }

    const maxRecords = Math.max(
      pageNumber * pageSize,
      this.configService.get<number>('CUA_KHAU_SO_MIRROR_MAX_RECORDS') ?? 1000
    );
    const records = (await this.prisma.customsDeclaration.findMany({
      where,
      include: {
        trips: {
          select: {
            id: true,
            tripCode: true,
            currentStatus: true
          }
        }
      },
      orderBy: [
        {
          sourceObservedAt: 'desc'
        },
        {
          submittedAt: 'desc'
        },
        {
          createdAt: 'desc'
        }
      ],
      take: maxRecords
    })) as unknown as MirrorDeclarationRecord[];
    const keyword = query.keyword?.trim();
    const filtered = keyword
      ? records.filter((record) => this.matchesMirrorKeyword(record, keyword))
      : records;
    const startIndex = (pageNumber - 1) * pageSize;
    const totalPage = filtered.length > 0 ? Math.ceil(filtered.length / pageSize) : 0;

    return {
      declarations: filtered.slice(startIndex, startIndex + pageSize).map((record) => ({
        ...this.toMirrorSummary(record),
        sourceObservedAt: record.sourceObservedAt?.toISOString(),
        lastIngestedAt: record.lastIngestedAt?.toISOString(),
        linkedTripId: record.trips[0]?.id,
        linkedTripCode: record.trips[0]?.tripCode
      })),
      totalCount: filtered.length,
      totalPage,
      message: this.buildMirrorListMessage(from, to, query.status)
    };
  }

  private async getMirrorDeclarationDetail(
    organizationId: string,
    externalId: string
  ): Promise<CuaKhauSoDeclarationDetailView | undefined> {
    const record = (await this.prisma.customsDeclaration.findFirst({
      where: {
        organizationId,
        sourceProvider: 'CUA_KHAU_SO',
        OR: [
          {
            sourceExternalId: externalId
          },
          {
            declarationNumber: externalId
          }
        ]
      },
      include: {
        trips: {
          select: {
            id: true,
            tripCode: true,
            currentStatus: true
          }
        }
      }
    })) as MirrorDeclarationRecord | null;

    if (!record) {
      return undefined;
    }

    const snapshot = this.toMirrorDetailView(record.sourceSnapshot);

    if (snapshot) {
      return {
        ...snapshot,
        externalId: record.sourceExternalId ?? snapshot.externalId,
        declarationNumber: record.declarationNumber
      };
    }

    return this.toFallbackMirrorDetail(record);
  }

  private matchesMirrorKeyword(record: MirrorDeclarationRecord, keyword: string) {
    const normalizedKeyword = keyword.toLowerCase();
    const summary = this.toMirrorSummary(record);
    const values = [
      record.declarationNumber,
      record.sourceExternalId,
      summary.gateName,
      summary.gateCode,
      summary.companyGoodsName,
      summary.plateNumber,
      summary.trailerNumber,
      summary.changePlateNumber,
      record.trips[0]?.tripCode
    ];

    return values.some((value) => value?.toLowerCase().includes(normalizedKeyword));
  }

  private toMirrorSummary(record: MirrorDeclarationRecord): CuaKhauSoDeclarationSummary {
    const normalizedSummary = this.toMirrorSummaryValue(record.normalizedSummary);

    if (normalizedSummary) {
      return {
        ...normalizedSummary,
        externalId: record.sourceExternalId ?? normalizedSummary.externalId,
        declarationNumber: record.declarationNumber,
        declarationType: record.declarationType,
        direction: this.toTripDirection(record.declarationType),
        status: record.status,
        statusLabel: this.toDeclarationStatusLabel(record.status),
        completed: record.status === 'APPROVED'
      };
    }

    const summary: CuaKhauSoDeclarationSummary = {
      externalId: record.sourceExternalId ?? record.declarationNumber,
      declarationNumber: record.declarationNumber,
      direction: this.toTripDirection(record.declarationType),
      declarationType: record.declarationType,
      status: record.status,
      statusLabel: this.toDeclarationStatusLabel(record.status),
      gateName: record.customsOfficeCode ?? 'Chưa cập nhật',
      companyGoodsName: 'Chưa cập nhật',
      plateNumber: 'Chưa cập nhật',
      trailerNumber: 'Chưa cập nhật',
      changePlateNumber: 'Chưa cập nhật',
      completed: record.status === 'APPROVED',
      paymentStatus: record.status === 'APPROVED' ? 'Đã thanh toán' : 'Chưa có thông tin thanh toán'
    };

    if (record.submittedAt) {
      summary.createdAt = record.submittedAt.toISOString();
    }

    return summary;
  }

  private toMirrorSummaryValue(value: Prisma.JsonValue | null) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }

    const candidate = value as Partial<CuaKhauSoDeclarationSummary>;

    if (!candidate.externalId || !candidate.declarationNumber) {
      return undefined;
    }

    return candidate as CuaKhauSoDeclarationSummary;
  }

  private toMirrorDetailView(value: Prisma.JsonValue | null) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }

    const candidate = value as Partial<CuaKhauSoDeclarationDetailView>;

    if (!candidate.externalId || !candidate.declarationNumber) {
      return undefined;
    }

    return candidate as CuaKhauSoDeclarationDetailView;
  }

  private toFallbackMirrorDetail(record: MirrorDeclarationRecord): CuaKhauSoDeclarationDetailView {
    return {
      ...this.toMirrorSummary(record),
      borderGuardDeclarationNumber: record.declarationNumber,
      arrivalAt: record.submittedAt?.toISOString() ?? 'Chưa cập nhật',
      feePayingCompany: {
        name: 'Chưa cập nhật',
        taxCode: 'Chưa cập nhật',
        address: 'Chưa cập nhật',
        phone: 'Chưa cập nhật'
      },
      parkingPlace: {
        name: 'Chưa cập nhật',
        address: 'Chưa cập nhật',
        description: 'Chưa cập nhật'
      },
      infrastructureCharges: 0,
      transferCharges: 0,
      transshipment: {
        licenseRegistered: false,
        transportLicenseConfirmed: false,
        chinaVehicleEntered: false,
        vietnamVehicleEntered: false,
        foreignVehicleRequired: false,
        foreignVehicleEntered: false,
        borderGuardLagging: false,
        eligible: false,
        signed: false,
        licenseNumber: 'Chưa cập nhật',
        statusLabel: 'Chưa đủ điều kiện ký sang tải',
        unmetConditions: ['Chưa có dữ liệu chi tiết từ bản sao Cửa khẩu số.']
      },
      checks: [],
      vehicles: [],
      transshipmentVehicles: [],
      goods: [],
      procedureSteps: [],
      eventCandidates: []
    };
  }

  private buildMirrorListMessage(
    from: Date | undefined,
    to: Date | undefined,
    status: CuaKhauSoListStatus | undefined
  ) {
    return this.buildFilteredListMessage(
      'Đang hiển thị bản sao nội bộ GateSync từ Cửa khẩu số.',
      from,
      to,
      status
    );
  }

  private toDeclarationStatusLabel(status: DeclarationStatus) {
    if (status === 'APPROVED') {
      return 'Hoàn thành';
    }

    if (status === 'CANCELLED') {
      return 'Đã hủy';
    }

    if (status === 'REJECTED') {
      return 'Bị từ chối';
    }

    return 'Chưa hoàn thành';
  }

  private async refreshOnOpenIfStale(user: RequestUser, organizationId: string) {
    try {
      const account = await this.getConnectedAccount(organizationId);
      const staleAfterMs =
        this.configService.get<number>('CUA_KHAU_SO_STALE_AFTER_MS') ?? defaultStaleAfterMs;
      const throttleMs =
        this.configService.get<number>('CUA_KHAU_SO_REFRESH_THROTTLE_MS') ??
        defaultRefreshThrottleMs;
      const lastSuccessfulSyncAt = account.lastSuccessfulSyncAt ?? account.lastSyncAt;
      const isStale =
        !lastSuccessfulSyncAt || Date.now() - lastSuccessfulSyncAt.getTime() > staleAfterMs;

      if (!isStale || (await this.hasRecentSyncRun(account.id, throttleMs))) {
        return;
      }

      await this.runAccountSync(account, 'REFRESH_ON_OPEN', user);
    } catch {
      return;
    }
  }

  private async runAccountSync(
    account: Pick<IntegrationAccount, 'id' | 'organizationId' | 'encryptedCredentials'>,
    mode: SyncRunMode,
    user?: RequestUser
  ): Promise<AccountSyncRunResult> {
    const locked = await this.acquireSyncLock(account.id);

    if (!locked) {
      return {
        skipped: true,
        recordsFetched: 0,
        detailsFetched: 0,
        eventsCreated: 0,
        eventsSkipped: 0,
        failedDeclarations: 0,
        syncedDeclarations: []
      };
    }

    const syncRun = await this.syncRuns.create({
      data: {
        organizationId: account.organizationId,
        integrationAccountId: account.id,
        mode
      }
    });

    try {
      const result = await this.syncOrganizationAccount(account, user, syncRun.id);
      const finishedAt = new Date();

      await this.syncRuns.update({
        where: {
          id: syncRun.id
        },
        data: {
          status: result.failedDeclarations > 0 ? 'PARTIAL' : 'SUCCEEDED',
          finishedAt,
          recordsFetched: result.recordsFetched,
          detailsFetched: result.detailsFetched,
          eventsCreated: result.eventsCreated,
          eventsSkipped: result.eventsSkipped,
          metadata: result as unknown as Prisma.InputJsonValue
        }
      });
      await this.markAccountSyncSuccess(account.id, result, finishedAt);

      return {
        syncRunId: syncRun.id,
        skipped: false,
        ...result
      };
    } catch (error) {
      await this.syncRuns.update({
        where: {
          id: syncRun.id
        },
        data: {
          status: 'FAILED',
          finishedAt: new Date(),
          errorMessage: error instanceof Error ? error.message : 'Không thể đồng bộ Cửa khẩu số.'
        }
      });
      await this.markAccountSyncFailure(account.id, error);

      throw error;
    } finally {
      await this.releaseSyncLock(account.id);
    }
  }

  private async acquireSyncLock(accountId: string) {
    const now = new Date();
    const leaseMs = this.configService.get<number>('CUA_KHAU_SO_SYNC_LEASE_MS') ?? defaultLeaseMs;
    const result = await this.prisma.integrationAccount.updateMany({
      where: {
        id: accountId,
        OR: [
          {
            syncLockExpiresAt: null
          },
          {
            syncLockExpiresAt: {
              lte: now
            }
          },
          {
            syncLockOwner: this.workerId
          }
        ]
      },
      data: {
        syncLockOwner: this.workerId,
        syncLockExpiresAt: new Date(now.getTime() + leaseMs)
      }
    });

    return result.count > 0;
  }

  private releaseSyncLock(accountId: string) {
    return this.prisma.integrationAccount.updateMany({
      where: {
        id: accountId,
        syncLockOwner: this.workerId
      },
      data: {
        syncLockOwner: null,
        syncLockExpiresAt: null
      }
    });
  }

  private async hasRecentSyncRun(accountId: string, throttleMs: number) {
    const recentRuns = await this.syncRuns.findMany({
      where: {
        integrationAccountId: accountId,
        startedAt: {
          gte: new Date(Date.now() - throttleMs)
        }
      },
      take: 1
    });

    return recentRuns.length > 0;
  }

  private async markAccountSyncSuccess(
    accountId: string,
    result: OrganizationSyncResult,
    finishedAt: Date
  ) {
    const data: Prisma.IntegrationAccountUncheckedUpdateInput = {
      status: 'ACTIVE',
      lastSyncAt: finishedAt,
      lastSuccessfulSyncAt: finishedAt,
      syncLagSeconds: result.lastObservedAt
        ? Math.max(0, Math.floor((finishedAt.getTime() - result.lastObservedAt.getTime()) / 1000))
        : 0,
      consecutiveFailures: 0,
      lastErrorAt: null,
      nextRetryAt: null,
      lastErrorMessage: null
    };

    if (result.detailsFetched > 0) {
      data.lastDetailRefreshedAt = finishedAt;
    }

    await this.prisma.integrationAccount.update({
      where: {
        id: accountId
      },
      data
    });
  }

  private async markAccountSyncFailure(accountId: string, error: unknown) {
    const account = await this.prisma.integrationAccount.findUnique({
      where: {
        id: accountId
      },
      select: {
        consecutiveFailures: true
      }
    });
    const consecutiveFailures = (account?.consecutiveFailures ?? 0) + 1;
    const backoffMs = Math.min(maxBackoffMs, 60_000 * 2 ** Math.min(consecutiveFailures - 1, 5));

    await this.prisma.integrationAccount.update({
      where: {
        id: accountId
      },
      data: {
        status: 'ERROR',
        lastErrorAt: new Date(),
        nextRetryAt: new Date(Date.now() + backoffMs),
        consecutiveFailures,
        lastErrorMessage: error instanceof Error ? error.message : 'Không thể đồng bộ Cửa khẩu số.'
      }
    });
  }

  private async resolveHealth(organizationId: string) {
    const account = await this.prisma.integrationAccount.findFirst({
      where: {
        organizationId,
        provider: 'CUA_KHAU_SO',
        displayName: integrationDisplayName,
        deletedAt: null,
        encryptedCredentials: {
          not: null
        }
      }
    });

    if (!account) {
      return {
        configured: false,
        status: 'NOT_CONFIGURED',
        freshnessLabel: 'Chưa kết nối Cửa khẩu số',
        stale: true
      };
    }

    const staleAfterMs =
      this.configService.get<number>('CUA_KHAU_SO_STALE_AFTER_MS') ?? defaultStaleAfterMs;
    const lastSuccessfulSyncAt = account.lastSuccessfulSyncAt ?? account.lastSyncAt;
    const syncAgeSeconds = lastSuccessfulSyncAt
      ? Math.floor((Date.now() - lastSuccessfulSyncAt.getTime()) / 1000)
      : undefined;
    const stale = syncAgeSeconds === undefined || syncAgeSeconds * 1000 > staleAfterMs;

    return {
      configured: true,
      status: account.status,
      freshnessLabel: this.formatFreshnessLabel(syncAgeSeconds),
      stale,
      lastSyncAt: account.lastSyncAt?.toISOString(),
      lastSuccessfulSyncAt: account.lastSuccessfulSyncAt?.toISOString(),
      lastDetailRefreshedAt: account.lastDetailRefreshedAt?.toISOString(),
      lastErrorAt: account.lastErrorAt?.toISOString(),
      nextRetryAt: account.nextRetryAt?.toISOString(),
      syncLagSeconds: account.syncLagSeconds ?? syncAgeSeconds,
      consecutiveFailures: account.consecutiveFailures,
      lastErrorMessage: account.lastErrorMessage
    };
  }

  private formatFreshnessLabel(syncAgeSeconds: number | undefined) {
    if (syncAgeSeconds === undefined) {
      return 'Chưa có lần đối chiếu thành công';
    }

    if (syncAgeSeconds < 60) {
      return 'Vừa cập nhật';
    }

    const minutes = Math.floor(syncAgeSeconds / 60);

    if (minutes < 60) {
      return `Cập nhật ${minutes} phút trước`;
    }

    return `Cập nhật ${Math.floor(minutes / 60)} giờ trước`;
  }

  private async syncDeclarationDetail(
    user: RequestUser | undefined,
    organizationId: string,
    externalId: string,
    detail: Awaited<ReturnType<CuaKhauSoService['fetchDeclarationDetail']>>,
    account: Pick<IntegrationAccount, 'id'>,
    syncRunId?: string,
    requestedTripId?: string
  ) {
    const normalizedDeclaration = this.mapper.mapCustomsDeclaration(detail);
    const normalizedSummary = this.mapper.mapSummary(detail);
    const sourceSnapshot = this.mapper.mapDetail(detail, organizationId);
    const syncedAt = new Date();
    const syncBase = await this.prisma.$transaction(async (tx) => {
      const sourceWriteData: CustomsDeclarationSourceWriteData = {
        externalId,
        normalizedSummary,
        sourceSnapshot,
        sourceObservedAt: syncedAt,
        sourceUpdatedAt: this.resolveSourceUpdatedAt(detail, syncedAt)
      };

      if (syncRunId) {
        sourceWriteData.syncRunId = syncRunId;
      }

      const declarationWriteData = this.toCustomsDeclarationWriteData(
        normalizedDeclaration,
        sourceWriteData
      );
      const declaration = await tx.customsDeclaration.upsert({
        where: {
          organizationId_declarationNumber: {
            organizationId,
            declarationNumber: normalizedDeclaration.declarationNumber
          }
        },
        update: declarationWriteData.update,
        create: {
          organizationId,
          declarationNumber: normalizedDeclaration.declarationNumber,
          ...declarationWriteData.create
        }
      });
      const assignment = await this.resolveTripSourceAssignment(tx, organizationId, detail);
      const linked = await this.resolveLinkedTrip(
        tx,
        user,
        organizationId,
        {
          id: declaration.id,
          declarationNumber: declaration.declarationNumber
        },
        normalizedDeclaration,
        assignment,
        syncedAt,
        requestedTripId
      );
      const linkedTrip = linked.trip
        ? await this.applyTripSourceAssignment(tx, linked.trip, declaration.id, assignment)
        : undefined;

      await tx.integrationAccount.update({
        where: {
          id: account.id
        },
        data: {
          lastSyncAt: syncedAt,
          status: 'ACTIVE'
        }
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId: user?.id ?? null,
          action: 'integration.cua_khau_so.sync_declaration',
          entityType: 'CustomsDeclaration',
          entityId: declaration.id,
          after: {
            externalId,
            declarationNumber: declaration.declarationNumber,
            linkedTripId: linkedTrip?.id,
            linkedBy: linked.linkedBy
          }
        }
      });

      return {
        declaration,
        linkedTrip,
        linkedBy: linked.linkedBy
      };
    });
    const recordedEvents = [] as Array<{
      id: string;
      eventType: string;
      occurredAt: Date | string;
    }>;
    const skippedEvents = [] as Array<{ eventType: string; reason: string }>;

    if (syncBase.linkedTrip) {
      const eventCandidates = this.mapper.buildEventCandidates(detail, organizationId);

      for (const candidate of eventCandidates) {
        try {
          const eventPayload = {
            eventType: candidate.eventType,
            occurredAt: candidate.occurredAt,
            source: 'CUA_KHAU_SO' as const,
            sourceRef: candidate.sourceRef,
            note: candidate.note,
            confidence: candidate.confidence,
            rawPayload: candidate.rawPayload
          } as CreateTripEventDto;
          const event = user
            ? await this.tripsService.createEvent(
                user,
                organizationId,
                syncBase.linkedTrip.id,
                eventPayload,
                candidate.idempotencyKey
              )
            : await this.tripsService.createSystemEvent(
                organizationId,
                syncBase.linkedTrip.id,
                eventPayload,
                candidate.idempotencyKey
              );

          recordedEvents.push({
            id: event.id,
            eventType: event.eventType,
            occurredAt: event.occurredAt
          });
        } catch (error) {
          if (error instanceof BadRequestException) {
            skippedEvents.push({
              eventType: candidate.eventType,
              reason: error.message
            });
            continue;
          }

          throw error;
        }
      }
    }

    if (syncBase.linkedTrip && normalizedDeclaration.status === 'APPROVED') {
      await this.markTripCompletedFromDeclaration(
        organizationId,
        syncBase.linkedTrip.id,
        normalizedDeclaration.approvedAt ?? syncedAt
      );
    }

    if (syncBase.linkedTrip) {
      await this.createCuaKhauSoOperationalNotifications(
        organizationId,
        syncBase.linkedTrip.id,
        sourceSnapshot,
        syncedAt
      );
    }

    return {
      declaration: {
        id: syncBase.declaration.id,
        ...this.mapper.mapSummary(detail)
      },
      linkedTripId: syncBase.linkedTrip?.id,
      linkedBy: syncBase.linkedBy,
      recordedEvents,
      skippedEvents,
      lastSyncAt: syncedAt.toISOString()
    };
  }

  private async markTripCompletedFromDeclaration(
    organizationId: string,
    tripId: string,
    completedAt: Date
  ) {
    await this.prisma.trip.updateMany({
      where: {
        id: tripId,
        organizationId,
        deletedAt: null,
        currentStatus: {
          notIn: [...terminalTripStatuses]
        }
      },
      data: {
        currentStatus: 'COMPLETED',
        currentStatusUpdatedAt: completedAt
      }
    });
  }

  private async createCuaKhauSoOperationalNotifications(
    organizationId: string,
    tripId: string,
    sourceSnapshot: CuaKhauSoDeclarationDetailView,
    syncedAt: Date
  ) {
    try {
      const transshipment = sourceSnapshot.transshipment;
      const laggedSince = this.parseDate(transshipment.borderGuardLaggedSince);
      const borderGuardLagAlertMs =
        this.configService.get<number>('CUA_KHAU_SO_BORDER_GUARD_LAG_ALERT_MS') ??
        defaultBorderGuardLagAlertMs;
      const sourceRef = sourceSnapshot.externalId || sourceSnapshot.declarationNumber;

      if (
        transshipment.borderGuardLagging &&
        laggedSince &&
        syncedAt.getTime() - laggedSince.getTime() >= borderGuardLagAlertMs
      ) {
        await this.notifications.createCuaKhauSoDocumentStaffNotifications(
          this.prisma,
          organizationId,
          tripId,
          {
            kind: 'cua_khau_so_border_guard_lag',
            idempotencyKey: `cua-khau-so:${organizationId}:${sourceRef}:border-guard-lag`,
            eventType: 'INSPECTION_REQUIRED',
            title: 'CBHQ đã tích xe vào, CBBP chưa xác nhận',
            message: `Tờ khai ${sourceSnapshot.declarationNumber} cần nhân viên thủ tục kiểm tra với CBBP vì quá ${Math.floor(
              borderGuardLagAlertMs / 60_000
            )} phút chưa có xác nhận Biên phòng.`,
            occurredAt: laggedSince,
            declarationNumber: sourceSnapshot.declarationNumber
          }
        );
      }

      if (transshipment.eligible) {
        await this.notifications.createCuaKhauSoDocumentStaffNotifications(
          this.prisma,
          organizationId,
          tripId,
          {
            kind: 'cua_khau_so_transshipment_ready',
            idempotencyKey: `cua-khau-so:${organizationId}:${sourceRef}:transshipment-ready`,
            eventType: 'TRANSSHIPMENT_ELIGIBLE',
            title: 'Đủ điều kiện ký sang tải',
            message: `Tờ khai ${sourceSnapshot.declarationNumber} đã đủ điều kiện ký sang tải: xe không VN và xe VN nhận sang tải đã đủ mốc BP/HQ, giấy phép đã xác nhận.`,
            occurredAt: this.parseDate(transshipment.eligibleAt) ?? syncedAt,
            declarationNumber: sourceSnapshot.declarationNumber
          }
        );
      }
    } catch {
      return;
    }
  }

  private async fetchFilteredDeclarationList(
    session: ReturnType<CuaKhauSoService['withSessionExpiry']>,
    query: ListCuaKhauSoDeclarationsQueryDto
  ) {
    const pageNumber = query.pageNumber ?? 1;
    const pageSize = query.pageSize ?? 20;
    const from =
      this.parseDate(query.from) ??
      (!query.to && !query.keyword && (!query.status || query.status === 1)
        ? this.getDefaultRecentFromDate()
        : undefined);
    const to = this.parseDate(query.to);

    if (from && to && from > to) {
      throw new BadRequestException('From date must be before to date.');
    }

    const maxPages = Math.max(
      pageNumber,
      this.configService.get<number>('CUA_KHAU_SO_LIST_MAX_PAGES') ?? 10
    );
    const externalStatus = this.toExternalListStatus(query.status);
    const filtered: CuaKhauSoDeclarationSummary[] = [];
    let sourceMessage = 'Đã tải dữ liệu Cửa khẩu số.';

    for (let sourcePage = 1; sourcePage <= maxPages; sourcePage += 1) {
      const response = await this.client.getDeclarations(session, {
        pageNumber: sourcePage,
        pageSize: filteredListPageSize,
        ...(externalStatus ? { status: externalStatus } : {}),
        ...(query.keyword ? { keyword: query.keyword.trim() } : {}),
        ...(query.direction ? { direction: query.direction } : {})
      });
      const mapped = this.mapper.mapListResponse(response);
      sourceMessage = mapped.message;

      if (mapped.declarations.length === 0) {
        break;
      }

      filtered.push(
        ...mapped.declarations.filter((declaration) =>
          this.matchesDeclarationListFilters(declaration, query, from, to)
        )
      );

      if (
        this.shouldStopScanningByFromDate(mapped.declarations, from) ||
        mapped.totalPage <= sourcePage
      ) {
        break;
      }
    }

    const startIndex = (pageNumber - 1) * pageSize;
    const totalPage = filtered.length > 0 ? Math.ceil(filtered.length / pageSize) : 0;

    return {
      declarations: filtered.slice(startIndex, startIndex + pageSize),
      totalCount: filtered.length,
      totalPage,
      message: this.buildFilteredListMessage(sourceMessage, from, to, query.status)
    };
  }

  private async fetchDeclarationDetail(
    user: RequestUser,
    organizationId: string,
    externalId: string
  ) {
    const session = await this.getSourceSession(user, organizationId);
    const response = await this.client.getDeclarationDetail(session, externalId);
    this.sessionStore.touch(organizationId, user.id, session);

    if (!response.data) {
      throw new NotFoundException('Không tìm thấy chi tiết tờ khai trên Cửa khẩu số.');
    }

    return this.enrichDeclarationDetailWithEmptyVehicleLogs(session, response.data);
  }

  private async enrichDeclarationDetailWithEmptyVehicleLogs(
    session: ReturnType<CuaKhauSoService['withSessionExpiry']>,
    detail: CuaKhauSoDeclarationDetail
  ): Promise<CuaKhauSoDeclarationDetail> {
    const changeVehicleDetails = detail.changeVehicle?.changeVehicleDetails;

    if (!changeVehicleDetails?.length) {
      return detail;
    }

    const enrichedChangeVehicleDetails = await Promise.all(
      changeVehicleDetails.map(async (changeVehicle) => {
        if (!changeVehicle.vehicleRegistrationFormId) {
          return changeVehicle;
        }

        try {
          const response = await this.client.getEmptyVehicleLog(
            session,
            changeVehicle.vehicleRegistrationFormId
          );
          const times = this.resolveEmptyVehicleLogTimes(response.data ?? []);
          const enrichedChangeVehicle = {
            ...changeVehicle
          };

          if (times.borderGuardEnteredAt) {
            enrichedChangeVehicle.emptyVehicleEnteredGateTime = times.borderGuardEnteredAt;
          }

          if (times.customsEnteredAt) {
            enrichedChangeVehicle.emptyVehicleEnteredGateCustomsTime = times.customsEnteredAt;
          }

          return enrichedChangeVehicle;
        } catch {
          return changeVehicle;
        }
      })
    );

    return {
      ...detail,
      changeVehicle: {
        ...detail.changeVehicle,
        changeVehicleDetails: enrichedChangeVehicleDetails
      }
    };
  }

  private resolveEmptyVehicleLogTimes(logs: CuaKhauSoEmptyVehicleLogItem[]) {
    let borderGuardEnteredAt: string | undefined;
    let customsEnteredAt: string | undefined;

    for (const log of logs) {
      const values = [this.parseSourceLogValue(log.value), log];

      for (const value of values) {
        borderGuardEnteredAt =
          borderGuardEnteredAt ??
          this.findSourceString(value, [
            'EnteredGateTime',
            'enteredGateTime',
            'ConfirmInGateTime',
            'checkBorderGuardTime'
          ]);
        customsEnteredAt =
          customsEnteredAt ??
          this.findSourceString(value, [
            'EnteredGateCustomsTime',
            'enteredGateCustomsTime',
            'ConfirmArrivalVehicleCustomsTime',
            'confirmArrivalVehicleCustomsTime',
            'confirmInGateTime'
          ]);
      }
    }

    return {
      borderGuardEnteredAt,
      customsEnteredAt
    };
  }

  private parseSourceLogValue(value: CuaKhauSoEmptyVehicleLogItem['value']): unknown {
    if (typeof value !== 'string') {
      return value;
    }

    try {
      return JSON.parse(value) as unknown;
    } catch {
      return undefined;
    }
  }

  private findSourceString(value: unknown, keys: string[]): string | undefined {
    if (!value || typeof value !== 'object') {
      return undefined;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        const found = this.findSourceString(item, keys);

        if (found) {
          return found;
        }
      }

      return undefined;
    }

    const record = value as Record<string, unknown>;
    const normalizedKeys = keys.map((key) => key.toLowerCase());

    for (const [key, recordValue] of Object.entries(record)) {
      if (normalizedKeys.includes(key.toLowerCase()) && typeof recordValue === 'string') {
        return recordValue;
      }

      const nested = this.findSourceString(recordValue, keys);

      if (nested) {
        return nested;
      }
    }

    return undefined;
  }

  private getRequiredSession(user: RequestUser, organizationId: string) {
    const session = this.sessionStore.get(organizationId, user.id);

    if (!session) {
      throw new UnauthorizedException('Vui lòng đăng nhập Cửa khẩu số trước khi xem dữ liệu.');
    }

    return session;
  }

  private async getSourceSession(user: RequestUser, organizationId: string) {
    const existing = this.sessionStore.get(organizationId, user.id);

    if (existing) {
      return existing;
    }

    const account = await this.getConnectedAccount(organizationId);
    const credentials = this.decryptCredentials(account.encryptedCredentials);
    const sourceSession = await this.client.login(credentials);
    this.sessionStore.save(organizationId, user.id, sourceSession);
    const storedSession = this.sessionStore.get(organizationId, user.id);

    if (!storedSession) {
      throw new UnauthorizedException('Không thể tạo phiên Cửa khẩu số từ tài khoản tổ chức.');
    }

    return storedSession;
  }

  private upsertIntegrationAccount(organizationId: string, encryptedCredentials?: string) {
    return this.prisma.integrationAccount.upsert({
      where: {
        organizationId_provider_displayName: {
          organizationId,
          provider: 'CUA_KHAU_SO',
          displayName: integrationDisplayName
        }
      },
      update: {
        status: 'ACTIVE',
        ...(encryptedCredentials ? { encryptedCredentials } : {}),
        lastErrorAt: null,
        nextRetryAt: null,
        consecutiveFailures: 0,
        lastErrorMessage: null,
        deletedAt: null,
        deletedById: null
      },
      create: {
        organizationId,
        provider: 'CUA_KHAU_SO',
        displayName: integrationDisplayName,
        status: 'ACTIVE',
        ...(encryptedCredentials ? { encryptedCredentials } : {})
      }
    });
  }

  private async getConnectedAccount(organizationId: string) {
    const account = await this.prisma.integrationAccount.findFirst({
      where: {
        organizationId,
        provider: 'CUA_KHAU_SO',
        displayName: integrationDisplayName,
        status: {
          in: ['ACTIVE', 'ERROR']
        },
        deletedAt: null,
        encryptedCredentials: {
          not: null
        }
      }
    });

    if (!account?.encryptedCredentials) {
      throw new UnauthorizedException(
        'Tổ chức chưa cấu hình tài khoản Cửa khẩu số để tự động đồng bộ.'
      );
    }

    return account as IntegrationAccount & { encryptedCredentials: string };
  }

  private async syncOrganizationAccount(
    account: Pick<IntegrationAccount, 'id' | 'organizationId' | 'encryptedCredentials'>,
    user?: RequestUser,
    syncRunId?: string
  ) {
    if (!account.encryptedCredentials) {
      throw new UnauthorizedException('Tài khoản Cửa khẩu số chưa có thông tin xác thực.');
    }

    const credentials = this.decryptCredentials(account.encryptedCredentials);
    const sourceSession = this.withSessionExpiry(await this.client.login(credentials));
    const pageSize = 50 as CuaKhauSoPageSize;
    const maxPages = Math.max(1, this.configService.get<number>('CUA_KHAU_SO_POLL_MAX_PAGES') ?? 3);
    const from = this.getDefaultRecentFromDate();
    let recordsFetched = 0;
    let detailsFetched = 0;
    let eventsCreated = 0;
    let eventsSkipped = 0;
    let failedDeclarations = 0;
    let lastObservedAt: Date | undefined;
    const syncedDeclarations: string[] = [];

    for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
      const response = await this.client.getDeclarations(sourceSession, {
        pageNumber,
        pageSize,
        status: 1
      });
      const mapped = this.mapper.mapListResponse(response);
      const declarationsInWindow = mapped.declarations.filter((declaration) =>
        this.matchesAutoSyncWindow(declaration, from)
      );
      const observedCandidates = mapped.declarations
        .map((declaration) => this.parseDate(declaration.createdAt))
        .filter((value): value is Date => value !== undefined);
      recordsFetched += mapped.declarations.length;

      if (observedCandidates.length > 0) {
        const pageLatestObservedAt = new Date(
          Math.max(...observedCandidates.map((date) => date.getTime()))
        );

        lastObservedAt =
          !lastObservedAt || pageLatestObservedAt > lastObservedAt
            ? pageLatestObservedAt
            : lastObservedAt;
      }

      await this.markSourceListScanned(account.id, account.organizationId, mapped.declarations);

      if (mapped.declarations.length === 0) {
        break;
      }

      for (const declaration of declarationsInWindow) {
        try {
          const detailResponse = await this.client.getDeclarationDetail(
            sourceSession,
            declaration.externalId
          );

          if (!detailResponse.data) {
            failedDeclarations += 1;
            continue;
          }

          const enrichedDetail = await this.enrichDeclarationDetailWithEmptyVehicleLogs(
            sourceSession,
            detailResponse.data
          );
          detailsFetched += 1;
          const result = await this.syncDeclarationDetail(
            user,
            account.organizationId,
            declaration.externalId,
            enrichedDetail,
            account,
            syncRunId
          );

          eventsCreated += result.recordedEvents.length;
          eventsSkipped += result.skippedEvents.length;
          syncedDeclarations.push(declaration.declarationNumber);
        } catch {
          failedDeclarations += 1;
        }
      }

      if (
        this.shouldStopScanningByFromDate(mapped.declarations, from) ||
        mapped.totalPage <= pageNumber
      ) {
        break;
      }
    }

    const result: OrganizationSyncResult = {
      recordsFetched,
      detailsFetched,
      eventsCreated,
      eventsSkipped,
      failedDeclarations,
      syncedDeclarations
    };

    if (lastObservedAt) {
      result.lastObservedAt = lastObservedAt;
    }

    return result;
  }

  private async resolveLinkedTrip(
    prisma: Prisma.TransactionClient,
    user: RequestUser | undefined,
    organizationId: string,
    declaration: { id: string; declarationNumber: string },
    normalizedDeclaration: CustomsDeclarationSyncData,
    assignment: TripSourceAssignment,
    syncedAt: Date,
    requestedTripId?: string
  ): Promise<{ trip?: LinkedTrip; linkedBy: LinkMode }> {
    if (requestedTripId) {
      const trip = await prisma.trip.findFirst({
        where: {
          id: requestedTripId,
          organizationId,
          deletedAt: null
        },
        select: {
          id: true,
          tripCode: true,
          customsDeclarationId: true,
          vehicleId: true,
          driverProfileId: true,
          currentStatus: true
        }
      });

      if (!trip) {
        throw new BadRequestException('Chuyến được chọn không thuộc tổ chức hiện tại.');
      }

      return {
        trip,
        linkedBy: 'requested'
      };
    }

    const linkedByDeclaration = await prisma.trip.findFirst({
      where: {
        organizationId,
        customsDeclarationId: declaration.id,
        deletedAt: null
      },
      select: {
        id: true,
        tripCode: true,
        customsDeclarationId: true,
        vehicleId: true,
        driverProfileId: true,
        currentStatus: true
      }
    });

    if (linkedByDeclaration) {
      return {
        trip: linkedByDeclaration,
        linkedBy: 'declaration'
      };
    }

    const declarationNumber = normalizedDeclaration.declarationNumber.trim();

    if (!declarationNumber) {
      return {
        linkedBy: 'none'
      };
    }

    const linkedByTripCode = await prisma.trip.findFirst({
      where: {
        organizationId,
        tripCode: declarationNumber,
        deletedAt: null
      },
      select: {
        id: true,
        tripCode: true,
        customsDeclarationId: true,
        vehicleId: true,
        driverProfileId: true,
        currentStatus: true
      }
    });

    if (!linkedByTripCode) {
      const createdTrip = await this.createTripFromDeclaration(
        prisma,
        user,
        organizationId,
        declaration.id,
        normalizedDeclaration,
        assignment,
        syncedAt
      );

      return {
        trip: createdTrip,
        linkedBy: 'created'
      };
    }

    return {
      trip: linkedByTripCode,
      linkedBy: 'tripCode'
    };
  }

  private async createTripFromDeclaration(
    prisma: Prisma.TransactionClient,
    user: RequestUser | undefined,
    organizationId: string,
    declarationId: string,
    normalizedDeclaration: CustomsDeclarationSyncData,
    assignment: TripSourceAssignment,
    syncedAt: Date
  ): Promise<LinkedTrip> {
    const tripCreateData: Prisma.TripUncheckedCreateInput = {
      organizationId,
      tripCode: normalizedDeclaration.declarationNumber.trim(),
      tripType: this.toTripType(normalizedDeclaration.declarationType),
      direction: this.toTripDirection(normalizedDeclaration.declarationType),
      customsDeclarationId: declarationId,
      currentStatus: 'PLANNED',
      currentStatusUpdatedAt: syncedAt
    };

    if (user) {
      tripCreateData.createdById = user.id;
    }

    if (normalizedDeclaration.submittedAt) {
      tripCreateData.plannedStartAt = normalizedDeclaration.submittedAt;
    }

    if (assignment.vehicleId) {
      tripCreateData.vehicleId = assignment.vehicleId;
    }

    if (assignment.driverProfileId) {
      tripCreateData.driverProfileId = assignment.driverProfileId;
    }

    const trip = await prisma.trip.create({
      data: tripCreateData,
      select: {
        id: true,
        tripCode: true,
        customsDeclarationId: true,
        vehicleId: true,
        driverProfileId: true,
        currentStatus: true
      }
    });

    await prisma.tripParticipant.create({
      data: {
        tripId: trip.id,
        organizationId,
        role: 'OWNER_ORG',
        visibilityLevel: 'FULL'
      }
    });

    if (assignment.driverUserId) {
      await prisma.tripParticipant.create({
        data: {
          tripId: trip.id,
          userId: assignment.driverUserId,
          role: 'DRIVER',
          visibilityLevel: 'OPERATIONAL'
        }
      });
    }

    await prisma.tripEvent.create({
      data: {
        tripId: trip.id,
        organizationId,
        eventType: 'TRIP_CREATED',
        eventStatus: 'RECORDED',
        source: 'SYSTEM',
        occurredAt: syncedAt,
        note: `GateSync tạo chuyến từ tờ khai Cửa khẩu số ${normalizedDeclaration.declarationNumber}.`
      }
    });

    await prisma.auditLog.create({
      data: {
        organizationId,
        actorUserId: user?.id ?? null,
        action: 'integration.cua_khau_so.create_trip',
        entityType: 'Trip',
        entityId: trip.id,
        after: {
          tripCode: trip.tripCode,
          declarationNumber: normalizedDeclaration.declarationNumber,
          customsDeclarationId: declarationId
        }
      }
    });

    return trip;
  }

  private async resolveTripSourceAssignment(
    prisma: Prisma.TransactionClient,
    organizationId: string,
    detail: CuaKhauSoDeclarationDetail
  ): Promise<TripSourceAssignment> {
    const plateCandidates = this.resolvePlateCandidates(detail);

    if (plateCandidates.length === 0) {
      return {};
    }

    const vehicle = await prisma.vehicle.findFirst({
      where: {
        organizationId,
        deletedAt: null,
        OR: plateCandidates.map((plateNumber) => ({ plateNumber }))
      },
      select: {
        id: true,
        defaultDriverId: true,
        defaultDriver: {
          select: {
            userId: true
          }
        }
      }
    });

    if (!vehicle) {
      return {};
    }

    return {
      vehicleId: vehicle.id,
      ...(vehicle.defaultDriverId ? { driverProfileId: vehicle.defaultDriverId } : {}),
      driverUserId: vehicle.defaultDriver?.userId ?? null
    };
  }

  private async applyTripSourceAssignment(
    prisma: Prisma.TransactionClient,
    trip: LinkedTrip,
    declarationId: string,
    assignment: TripSourceAssignment
  ): Promise<LinkedTrip> {
    const data: Prisma.TripUncheckedUpdateInput = {};

    if (trip.customsDeclarationId !== declarationId) {
      data.customsDeclarationId = declarationId;
    }

    if (!trip.vehicleId && assignment.vehicleId) {
      data.vehicleId = assignment.vehicleId;
    }

    if (!trip.driverProfileId && assignment.driverProfileId) {
      data.driverProfileId = assignment.driverProfileId;
    }

    const updatedTrip =
      Object.keys(data).length > 0
        ? await prisma.trip.update({
            where: {
              id: trip.id
            },
            data,
            select: {
              id: true,
              tripCode: true,
              customsDeclarationId: true,
              vehicleId: true,
              driverProfileId: true,
              currentStatus: true
            }
          })
        : trip;

    if (assignment.driverUserId) {
      const existingDriverParticipant = await prisma.tripParticipant.findFirst({
        where: {
          tripId: updatedTrip.id,
          userId: assignment.driverUserId,
          role: 'DRIVER'
        },
        select: {
          id: true
        }
      });

      if (!existingDriverParticipant) {
        await prisma.tripParticipant.create({
          data: {
            tripId: updatedTrip.id,
            userId: assignment.driverUserId,
            role: 'DRIVER',
            visibilityLevel: 'OPERATIONAL'
          }
        });
      }
    }

    return updatedTrip;
  }

  private resolvePlateCandidates(detail: CuaKhauSoDeclarationDetail) {
    const rawValues = [
      detail.licencePlateChange,
      detail.licencePlateVNTQ,
      ...(detail.changeVehicle?.changeVehicleDetails ?? []).flatMap((vehicle) => [
        vehicle.licencePlateChange,
        vehicle.licencePlate
      ]),
      ...(detail.changeVehicles ?? []).map((vehicle) => vehicle.licencePlate),
      ...(detail.registrationTransportDetails ?? []).map((vehicle) => vehicle.licencePlate),
      ...(detail.mainVehicles ?? []).map((vehicle) => vehicle.licencePlate)
    ];
    const candidates = new Set<string>();

    rawValues.forEach((value) => {
      const normalized = this.normalizePlateNumber(value);

      if (normalized) {
        candidates.add(normalized);
      }

      const compact = normalized?.replace(/-/g, '');

      if (compact) {
        candidates.add(compact);
      }
    });

    return [...candidates];
  }

  private normalizePlateNumber(value: string | null | undefined) {
    return value?.trim().replace(/\s+/g, '').toUpperCase() || undefined;
  }

  private matchesDeclarationListFilters(
    declaration: CuaKhauSoDeclarationSummary,
    query: ListCuaKhauSoDeclarationsQueryDto,
    from: Date | undefined,
    to: Date | undefined
  ) {
    if (query.status === 1 && declaration.completed) {
      return false;
    }

    if (query.status === 2 && !declaration.completed) {
      return false;
    }

    return this.isWithinDateWindow(declaration, from, to);
  }

  private matchesAutoSyncWindow(declaration: CuaKhauSoDeclarationSummary, from: Date) {
    return !declaration.completed && this.isWithinDateWindow(declaration, from, undefined);
  }

  private isWithinDateWindow(
    declaration: CuaKhauSoDeclarationSummary,
    from: Date | undefined,
    to: Date | undefined
  ) {
    const createdAt = this.parseDate(declaration.createdAt);

    if (!createdAt) {
      return true;
    }

    if (from && createdAt < from) {
      return false;
    }

    if (to && createdAt > to) {
      return false;
    }

    return true;
  }

  private shouldStopScanningByFromDate(
    declarations: CuaKhauSoDeclarationSummary[],
    from: Date | undefined
  ) {
    if (!from || declarations.length === 0) {
      return false;
    }

    return declarations.every((declaration) => {
      const createdAt = this.parseDate(declaration.createdAt);
      return createdAt ? createdAt < from : false;
    });
  }

  private toExternalListStatus(status: CuaKhauSoListStatus | undefined) {
    return status === 2 ? undefined : status;
  }

  private resolveSourceUpdatedAt(detail: CuaKhauSoDeclarationDetail, fallback: Date) {
    return (
      this.parseDate(detail.confirmFinishTime) ??
      this.parseDate(detail.paymentOfTax?.actionTime) ??
      this.parseDate(detail.paymentOfTax?.paymentDate) ??
      this.parseDate(detail.paymentOfTax?.tollDate) ??
      this.parseDate(detail.createDate) ??
      fallback
    );
  }

  private async markSourceListScanned(
    accountId: string,
    organizationId: string,
    declarations: CuaKhauSoDeclarationSummary[]
  ) {
    const observedAt = new Date();

    await this.prisma.integrationAccount.update({
      where: {
        id: accountId
      },
      data: {
        lastListScannedAt: observedAt,
        lastSyncAt: observedAt
      }
    });

    for (const declaration of declarations) {
      const sourceUpdatedAt = this.parseDate(declaration.createdAt);
      const update: Prisma.CustomsDeclarationUncheckedUpdateInput = {
        declarationType: declaration.declarationType,
        status: declaration.status,
        sourceProvider: 'CUA_KHAU_SO',
        sourceExternalId: declaration.externalId,
        sourceStatus: declaration.statusLabel,
        sourceObservedAt: observedAt,
        normalizedSummary: declaration as unknown as Prisma.InputJsonValue
      };
      const create: Prisma.CustomsDeclarationUncheckedCreateInput = {
        organizationId,
        declarationNumber: declaration.declarationNumber,
        declarationType: declaration.declarationType,
        status: declaration.status,
        sourceProvider: 'CUA_KHAU_SO',
        sourceExternalId: declaration.externalId,
        sourceStatus: declaration.statusLabel,
        sourceObservedAt: observedAt,
        normalizedSummary: declaration as unknown as Prisma.InputJsonValue
      };

      if (sourceUpdatedAt) {
        update.sourceUpdatedAt = sourceUpdatedAt;
        create.sourceUpdatedAt = sourceUpdatedAt;
        create.submittedAt = sourceUpdatedAt;
      }

      await this.prisma.customsDeclaration.upsert({
        where: {
          organizationId_declarationNumber: {
            organizationId,
            declarationNumber: declaration.declarationNumber
          }
        },
        update,
        create
      });
    }
  }

  private buildFilteredListMessage(
    sourceMessage: string,
    from: Date | undefined,
    to: Date | undefined,
    status: CuaKhauSoListStatus | undefined
  ) {
    const statusMessage =
      status === 1
        ? 'Đang ẩn các chuyến đã hoàn thành nghiệp vụ.'
        : status === 2
          ? 'Đang hiển thị các chuyến đã hoàn thành nghiệp vụ.'
          : 'Đang hiển thị theo bộ lọc hiện tại.';
    const rangeMessage =
      from || to
        ? `Khoảng ngày: ${from ? from.toISOString().slice(0, 10) : 'đầu'} - ${
            to ? to.toISOString().slice(0, 10) : 'nay'
          }.`
        : 'Không giới hạn khoảng ngày.';

    return `${sourceMessage} ${statusMessage} ${rangeMessage}`;
  }

  private getDefaultRecentFromDate() {
    return new Date(Date.now() - defaultRecentWindowDays * 24 * 60 * 60 * 1000);
  }

  private parseDate(value: string | null | undefined) {
    if (!value) {
      return undefined;
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return undefined;
    }

    return date;
  }

  private encryptCredentials(credentials: StoredCuaKhauSoCredentials) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.getCredentialEncryptionKey(), iv);
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(credentials), 'utf8'),
      cipher.final()
    ]);
    const authTag = cipher.getAuthTag();

    return `v1:${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
  }

  private decryptCredentials(encryptedCredentials: string) {
    const [version, ivBase64, authTagBase64, encryptedBase64] = encryptedCredentials.split(':');

    if (version !== 'v1' || !ivBase64 || !authTagBase64 || !encryptedBase64) {
      throw new UnauthorizedException('Thông tin xác thực Cửa khẩu số không hợp lệ.');
    }

    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.getCredentialEncryptionKey(),
      Buffer.from(ivBase64, 'base64')
    );
    decipher.setAuthTag(Buffer.from(authTagBase64, 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedBase64, 'base64')),
      decipher.final()
    ]);

    return JSON.parse(decrypted.toString('utf8')) as StoredCuaKhauSoCredentials;
  }

  private getCredentialEncryptionKey() {
    const secret =
      this.configService.get<string>('CKS_CREDENTIAL_ENCRYPTION_KEY') ??
      this.configService.get<string>('GATESYNC_CREDENTIAL_ENCRYPTION_KEY') ??
      localCredentialSecret;

    return createHash('sha256').update(secret).digest();
  }

  private withSessionExpiry(session: SourceSession) {
    return {
      ...session,
      expiresAt: new Date(Date.now() + 50 * 60 * 1000)
    };
  }

  private toTripType(declarationType: DeclarationType): TripType {
    if (declarationType === 'EXPORT') {
      return 'EXPORT_WITH_GOODS';
    }

    if (declarationType === 'IMPORT') {
      return 'IMPORT_WITH_GOODS';
    }

    return 'INTERNAL_TRANSFER';
  }

  private toTripDirection(declarationType: DeclarationType): TripDirection {
    if (declarationType === 'EXPORT' || declarationType === 'IMPORT') {
      return declarationType;
    }

    return 'UNKNOWN';
  }

  private toCustomsDeclarationWriteData(
    data: CustomsDeclarationSyncData,
    source: CustomsDeclarationSourceWriteData
  ) {
    const update: Prisma.CustomsDeclarationUncheckedUpdateInput = {
      declarationType: data.declarationType,
      status: data.status,
      sourceProvider: 'CUA_KHAU_SO',
      sourceExternalId: source.externalId,
      sourceStatus: source.normalizedSummary.statusLabel,
      sourceUpdatedAt: source.sourceUpdatedAt,
      sourceObservedAt: source.sourceObservedAt,
      lastIngestedAt: source.sourceObservedAt,
      normalizedSummary: source.normalizedSummary as unknown as Prisma.InputJsonValue,
      sourceSnapshot: source.sourceSnapshot as unknown as Prisma.InputJsonValue
    };
    const create: Omit<
      Prisma.CustomsDeclarationUncheckedCreateInput,
      'organizationId' | 'declarationNumber'
    > = {
      declarationType: data.declarationType,
      status: data.status,
      sourceProvider: 'CUA_KHAU_SO',
      sourceExternalId: source.externalId,
      sourceStatus: source.normalizedSummary.statusLabel,
      sourceUpdatedAt: source.sourceUpdatedAt,
      sourceObservedAt: source.sourceObservedAt,
      lastIngestedAt: source.sourceObservedAt,
      normalizedSummary: source.normalizedSummary as unknown as Prisma.InputJsonValue,
      sourceSnapshot: source.sourceSnapshot as unknown as Prisma.InputJsonValue
    };

    if (source.syncRunId) {
      update.latestSyncRunId = source.syncRunId;
      create.latestSyncRunId = source.syncRunId;
    }

    if (data.customsOfficeCode !== undefined) {
      update.customsOfficeCode = data.customsOfficeCode;
      create.customsOfficeCode = data.customsOfficeCode;
    }

    if (data.submittedAt !== undefined) {
      update.submittedAt = data.submittedAt;
      create.submittedAt = data.submittedAt;
    }

    if (data.approvedAt !== undefined) {
      update.approvedAt = data.approvedAt;
      create.approvedAt = data.approvedAt;
    }

    if (data.rejectedAt !== undefined) {
      update.rejectedAt = data.rejectedAt;
      create.rejectedAt = data.rejectedAt;
    }

    return {
      update,
      create
    };
  }
}
