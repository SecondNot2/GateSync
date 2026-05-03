import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { RequestUser } from '../auth/request-user';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateTripEventDto } from './dto/create-trip-event.dto';
import type { CreateTripDto } from './dto/create-trip.dto';
import type { ListTripsQueryDto } from './dto/list-trips-query.dto';
import { TripStateTransitionService } from './trip-state-transition.service';

type PrismaExecutor = Prisma.TransactionClient | PrismaService;
type DriverProfileReference = {
  id: string;
  userId: string;
};

const tripSummaryInclude = {
  vehicle: true,
  driverProfile: {
    include: {
      user: {
        select: {
          id: true,
          fullName: true,
          email: true,
          phone: true
        }
      }
    }
  },
  borderGate: true,
  yard: true,
  _count: {
    select: {
      events: true,
      participants: true
    }
  }
} satisfies Prisma.TripInclude;

const tripDetailInclude = {
  vehicle: true,
  driverProfile: {
    include: {
      user: {
        select: {
          id: true,
          fullName: true,
          email: true,
          phone: true
        }
      }
    }
  },
  shipment: true,
  customsDeclaration: true,
  borderGate: true,
  yard: true,
  participants: {
    orderBy: {
      createdAt: 'asc'
    },
    select: {
      id: true,
      role: true,
      visibilityLevel: true,
      organizationId: true,
      userId: true,
      createdAt: true,
      organization: {
        select: {
          id: true,
          name: true,
          type: true
        }
      },
      user: {
        select: {
          id: true,
          fullName: true,
          email: true,
          phone: true
        }
      }
    }
  }
} satisfies Prisma.TripInclude;

