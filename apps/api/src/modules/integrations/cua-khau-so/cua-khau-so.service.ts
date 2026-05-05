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
  TripDirection,
  TripType
} from '@prisma/client';
import type { RequestUser } from '../../auth/request-user';
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
  CuaKhauSoDeclarationSummary,
  CuaKhauSoListStatus,
  CuaKhauSoPageSize
} from './cua-khau-so.types';

type LinkedTrip = {
  id: string;
  tripCode: string;
  customsDeclarationId: string | null;
  vehicleId: string | null;
  driverProfileId: string | null;
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
type StoredCuaKhauSoCredentials = {
  username: string;
  password: string;
};
type SourceSession = {
  accessToken: string;
  refreshCookies: string[];
  username: string;
};
type IntegrationSyncRunDelegate = {
  create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
  update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
  findMany(args: Record<string, unknown>): Promise<unknown>;
};
type PrismaWithIntegrationSyncRun = PrismaService & {
  integrationSyncRun: IntegrationSyncRunDelegate;
};

const integrationDisplayName = 'Cửa khẩu số';
const localCredentialSecret = 'gatesync-local-development-secret';
const defaultRecentWindowDays = 7;
const filteredListPageSize: CuaKhauSoPageSize = 100;

@Injectable()
export class CuaKhauSoService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(CuaKhauSoClient) private readonly client: CuaKhauSoClient,
    @Inject(CuaKhauSoMapper) private readonly mapper: CuaKhauSoMapper,
    @Inject(CuaKhauSoSessionStore) private readonly sessionStore: CuaKhauSoSessionStore,
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
        status: 'ACTIVE',
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
    const session = await this.getSourceSession(user, organizationId);
    const result = await this.fetchFilteredDeclarationList(session, query);
    this.sessionStore.touch(organizationId, user.id, session);
    return result;
  }

  async getDeclaration(user: RequestUser, organizationId: string, externalId: string) {
    const detail = await this.fetchDeclarationDetail(user, organizationId, externalId);
    return this.mapper.mapDetail(detail, organizationId);
  }

  async getProcedureSteps(user: RequestUser, organizationId: string, externalId: string) {
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
      dto.tripId
    );
  }

  async runSyncNow(user: RequestUser, organizationId: string) {
    const account = await this.getConnectedAccount(organizationId);
    const syncRun = await this.syncRuns.create({
      data: {
        organizationId,
        integrationAccountId: account.id,
        mode: 'MANUAL'
      }
    });

    try {
      const result = await this.syncOrganizationAccount(account, user);

      await this.syncRuns.update({
        where: {
          id: syncRun.id
        },
        data: {
          status: result.failedDeclarations > 0 ? 'PARTIAL' : 'SUCCEEDED',
          finishedAt: new Date(),
          recordsFetched: result.recordsFetched,
          detailsFetched: result.detailsFetched,
          eventsCreated: result.eventsCreated,
          eventsSkipped: result.eventsSkipped,
          metadata: result as unknown as Prisma.InputJsonValue
        }
      });

      return {
        syncRunId: syncRun.id,
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

      throw error;
    }
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

  async pollActiveAccounts() {
    const accounts = await this.prisma.integrationAccount.findMany({
      where: {
        provider: 'CUA_KHAU_SO',
        displayName: integrationDisplayName,
        status: 'ACTIVE',
        deletedAt: null,
        encryptedCredentials: {
          not: null
        }
      }
    });
    const results = [] as Array<{ organizationId: string; syncRunId?: string; status: string }>;

    for (const account of accounts) {
      const syncRun = await this.syncRuns.create({
        data: {
          organizationId: account.organizationId,
          integrationAccountId: account.id,
          mode: 'AUTO'
        }
      });

      try {
        const result = await this.syncOrganizationAccount(account);

        await this.syncRuns.update({
          where: {
            id: syncRun.id
          },
          data: {
            status: result.failedDeclarations > 0 ? 'PARTIAL' : 'SUCCEEDED',
            finishedAt: new Date(),
            recordsFetched: result.recordsFetched,
            detailsFetched: result.detailsFetched,
            eventsCreated: result.eventsCreated,
            eventsSkipped: result.eventsSkipped,
            metadata: result as unknown as Prisma.InputJsonValue
          }
        });

        results.push({
          organizationId: account.organizationId,
          syncRunId: syncRun.id,
          status: result.failedDeclarations > 0 ? 'PARTIAL' : 'SUCCEEDED'
        });
      } catch (error) {
        await this.prisma.integrationAccount.update({
          where: {
            id: account.id
          },
          data: {
            status: 'ERROR'
          }
        });
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

        results.push({
          organizationId: account.organizationId,
          syncRunId: syncRun.id,
          status: 'FAILED'
        });
      }
    }

    return {
      accountsProcessed: accounts.length,
      results
    };
  }

  private async syncDeclarationDetail(
    user: RequestUser | undefined,
    organizationId: string,
    externalId: string,
    detail: Awaited<ReturnType<CuaKhauSoService['fetchDeclarationDetail']>>,
    account: Pick<IntegrationAccount, 'id'>,
    requestedTripId?: string
  ) {
    const normalizedDeclaration = this.mapper.mapCustomsDeclaration(detail);
    const syncedAt = new Date();
    const syncBase = await this.prisma.$transaction(async (tx) => {
      const declarationWriteData = this.toCustomsDeclarationWriteData(normalizedDeclaration);
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

    return response.data;
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
        status: 'ACTIVE',
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
    user?: RequestUser
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
      recordsFetched += mapped.declarations.length;

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

          detailsFetched += 1;
          const result = await this.syncDeclarationDetail(
            user,
            account.organizationId,
            declaration.externalId,
            detailResponse.data,
            account
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

    return {
      recordsFetched,
      detailsFetched,
      eventsCreated,
      eventsSkipped,
      failedDeclarations,
      syncedDeclarations
    };
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
          driverProfileId: true
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
        driverProfileId: true
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
        driverProfileId: true
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
        driverProfileId: true
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
              driverProfileId: true
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
    return this.isWithinDateWindow(declaration, from, undefined);
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

  private toCustomsDeclarationWriteData(data: CustomsDeclarationSyncData) {
    const update: Prisma.CustomsDeclarationUncheckedUpdateInput = {
      declarationType: data.declarationType,
      status: data.status
    };
    const create: Omit<
      Prisma.CustomsDeclarationUncheckedCreateInput,
      'organizationId' | 'declarationNumber'
    > = {
      declarationType: data.declarationType,
      status: data.status
    };

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
