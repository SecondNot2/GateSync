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
import { TripsService } from '../trips/trips.service';
import type { CreateTripEventDto } from '../trips/dto/create-trip-event.dto';
import type { CreateDriverDto } from './dto/create-driver.dto';
import type { CreateDriverTripMediaDto } from './dto/create-driver-trip-media.dto';
import type { UpdateDriverDto } from './dto/update-driver.dto';

const defaultDriverTripWindowDays = 7;

type DriverTripSourceSummary = {
  provider: 'CUA_KHAU_SO';
  declarationNumber?: string;
  gateName?: string;
  yardName?: string;
  vehiclePlate?: string;
  driverName?: string;
  paymentCompleted?: boolean;
};

type DriverTripSourceEvent = {
  rawPayload?: Prisma.JsonValue | null;
};

const driverInclude = {
  user: {
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true
    }
  },
  vehicles: {
    where: {
      deletedAt: null
    },
    select: {
      id: true,
      plateNumber: true,
      vehicleType: true,
      ownershipType: true
    },
    orderBy: {
      plateNumber: 'asc'
    }
  },
  _count: {
    select: {
      trips: true,
      vehicles: true
    }
  }
} satisfies Prisma.DriverProfileInclude;

type TripMediaAttachmentDelegate = {
  create(args: {
    data: Record<string, unknown>;
    include?: Record<string, unknown>;
  }): Promise<unknown>;
};

type PrismaWithTripMedia = PrismaService & {
  tripMediaAttachment: TripMediaAttachmentDelegate;
};

