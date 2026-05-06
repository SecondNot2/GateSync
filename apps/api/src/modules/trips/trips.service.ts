import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { RequestUser } from '../auth/request-user';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateTripEventDto } from './dto/create-trip-event.dto';
import type { CreateTripDto } from './dto/create-trip.dto';
import type { ListTripsQueryDto } from './dto/list-trips-query.dto';
import { TripOperationsService } from './trip-operations.service';
import { TripStateTransitionService } from './trip-state-transition.service';

type PrismaExecutor = Prisma.TransactionClient | PrismaService;
type DriverProfileReference = {
  id: string;
  userId: string | null;
};
type TripSourceSummary = {
  provider: 'CUA_KHAU_SO';
  declarationNumber?: string;
  gateName?: string;
  yardName?: string;
  vehiclePlate?: string;
  driverName?: string;
  paymentCompleted?: boolean;
};
type TripSourceEvent = {
  eventType: string;
  occurredAt: Date | string;
  recordedAt?: Date | string | null;
  rawPayload?: Prisma.JsonValue | null;
};

const latestTripEventsSelect = {
  eventType: true,
  occurredAt: true,
  recordedAt: true,
  rawPayload: true
} satisfies Prisma.TripEventSelect;

const tripEventPublicSelect = {
  id: true,
  tripId: true,
  organizationId: true,
  eventType: true,
  eventStatus: true,
  source: true,
  sourceRef: true,
  idempotencyKey: true,
  occurredAt: true,
  recordedAt: true,
  createdById: true,
  confidence: true,
  note: true,
  createdBy: {
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true
    }
  }
} satisfies Prisma.TripEventSelect;

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
  customsDeclaration: true,
  borderGate: true,
  yard: true,
  events: {
    orderBy: [
      {
        occurredAt: 'desc'
      },
      {
        recordedAt: 'desc'
      }
    ],
    take: 3,
    select: latestTripEventsSelect
  },
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
  events: {
    orderBy: [
      {
        occurredAt: 'desc'
      },
      {
        recordedAt: 'desc'
      }
    ],
    take: 3,
    select: latestTripEventsSelect
  },
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

const terminalTripStatuses = ['COMPLETED', 'CANCELLED'] as const;
const defaultTripWindowDays = 7;