@Injectable()
export class TripsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TripStateTransitionService) private readonly transitions: TripStateTransitionService
  ) {}

  async listTrips(organizationId: string, query: ListTripsQueryDto) {
    const take = query.limit ?? 50;
    const where: Prisma.TripWhereInput = {
      organizationId,
      deletedAt: null
    };

    if (query.status) {
      where.currentStatus = query.status;
    }

    if (query.borderGateId) {
      where.borderGateId = query.borderGateId;
    }

    if (query.yardId) {
      where.yardId = query.yardId;
    }

    if (query.driverProfileId) {
      where.driverProfileId = query.driverProfileId;
    }

    if (query.vehicleId) {
      where.vehicleId = query.vehicleId;
    }

    const plannedStartAt: Prisma.DateTimeNullableFilter = {};

    if (query.from) {
      plannedStartAt.gte = new Date(query.from);
    }

    if (query.to) {
      plannedStartAt.lte = new Date(query.to);
    }

    if (plannedStartAt.gte || plannedStartAt.lte) {
      if (plannedStartAt.gte && plannedStartAt.lte && plannedStartAt.gte > plannedStartAt.lte) {
        throw new BadRequestException('From date must be before to date.');
      }

      where.plannedStartAt = plannedStartAt;
    }

    const search = query.search?.trim();

    if (search) {
      const containsSearch = {
        contains: search,
        mode: Prisma.QueryMode.insensitive
      };

      where.OR = [
        {
          tripCode: containsSearch
        },
        {
          vehicle: {
            is: {
              plateNumber: containsSearch
            }
          }
        },
        {
          driverProfile: {
            is: {
              phone: containsSearch
            }
          }
        },
        {
          driverProfile: {
            is: {
              user: {
                fullName: containsSearch
              }
            }
          }
        },
        {
          driverProfile: {
            is: {
              user: {
                phone: containsSearch
              }
            }
          }
        },
        {
          borderGate: {
            is: {
              name: containsSearch
            }
          }
        },
        {
          yard: {
            is: {
              name: containsSearch
            }
          }
        }
      ];
    }

    const findArgs: Prisma.TripFindManyArgs = {
      where,
      take,
      include: tripSummaryInclude,
      orderBy: [
        {
          plannedStartAt: 'desc'
        },
        {
          createdAt: 'desc'
        }
      ]
    };

    if (query.cursor) {
      findArgs.skip = 1;
      findArgs.cursor = { id: query.cursor };
    }

    return this.prisma.trip.findMany(findArgs);
  }

  async getTrip(organizationId: string, tripId: string) {
    const trip = await this.prisma.trip.findFirst({
      where: {
        id: tripId,
        organizationId,
        deletedAt: null
      },
      include: tripDetailInclude
    });

    if (!trip) {
      throw new NotFoundException('Trip was not found.');
    }

    return trip;
  }

  async createTrip(user: RequestUser, organizationId: string, dto: CreateTripDto) {
    const occurredAt = new Date();

    try {
      return await this.prisma.$transaction(async (tx) => {
        const driverProfile = await this.assertTripReferences(tx, organizationId, dto);
        const trip = await tx.trip.create({
          data: this.toTripCreateData(user, organizationId, dto, occurredAt)
        });

        await tx.tripParticipant.create({
          data: {
            tripId: trip.id,
            organizationId,
            role: 'OWNER_ORG',
            visibilityLevel: 'FULL'
          }
        });

        if (driverProfile) {
          await tx.tripParticipant.create({
            data: {
              tripId: trip.id,
              userId: driverProfile.userId,
              role: 'DRIVER',
              visibilityLevel: 'OPERATIONAL'
            }
          });
        }

        await tx.tripEvent.create({
          data: {
            tripId: trip.id,
            organizationId,
            eventType: 'TRIP_CREATED',
            eventStatus: 'RECORDED',
            source: 'SYSTEM',
            occurredAt,
            createdById: user.id,
            note: `Trip ${trip.tripCode} was created.`
          }
        });

        await tx.auditLog.create({
          data: {
            organizationId,
            actorUserId: user.id,
            action: 'trip.create',
            entityType: 'Trip',
            entityId: trip.id,
            after: {
              tripCode: trip.tripCode,
              tripType: trip.tripType,
              direction: trip.direction,
              currentStatus: trip.currentStatus
            }
          }
        });

        return tx.trip.findUniqueOrThrow({
          where: {
            id: trip.id
          },
          include: tripDetailInclude
        });
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error, 'tripCode')) {
        throw new ConflictException('Trip code already exists in this organization.');
      }

      throw error;
    }
  }

  async listEvents(organizationId: string, tripId: string) {
    await this.assertTripExists(this.prisma, organizationId, tripId);

    return this.prisma.tripEvent.findMany({
      where: {
        organizationId,
        tripId
      },
      orderBy: [
        {
          occurredAt: 'asc'
        },
        {
          recordedAt: 'asc'
        }
      ]
    });
  }

  async createEvent(
    user: RequestUser,
    organizationId: string,
    tripId: string,
    dto: CreateTripEventDto,
    idempotencyKeyHeader?: string
  ) {
    if (dto.eventType === 'TRIP_CREATED') {
      throw new BadRequestException('TRIP_CREATED is generated only when a trip is created.');
    }

    const idempotencyKey = this.normalizeIdempotencyKey(idempotencyKeyHeader);

    if (idempotencyKey) {
      const existingEvent = await this.prisma.tripEvent.findUnique({
        where: {
          idempotencyKey
        }
      });

      if (existingEvent) {
        if (existingEvent.organizationId === organizationId && existingEvent.tripId === tripId) {
          return existingEvent;
        }

        throw new ConflictException('Idempotency key was already used.');
      }
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const trip = await this.assertTripExists(tx, organizationId, tripId);
        const nextStatus = this.transitions.assertCanApplyEvent(trip.currentStatus, dto.eventType);
        const eventData = this.toTripEventCreateData(
          user,
          organizationId,
          tripId,
          dto,
          idempotencyKey
        );
        const event = await tx.tripEvent.create({
          data: eventData
        });

        if (nextStatus) {
          await tx.trip.update({
            where: {
              id: tripId
            },
            data: {
              currentStatus: nextStatus,
              currentStatusUpdatedAt: event.occurredAt
            }
          });
        }

        await tx.auditLog.create({
          data: {
            organizationId,
            actorUserId: user.id,
            action: 'trip_event.create',
            entityType: 'TripEvent',
            entityId: event.id,
            before: {
              currentStatus: trip.currentStatus
            },
            after: {
              tripId,
              eventType: event.eventType,
              currentStatus: nextStatus ?? trip.currentStatus
            }
          }
        });

        return event;
      });
    } catch (error) {
      if (idempotencyKey && this.isUniqueConstraintError(error, 'idempotencyKey')) {
        const existingEvent = await this.prisma.tripEvent.findUnique({
          where: {
            idempotencyKey
          }
        });

        if (existingEvent?.organizationId === organizationId && existingEvent.tripId === tripId) {
          return existingEvent;
        }

        throw new ConflictException('Idempotency key was already used.');
      }

      throw error;
    }
  }

  private async assertTripReferences(
    prisma: PrismaExecutor,
    organizationId: string,
    dto: CreateTripDto
  ): Promise<DriverProfileReference | undefined> {
    if (dto.vehicleId) {
      const vehicle = await prisma.vehicle.findFirst({
        where: {
          id: dto.vehicleId,
          organizationId,
          deletedAt: null
        },
        select: {
          id: true
        }
      });

      if (!vehicle) {
        throw new BadRequestException('Vehicle was not found in this organization.');
      }
    }

    let driverProfile: DriverProfileReference | undefined;

    if (dto.driverProfileId) {
      const foundDriverProfile = await prisma.driverProfile.findFirst({
        where: {
          id: dto.driverProfileId,
          deletedAt: null
        },
        select: {
          id: true,
          userId: true
        }
      });

      if (!foundDriverProfile) {
        throw new BadRequestException('Driver profile was not found.');
      }

      driverProfile = foundDriverProfile;
    }

    if (dto.shipmentId) {
      const shipment = await prisma.shipment.findFirst({
        where: {
          id: dto.shipmentId,
          organizationId
        },
        select: {
          id: true
        }
      });

      if (!shipment) {
        throw new BadRequestException('Shipment was not found in this organization.');
      }
    }

    if (dto.customsDeclarationId) {
      const customsDeclaration = await prisma.customsDeclaration.findFirst({
        where: {
          id: dto.customsDeclarationId,
          organizationId
        },
        select: {
          id: true
        }
      });

      if (!customsDeclaration) {
        throw new BadRequestException('Customs declaration was not found in this organization.');
      }
    }

    if (dto.borderGateId) {
      const borderGate = await prisma.borderGate.findFirst({
        where: {
          id: dto.borderGateId,
          isActive: true
        },
        select: {
          id: true
        }
      });

      if (!borderGate) {
        throw new BadRequestException('Border gate was not found.');
      }
    }

    if (dto.yardId) {
      const yard = await prisma.yard.findFirst({
        where: {
          id: dto.yardId,
          isActive: true
        },
        select: {
          id: true,
          borderGateId: true
        }
      });

      if (!yard) {
        throw new BadRequestException('Yard was not found.');
      }

      if (dto.borderGateId && yard.borderGateId !== dto.borderGateId) {
        throw new BadRequestException('Yard does not belong to the selected border gate.');
      }
    }

    return driverProfile;
  }

  private async assertTripExists(prisma: PrismaExecutor, organizationId: string, tripId: string) {
    const trip = await prisma.trip.findFirst({
      where: {
        id: tripId,
        organizationId,
        deletedAt: null
      },
      select: {
        id: true,
        currentStatus: true
      }
    });

    if (!trip) {
      throw new NotFoundException('Trip was not found.');
    }

    return trip;
  }

  private toTripCreateData(
    user: RequestUser,
    organizationId: string,
    dto: CreateTripDto,
    occurredAt: Date
  ): Prisma.TripUncheckedCreateInput {
    const data: Prisma.TripUncheckedCreateInput = {
      organizationId,
      tripCode: dto.tripCode.trim(),
      tripType: dto.tripType,
      direction: dto.direction ?? 'UNKNOWN',
      currentStatus: 'PLANNED',
      currentStatusUpdatedAt: occurredAt,
      createdById: user.id
    };

    if (dto.vehicleId) {
      data.vehicleId = dto.vehicleId;
    }

    if (dto.driverProfileId) {
      data.driverProfileId = dto.driverProfileId;
    }

    if (dto.shipmentId) {
      data.shipmentId = dto.shipmentId;
    }

    if (dto.customsDeclarationId) {
      data.customsDeclarationId = dto.customsDeclarationId;
    }

    if (dto.borderGateId) {
      data.borderGateId = dto.borderGateId;
    }

    if (dto.yardId) {
      data.yardId = dto.yardId;
    }

    if (dto.plannedStartAt) {
      data.plannedStartAt = new Date(dto.plannedStartAt);
    }

    if (dto.plannedArrivalAt) {
      data.plannedArrivalAt = new Date(dto.plannedArrivalAt);
    }

    return data;
  }

  private toTripEventCreateData(
    user: RequestUser,
    organizationId: string,
    tripId: string,
    dto: CreateTripEventDto,
    idempotencyKey: string | undefined
  ): Prisma.TripEventUncheckedCreateInput {
    const data: Prisma.TripEventUncheckedCreateInput = {
      tripId,
      organizationId,
      eventType: dto.eventType,
      eventStatus: 'RECORDED',
      source: dto.source ?? 'MANUAL',
      occurredAt: new Date(dto.occurredAt),
      createdById: user.id
    };

    if (idempotencyKey) {
      data.idempotencyKey = idempotencyKey;
    }

    if (dto.sourceRef) {
      data.sourceRef = dto.sourceRef;
    }

    if (dto.note) {
      data.note = dto.note;
    }

    if (dto.confidence !== undefined) {
      data.confidence = dto.confidence;
    }

    if (dto.rawPayload) {
      data.rawPayload = dto.rawPayload as Prisma.InputJsonValue;
    }

    return data;
  }

  private normalizeIdempotencyKey(value: string | undefined): string | undefined {
    const normalized = value?.trim();

    if (!normalized) {
      return undefined;
    }

    if (normalized.length > 200) {
      throw new BadRequestException('Idempotency-Key must be at most 200 characters.');
    }

    return normalized;
  }

  private isUniqueConstraintError(error: unknown, field: string): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
      return false;
    }

    const target = error.meta?.target;

    if (Array.isArray(target)) {
      return target.includes(field);
    }

    return typeof target === 'string' && target.includes(field);
  }
}
