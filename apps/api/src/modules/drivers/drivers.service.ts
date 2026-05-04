import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { RequestUser } from '../auth/request-user';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateDriverDto } from './dto/create-driver.dto';
import type { UpdateDriverDto } from './dto/update-driver.dto';

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

@Injectable()
export class DriversService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

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