@Injectable()
export class TripsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(TripOperationsService) private readonly operations: TripOperationsService,
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
    } else {
      where.currentStatus = {
        notIn: [...terminalTripStatuses]
      };
      where.NOT = {
        customsDeclaration: {
          is: {
            status: 'APPROVED'
          }
        }
      };
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

    if (query.cargoOwnerOrganizationId) {
      where.shipment = {
        is: {
          cargoOwnerOrganizationId: query.cargoOwnerOrganizationId
        }
      };
    }

    const plannedStartAt: Prisma.DateTimeNullableFilter = {};

    plannedStartAt.gte = query.from ? new Date(query.from) : this.getDefaultTripWindowStart();

    if (query.to) {
      plannedStartAt.lte = new Date(query.to);
    } else {
      plannedStartAt.lte = this.getDefaultTripWindowEnd();
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

    if (!query.exception) {
      findArgs.take = take;

      if (query.cursor) {
        findArgs.skip = 1;
        findArgs.cursor = { id: query.cursor };
      }
    }

    const trips = this.operations.enrichTrips(await this.prisma.trip.findMany(findArgs));
    const filteredTrips = query.exception
      ? trips.filter((trip) => this.operations.matchesExceptionFilter(trip, query.exception!))
      : trips;
    const sortedTrips = this.operations.sortTripsForOperations(filteredTrips);

    if (!query.exception) {
      return sortedTrips.map((trip) => this.toPublicTrip(trip));
    }

    const cursorIndex = query.cursor
      ? sortedTrips.findIndex((trip) => trip.id === query.cursor)
      : -1;
    const startIndex = cursorIndex >= 0 ? cursorIndex + 1 : 0;

    return sortedTrips.slice(startIndex, startIndex + take).map((trip) => this.toPublicTrip(trip));
  }

  private getDefaultTripWindowStart() {
    const date = new Date();
    date.setDate(date.getDate() - defaultTripWindowDays);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  private getDefaultTripWindowEnd() {
    const date = new Date();
    date.setHours(23, 59, 59, 999);
    return date;
  }

  private toPublicTrip<T extends object>(trip: T) {
    const tripWithSources = trip as T & {
      events?: TripSourceEvent[];
      customsDeclaration?: unknown;
    };
    const sourceSummary = this.resolveTripSourceSummary(tripWithSources);
    const publicEvents = tripWithSources.events?.map(
      ({ rawPayload: _rawPayload, ...event }) => event
    );

    return {
      ...trip,
      ...(publicEvents ? { events: publicEvents } : {}),
      ...(sourceSummary ? { sourceSummary } : {})
    };
  }

  private resolveTripSourceSummary(trip: {
    events?: TripSourceEvent[];
    customsDeclaration?: unknown;
  }): TripSourceSummary | undefined {
    const declaration = this.asRecord(trip.customsDeclaration);
    const sourcePayload = trip.events
      ?.map((event) => this.asRecord(event.rawPayload))
      .find((payload) => payload?.source === 'CUA_KHAU_SO');

    if (!declaration && !sourcePayload) {
      return undefined;
    }

    const summary: TripSourceSummary = {
      provider: 'CUA_KHAU_SO'
    };
    const declarationNumber =
      this.getString(sourcePayload, 'declarationNumber') ??
      this.getString(declaration, 'declarationNumber');
    const gateName = this.getString(sourcePayload, 'gateName');
    const yardName = this.getString(sourcePayload, 'yardName');
    const vehiclePlate = this.getString(sourcePayload, 'vehiclePlate');
    const driverName = this.getString(sourcePayload, 'driverName');
    const paymentCompleted =
      this.getBoolean(sourcePayload, 'paymentCompleted') ??
      (this.getString(declaration, 'status') === 'APPROVED' ? true : undefined);

    if (declarationNumber) {
      summary.declarationNumber = declarationNumber;
    }

    if (gateName) {
      summary.gateName = gateName;
    }

    if (yardName) {
      summary.yardName = yardName;
    }

    if (vehiclePlate) {
      summary.vehiclePlate = vehiclePlate;
    }

    if (driverName) {
      summary.driverName = driverName;
    }

    if (paymentCompleted !== undefined) {
      summary.paymentCompleted = paymentCompleted;
    }

    return summary;
  }

  private asRecord(value: unknown): Record<string, unknown> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }

    return value as Record<string, unknown>;
  }

  private getString(record: Record<string, unknown> | undefined, key: string) {
    const value = record?.[key];

    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private getBoolean(record: Record<string, unknown> | undefined, key: string) {
    const value = record?.[key];

    return typeof value === 'boolean' ? value : undefined;
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

    return this.operations.enrichTrip(trip);
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

        if (driverProfile?.userId) {
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
      ],
      select: tripEventPublicSelect
    });
  }

  async createEvent(
    user: RequestUser,
    organizationId: string,
    tripId: string,
    dto: CreateTripEventDto,
    idempotencyKeyHeader?: string
  ) {
    return this.createEventForActor(user, organizationId, tripId, dto, idempotencyKeyHeader);
  }

  async createSystemEvent(
    organizationId: string,
    tripId: string,
    dto: CreateTripEventDto,
    idempotencyKeyHeader?: string
  ) {
    return this.createEventForActor(undefined, organizationId, tripId, dto, idempotencyKeyHeader);
  }

  private async createEventForActor(
    user: RequestUser | undefined,
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
        },
        select: tripEventPublicSelect
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
          data: eventData,
          select: tripEventPublicSelect
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

        const projectedStatus = nextStatus ?? trip.currentStatus;

        await tx.auditLog.create({
          data: {
            organizationId,
            actorUserId: user?.id ?? null,
            action: 'trip_event.create',
            entityType: 'TripEvent',
            entityId: event.id,
            before: {
              currentStatus: trip.currentStatus
            },
            after: {
              tripId,
              eventType: event.eventType,
              currentStatus: projectedStatus
            }
          }
        });

        await this.createEventNotifications(tx, organizationId, tripId, event, projectedStatus);

        return event;
      });
    } catch (error) {
      if (idempotencyKey && this.isUniqueConstraintError(error, 'idempotencyKey')) {
        const existingEvent = await this.prisma.tripEvent.findUnique({
          where: {
            idempotencyKey
          },
          select: tripEventPublicSelect
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
          organizationId,
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
    user: RequestUser | undefined,
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
      occurredAt: new Date(dto.occurredAt)
    };

    if (user) {
      data.createdById = user.id;
    }

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

  private async createEventNotifications(
    prisma: PrismaExecutor,
    organizationId: string,
    tripId: string,
    event: { id: string; eventType: string; occurredAt: Date },
    currentStatus: string
  ) {
    await this.notifications.createTripEventNotifications(
      prisma,
      organizationId,
      tripId,
      event,
      currentStatus
    );
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