@Injectable()
export class DriversService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TripsService) private readonly tripsService: TripsService
  ) {}

  listDrivers(organizationId: string) {
    return this.prisma.driverProfile.findMany({
      where: {
        organizationId,
        deletedAt: null
      },
      include: driverInclude,
      orderBy: [
        {
          displayName: 'asc'
        },
        {
          createdAt: 'asc'
        }
      ]
    });
  }

  async createDriver(user: RequestUser, organizationId: string, dto: CreateDriverDto) {
    const data = await this.toDriverCreateData(organizationId, dto);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const driver = await tx.driverProfile.create({
          data,
          include: driverInclude
        });

        await tx.auditLog.create({
          data: {
            organizationId,
            actorUserId: user.id,
            action: 'driver.create',
            entityType: 'DriverProfile',
            entityId: driver.id,
            after: this.toAuditSnapshot(driver)
          }
        });

        return driver;
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error, 'userId')) {
        throw new ConflictException('This user is already linked to a driver profile.');
      }

      throw error;
    }
  }

  async updateDriver(
    user: RequestUser,
    organizationId: string,
    driverProfileId: string,
    dto: UpdateDriverDto
  ) {
    if (
      dto.displayName === undefined &&
      dto.phone === undefined &&
      dto.licenseNumber === undefined &&
      dto.userId === undefined
    ) {
      throw new BadRequestException('At least one driver field must be provided.');
    }

    const existingDriver = await this.findDriverOrThrow(organizationId, driverProfileId);
    const data = await this.toDriverUpdateData(organizationId, dto);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const driver = await tx.driverProfile.update({
          where: {
            id: driverProfileId
          },
          data,
          include: driverInclude
        });

        await tx.auditLog.create({
          data: {
            organizationId,
            actorUserId: user.id,
            action: 'driver.update',
            entityType: 'DriverProfile',
            entityId: driverProfileId,
            before: this.toAuditSnapshot(existingDriver),
            after: this.toAuditSnapshot(driver)
          }
        });

        return driver;
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error, 'userId')) {
        throw new ConflictException('This user is already linked to a driver profile.');
      }

      throw error;
    }
  }

  async deleteDriver(user: RequestUser, organizationId: string, driverProfileId: string) {
    const existingDriver = await this.findDriverOrThrow(organizationId, driverProfileId);

    await this.prisma.$transaction(async (tx) => {
      await tx.driverProfile.update({
        where: {
          id: driverProfileId
        },
        data: {
          deletedAt: new Date(),
          deletedById: user.id
        }
      });

      await tx.vehicle.updateMany({
        where: {
          organizationId,
          defaultDriverId: driverProfileId,
          deletedAt: null
        },
        data: {
          defaultDriverId: null
        }
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId: user.id,
          action: 'driver.delete',
          entityType: 'DriverProfile',
          entityId: driverProfileId,
          before: this.toAuditSnapshot(existingDriver)
        }
      });
    });

    return {
      id: driverProfileId,
      deleted: true
    };
  }

  async listAssignedTripsForDriver(user: RequestUser) {
    const windowStart = this.getDefaultDriverTripWindowStart();
    const windowEnd = this.getDefaultDriverTripWindowEnd();
    const driverProfiles = await this.prisma.driverProfile.findMany({
      where: {
        userId: user.id,
        deletedAt: null
      },
      select: {
        id: true
      }
    });
    const driverProfileIds = driverProfiles.map((profile) => profile.id);

    const trips = await this.prisma.trip.findMany({
      where: {
        deletedAt: null,
        currentStatus: {
          notIn: ['COMPLETED', 'CANCELLED']
        },
        NOT: {
          customsDeclaration: {
            is: {
              status: 'APPROVED'
            }
          }
        },
        plannedStartAt: {
          gte: windowStart,
          lte: windowEnd
        },
        OR: [
          {
            driverProfileId: {
              in: driverProfileIds
            }
          },
          {
            participants: {
              some: {
                userId: user.id,
                role: 'DRIVER'
              }
            }
          },
          {
            vehicle: {
              is: {
                defaultDriverId: {
                  in: driverProfileIds
                },
                deletedAt: null
              }
            }
          }
        ]
      },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            type: true
          }
        },
        vehicle: true,
        driverProfile: true,
        borderGate: true,
        yard: true,
        customsDeclaration: true,
        events: {
          orderBy: [
            {
              occurredAt: 'desc'
            },
            {
              recordedAt: 'desc'
            }
          ],
          take: 10,
          select: {
            eventType: true,
            occurredAt: true,
            recordedAt: true,
            rawPayload: true
          }
        }
      },
      orderBy: [
        {
          currentStatusUpdatedAt: 'desc'
        },
        {
          plannedStartAt: 'desc'
        },
        {
          createdAt: 'desc'
        }
      ],
      take: 1
    });

    return trips.map((trip) => this.toPublicDriverTrip(trip));
  }

  async createDriverTripMedia(user: RequestUser, tripId: string, dto: CreateDriverTripMediaDto) {
    if (!dto.storagePath && !dto.publicUrl) {
      throw new BadRequestException(
        'Media must include a Supabase storage path or accessible URL.'
      );
    }

    const trip = await this.prisma.trip.findFirst({
      where: {
        id: tripId,
        deletedAt: null,
        currentStatus: {
          notIn: ['COMPLETED', 'CANCELLED']
        },
        NOT: {
          customsDeclaration: {
            is: {
              status: 'APPROVED'
            }
          }
        },
        plannedStartAt: {
          gte: this.getDefaultDriverTripWindowStart(),
          lte: this.getDefaultDriverTripWindowEnd()
        },
        OR: [
          {
            driverProfile: {
              userId: user.id,
              deletedAt: null
            }
          },
          {
            participants: {
              some: {
                userId: user.id,
                role: 'DRIVER'
              }
            }
          },
          {
            vehicle: {
              is: {
                defaultDriver: {
                  userId: user.id,
                  deletedAt: null
                },
                deletedAt: null
              }
            }
          }
        ]
      },
      select: {
        id: true,
        organizationId: true,
        tripCode: true
      }
    });

    if (!trip) {
      throw new NotFoundException('Không tìm thấy chuyến được gán cho tài xế hiện tại.');
    }

    const rawPayload = {
      source: 'DRIVER_PORTAL',
      mediaType: dto.mediaType,
      fileName: dto.fileName,
      storagePath: dto.storagePath ?? null,
      publicUrl: dto.publicUrl ?? null,
      sizeBytes: dto.sizeBytes ?? null,
      metadata: dto.metadata ?? null
    };
    const eventPayload: CreateTripEventDto = {
      eventType: 'DRIVER_MEDIA_UPLOADED' as CreateTripEventDto['eventType'],
      occurredAt: dto.occurredAt ?? new Date().toISOString(),
      source: 'DRIVER_APP' as NonNullable<CreateTripEventDto['source']>,
      sourceRef: dto.storagePath ?? dto.publicUrl ?? dto.fileName,
      note: dto.message ?? `Tài xế đã tải lên ${dto.fileName}.`,
      confidence: 0.95,
      rawPayload
    };
    const stableMediaKey = dto.storagePath ?? dto.publicUrl;
    const event = await this.tripsService.createEvent(
      user,
      trip.organizationId,
      trip.id,
      eventPayload,
      stableMediaKey ? `driver-media:${trip.id}:${stableMediaKey}` : undefined
    );
    const mediaData: Record<string, unknown> = {
      organizationId: trip.organizationId,
      tripId: trip.id,
      tripEventId: event.id,
      uploadedById: user.id,
      mediaType: dto.mediaType,
      fileName: dto.fileName
    };

    if (dto.mimeType) {
      mediaData.mimeType = dto.mimeType;
    }

    if (dto.storagePath) {
      mediaData.storagePath = dto.storagePath;
    }

    if (dto.publicUrl) {
      mediaData.publicUrl = dto.publicUrl;
    }

    if (dto.sizeBytes !== undefined) {
      mediaData.sizeBytes = dto.sizeBytes;
    }

    if (dto.message) {
      mediaData.message = dto.message;
    }

    if (dto.metadata) {
      mediaData.metadata = dto.metadata;
    }

    const media = await (this.prisma as PrismaWithTripMedia).tripMediaAttachment.create({
      data: mediaData,
      include: {
        tripEvent: true
      }
    });

    return {
      tripId: trip.id,
      tripCode: trip.tripCode,
      event,
      media
    };
  }

  private async findDriverOrThrow(organizationId: string, driverProfileId: string) {
    const driver = await this.prisma.driverProfile.findFirst({
      where: {
        id: driverProfileId,
        organizationId,
        deletedAt: null
      },
      include: driverInclude
    });

    if (!driver) {
      throw new NotFoundException('Driver profile was not found in this organization.');
    }

    return driver;
  }

  private async toDriverCreateData(
    organizationId: string,
    dto: CreateDriverDto
  ): Promise<Prisma.DriverProfileUncheckedCreateInput> {
    const data: Prisma.DriverProfileUncheckedCreateInput = {
      organizationId
    };

    if (dto.displayName) {
      data.displayName = dto.displayName.trim();
    }

    if (dto.phone) {
      data.phone = dto.phone.trim();
    }

    if (dto.licenseNumber) {
      data.licenseNumber = dto.licenseNumber.trim();
    }

    if (dto.userId) {
      await this.assertUserBelongsToOrganization(organizationId, dto.userId);
      data.userId = dto.userId;
    }

    return data;
  }

  private async toDriverUpdateData(
    organizationId: string,
    dto: UpdateDriverDto
  ): Promise<Prisma.DriverProfileUncheckedUpdateInput> {
    const data: Prisma.DriverProfileUncheckedUpdateInput = {};

    if (dto.displayName !== undefined) {
      data.displayName = dto.displayName.trim();
    }

    if (dto.phone !== undefined) {
      data.phone = dto.phone.trim();
    }

    if (dto.licenseNumber !== undefined) {
      data.licenseNumber = dto.licenseNumber.trim();
    }

    if (dto.userId !== undefined) {
      if (dto.userId) {
        await this.assertUserBelongsToOrganization(organizationId, dto.userId);
        data.userId = dto.userId;
      } else {
        data.userId = null;
      }
    }

    return data;
  }

  private async assertUserBelongsToOrganization(organizationId: string, userId: string) {
    const membership = await this.prisma.membership.findFirst({
      where: {
        organizationId,
        userId,
        status: 'ACTIVE',
        deletedAt: null
      },
      select: {
        id: true
      }
    });

    if (!membership) {
      throw new BadRequestException('Linked user must be an active member of this organization.');
    }
  }

  private getDefaultDriverTripWindowStart() {
    const date = new Date();
    date.setDate(date.getDate() - defaultDriverTripWindowDays);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  private getDefaultDriverTripWindowEnd() {
    const date = new Date();
    date.setHours(23, 59, 59, 999);
    return date;
  }

  private toPublicDriverTrip<T extends object>(trip: T) {
    const tripWithSources = trip as T & {
      events?: DriverTripSourceEvent[];
      customsDeclaration?: unknown;
    };
    const sourceSummary = this.resolveDriverTripSourceSummary(tripWithSources);
    const publicEvents = tripWithSources.events?.map(
      ({ rawPayload: _rawPayload, ...event }) => event
    );

    return {
      ...trip,
      ...(publicEvents ? { events: publicEvents } : {}),
      ...(sourceSummary ? { sourceSummary } : {})
    };
  }

  private resolveDriverTripSourceSummary(trip: {
    events?: DriverTripSourceEvent[];
    customsDeclaration?: unknown;
  }): DriverTripSourceSummary | undefined {
    const declaration = this.asRecord(trip.customsDeclaration);
    const sourcePayload = trip.events
      ?.map((event) => this.asRecord(event.rawPayload))
      .find((payload) => payload?.source === 'CUA_KHAU_SO');

    if (!declaration && !sourcePayload) {
      return undefined;
    }

    const summary: DriverTripSourceSummary = {
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

  private toAuditSnapshot(driver: {
    id: string;
    organizationId: string;
    userId: string | null;
    displayName: string | null;
    licenseNumber: string | null;
    phone: string | null;
  }) {
    return {
      id: driver.id,
      organizationId: driver.organizationId,
      userId: driver.userId,
      displayName: driver.displayName,
      licenseNumber: driver.licenseNumber,
      phone: driver.phone
    };
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
