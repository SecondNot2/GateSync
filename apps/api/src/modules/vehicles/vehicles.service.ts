import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { RequestUser } from '../auth/request-user';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateVehicleDto } from './dto/create-vehicle.dto';
import type { UpdateVehicleDto } from './dto/update-vehicle.dto';

const vehicleInclude = {
  defaultDriver: {
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
  _count: {
    select: {
      trips: true
    }
  }
} satisfies Prisma.VehicleInclude;

@Injectable()
export class VehiclesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  listVehicles(organizationId: string) {
    return this.prisma.vehicle.findMany({
      where: {
        organizationId,
        deletedAt: null
      },
      include: vehicleInclude,
      orderBy: [
        {
          plateNumber: 'asc'
        }
      ]
    });
  }

  async createVehicle(user: RequestUser, organizationId: string, dto: CreateVehicleDto) {
    const data = await this.toVehicleCreateData(organizationId, dto);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const vehicle = await tx.vehicle.create({
          data,
          include: vehicleInclude
        });

        await tx.auditLog.create({
          data: {
            organizationId,
            actorUserId: user.id,
            action: 'vehicle.create',
            entityType: 'Vehicle',
            entityId: vehicle.id,
            after: this.toAuditSnapshot(vehicle)
          }
        });

        return vehicle;
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error, 'plateNumber')) {
        throw new ConflictException('Vehicle plate number already exists in this organization.');
      }

      throw error;
    }
  }

  async updateVehicle(
    user: RequestUser,
    organizationId: string,
    vehicleId: string,
    dto: UpdateVehicleDto
  ) {
    if (
      dto.plateNumber === undefined &&
      dto.vehicleType === undefined &&
      dto.ownershipType === undefined &&
      dto.defaultDriverId === undefined
    ) {
      throw new BadRequestException('At least one vehicle field must be provided.');
    }

    const existingVehicle = await this.findVehicleOrThrow(organizationId, vehicleId);
    const data = await this.toVehicleUpdateData(organizationId, dto);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const vehicle = await tx.vehicle.update({
          where: {
            id: vehicleId
          },
          data,
          include: vehicleInclude
        });

        await tx.auditLog.create({
          data: {
            organizationId,
            actorUserId: user.id,
            action: 'vehicle.update',
            entityType: 'Vehicle',
            entityId: vehicleId,
            before: this.toAuditSnapshot(existingVehicle),
            after: this.toAuditSnapshot(vehicle)
          }
        });

        return vehicle;
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error, 'plateNumber')) {
        throw new ConflictException('Vehicle plate number already exists in this organization.');
      }

      throw error;
    }
  }

  async deleteVehicle(user: RequestUser, organizationId: string, vehicleId: string) {
    const existingVehicle = await this.findVehicleOrThrow(organizationId, vehicleId);

    await this.prisma.$transaction(async (tx) => {
      await tx.vehicle.update({
        where: {
          id: vehicleId
        },
        data: {
          deletedAt: new Date(),
          deletedById: user.id
        }
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId: user.id,
          action: 'vehicle.delete',
          entityType: 'Vehicle',
          entityId: vehicleId,
          before: this.toAuditSnapshot(existingVehicle)
        }
      });
    });

    return {
      id: vehicleId,
      deleted: true
    };
  }

  private async findVehicleOrThrow(organizationId: string, vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: {
        id: vehicleId,
        organizationId,
        deletedAt: null
      },
      include: vehicleInclude
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle was not found in this organization.');
    }

    return vehicle;
  }

  private async toVehicleCreateData(
    organizationId: string,
    dto: CreateVehicleDto
  ): Promise<Prisma.VehicleUncheckedCreateInput> {
    const data: Prisma.VehicleUncheckedCreateInput = {
      organizationId,
      plateNumber: this.normalizePlateNumber(dto.plateNumber),
      vehicleType: dto.vehicleType,
      ownershipType: dto.ownershipType ?? 'OWNED'
    };

    if (dto.defaultDriverId) {
      await this.assertDriverBelongsToOrganization(organizationId, dto.defaultDriverId);
      data.defaultDriverId = dto.defaultDriverId;
    }

    return data;
  }

  private async toVehicleUpdateData(
    organizationId: string,
    dto: UpdateVehicleDto
  ): Promise<Prisma.VehicleUncheckedUpdateInput> {
    const data: Prisma.VehicleUncheckedUpdateInput = {};

    if (dto.plateNumber !== undefined) {
      data.plateNumber = this.normalizePlateNumber(dto.plateNumber);
    }

    if (dto.vehicleType !== undefined) {
      data.vehicleType = dto.vehicleType;
    }

    if (dto.ownershipType !== undefined) {
      data.ownershipType = dto.ownershipType;
    }

    if (dto.defaultDriverId !== undefined) {
      if (dto.defaultDriverId) {
        await this.assertDriverBelongsToOrganization(organizationId, dto.defaultDriverId);
        data.defaultDriverId = dto.defaultDriverId;
      } else {
        data.defaultDriverId = null;
      }
    }

    return data;
  }

  private async assertDriverBelongsToOrganization(organizationId: string, driverProfileId: string) {
    const driver = await this.prisma.driverProfile.findFirst({
      where: {
        id: driverProfileId,
        organizationId,
        deletedAt: null
      },
      select: {
        id: true
      }
    });

    if (!driver) {
      throw new BadRequestException('Default driver was not found in this organization.');
    }
  }

  private normalizePlateNumber(value: string) {
    return value.trim().replace(/\s+/g, '').toUpperCase();
  }

  private toAuditSnapshot(vehicle: {
    id: string;
    plateNumber: string;
    vehicleType: string;
    ownershipType: string;
    defaultDriverId: string | null;
  }) {
    return {
      id: vehicle.id,
      plateNumber: vehicle.plateNumber,
      vehicleType: vehicle.vehicleType,
      ownershipType: vehicle.ownershipType,
      defaultDriverId: vehicle.defaultDriverId
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
