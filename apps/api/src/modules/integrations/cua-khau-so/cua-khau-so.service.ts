import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from '@nestjs/common';
import type { DeclarationStatus, DeclarationType, Prisma } from '@prisma/client';
import type { RequestUser } from '../../auth/request-user';
import { PrismaService } from '../../prisma/prisma.service';
import { TripsService } from '../../trips/trips.service';
import { CuaKhauSoClient } from './cua-khau-so.client';
import { CuaKhauSoMapper } from './cua-khau-so.mapper';
import { CuaKhauSoSessionStore } from './cua-khau-so-session.store';
import type { CuaKhauSoLoginDto } from './dto/cua-khau-so-login.dto';
import type { ListCuaKhauSoDeclarationsQueryDto } from './dto/list-cua-khau-so-declarations-query.dto';
import type { SyncCuaKhauSoDeclarationDto } from './dto/sync-cua-khau-so-declaration.dto';

type LinkedTrip = {
  id: string;
  tripCode: string;
  customsDeclarationId: string | null;
};

const integrationDisplayName = 'Cửa khẩu số';

@Injectable()
export class CuaKhauSoService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CuaKhauSoClient) private readonly client: CuaKhauSoClient,
    @Inject(CuaKhauSoMapper) private readonly mapper: CuaKhauSoMapper,
    @Inject(CuaKhauSoSessionStore) private readonly sessionStore: CuaKhauSoSessionStore,
    @Inject(TripsService) private readonly tripsService: TripsService
  ) {}

  async connect(user: RequestUser, organizationId: string, dto: CuaKhauSoLoginDto) {
    const sourceSession = await this.client.login({
      username: dto.username.trim(),
      password: dto.password
    });
    const summary = this.sessionStore.save(organizationId, user.id, sourceSession);
    const account = await this.upsertIntegrationAccount(organizationId);

    await this.prisma.auditLog.create({
      data: {
        organizationId,
        actorUserId: user.id,
        action: 'integration.cua_khau_so.connect',
        entityType: 'IntegrationAccount',
        entityId: account.id,
        after: {
          provider: 'CUA_KHAU_SO',
          displayName: integrationDisplayName,
          username: dto.username.trim()
        }
      }
    });

    return summary;
  }

  getSession(user: RequestUser, organizationId: string) {
    return this.sessionStore.getSummary(organizationId, user.id);
  }

  async listDeclarations(
    user: RequestUser,
    organizationId: string,
    query: ListCuaKhauSoDeclarationsQueryDto
  ) {
    const session = this.getRequiredSession(user, organizationId);
    const response = await this.client.getDeclarations(session, query.toExternalParams());
    this.sessionStore.touch(organizationId, user.id, session);
    return this.mapper.mapListResponse(response);
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
    const normalizedDeclaration = this.mapper.mapCustomsDeclaration(detail);
    const account = await this.upsertIntegrationAccount(organizationId);
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
      const linked = await this.resolveLinkedTrip(
        tx,
        organizationId,
        declaration.id,
        detail,
        dto.tripId
      );

      if (linked.trip && linked.trip.customsDeclarationId !== declaration.id) {
        await tx.trip.update({
          where: {
            id: linked.trip.id
          },
          data: {
            customsDeclarationId: declaration.id
          }
        });
      }

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
          actorUserId: user.id,
          action: 'integration.cua_khau_so.sync_declaration',
          entityType: 'CustomsDeclaration',
          entityId: declaration.id,
          after: {
            externalId,
            declarationNumber: declaration.declarationNumber,
            linkedTripId: linked.trip?.id,
            linkedBy: linked.linkedBy
          }
        }
      });

      return {
        declaration,
        linkedTrip: linked.trip,
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
          const event = await this.tripsService.createEvent(
            user,
            organizationId,
            syncBase.linkedTrip.id,
            {
              eventType: candidate.eventType,
              occurredAt: candidate.occurredAt,
              source: 'CUA_KHAU_SO',
              sourceRef: candidate.sourceRef,
              note: candidate.note,
              confidence: candidate.confidence,
              rawPayload: candidate.rawPayload
            },
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

  private async fetchDeclarationDetail(
    user: RequestUser,
    organizationId: string,
    externalId: string
  ) {
    const session = this.getRequiredSession(user, organizationId);
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

  private upsertIntegrationAccount(organizationId: string) {
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
        deletedAt: null,
        deletedById: null
      },
      create: {
        organizationId,
        provider: 'CUA_KHAU_SO',
        displayName: integrationDisplayName,
        status: 'ACTIVE'
      }
    });
  }

  private async resolveLinkedTrip(
    prisma: Prisma.TransactionClient,
    organizationId: string,
    declarationId: string,
    detail: { numberOfDeclaration?: string | null },
    requestedTripId?: string
  ): Promise<{ trip?: LinkedTrip; linkedBy: 'requested' | 'declaration' | 'tripCode' | 'none' }> {
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
          customsDeclarationId: true
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
        customsDeclarationId: declarationId,
        deletedAt: null
      },
      select: {
        id: true,
        tripCode: true,
        customsDeclarationId: true
      }
    });

    if (linkedByDeclaration) {
      return {
        trip: linkedByDeclaration,
        linkedBy: 'declaration'
      };
    }

    const declarationNumber = detail.numberOfDeclaration?.trim();

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
        customsDeclarationId: true
      }
    });

    if (!linkedByTripCode) {
      return {
        linkedBy: 'none'
      };
    }

    return {
      trip: linkedByTripCode,
      linkedBy: 'tripCode'
    };
  }

  private toCustomsDeclarationWriteData(data: {
    declarationType: DeclarationType;
    customsOfficeCode?: string;
    status: DeclarationStatus;
    submittedAt?: Date;
    approvedAt?: Date;
    rejectedAt?: Date;
  }) {
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
