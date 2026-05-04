import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { RequestUser } from '../auth/request-user';
import type { PrismaService } from '../prisma/prisma.service';
import type { CreateVehicleDto } from './dto/create-vehicle.dto';
import { VehiclesService } from './vehicles.service';

const requestUser: RequestUser = {
  id: 'user-1',
  supabaseUserId: 'supabase-user-1',
  claims: {},
  memberships: [
    {
      id: 'membership-1',
      organizationId: 'org-1',
      role: 'DISPATCHER',
      status: 'ACTIVE'
    }
  ]
};

function createService(prisma: unknown): VehiclesService {
  return new VehiclesService(prisma as PrismaService);
}

test('createVehicle normalizes plate number and writes audit in organization scope', async () => {
  let createdVehicleData: Record<string, unknown> | undefined;
  let auditData: Record<string, unknown> | undefined;
  const tx = {
    vehicle: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        createdVehicleData = data;
        return {
          id: 'vehicle-1',
          organizationId: data.organizationId,
          plateNumber: data.plateNumber,
          vehicleType: data.vehicleType,
          ownershipType: data.ownershipType,
          defaultDriverId: data.defaultDriverId ?? null
        };
      }
    },
    auditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        auditData = data;
        return data;
      }
    }
  };
  const prisma = {
    $transaction: async (callback: (txClient: typeof tx) => Promise<unknown>) => callback(tx)
  };
  const service = createService(prisma);
  const dto: CreateVehicleDto = {
    plateNumber: ' 29h 12345 ',
    vehicleType: 'CONTAINER_TRUCK'
  };

  const vehicle = await service.createVehicle(requestUser, 'org-1', dto);

  assert.equal(vehicle.id, 'vehicle-1');
  assert.equal(createdVehicleData?.organizationId, 'org-1');
  assert.equal(createdVehicleData?.plateNumber, '29H12345');
  assert.equal(auditData?.action, 'vehicle.create');
  assert.equal(auditData?.organizationId, 'org-1');
});

test('createVehicle rejects duplicate plate number in the same organization', async () => {
  const prisma = {
    $transaction: async () => {
      throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
        meta: {
          target: ['organizationId', 'plateNumber']
        }
      });
    }
  };
  const service = createService(prisma);
  const dto: CreateVehicleDto = {
    plateNumber: '29H-12345',
    vehicleType: 'TRUCK'
  };

  await assert.rejects(async () => service.createVehicle(requestUser, 'org-1', dto), ConflictException);
});

test('createVehicle checks default driver belongs to the organization before assigning', async () => {
  let driverFindWhere: Record<string, unknown> | undefined;
  let transactionCalled = false;
  const prisma = {
    driverProfile: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        driverFindWhere = where;
        return null;
      }
    },
    $transaction: async () => {
      transactionCalled = true;
      return undefined;
    }
  };
  const service = createService(prisma);
  const dto: CreateVehicleDto = {
    plateNumber: '29H-12345',
    vehicleType: 'TRUCK',
    defaultDriverId: 'driver-1'
  };

  await assert.rejects(async () => service.createVehicle(requestUser, 'org-1', dto), BadRequestException);
  assert.deepEqual(driverFindWhere, {
    id: 'driver-1',
    organizationId: 'org-1',
    deletedAt: null
  });
  assert.equal(transactionCalled, false);
});
