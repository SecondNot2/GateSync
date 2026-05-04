import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const demoOrganizationId = '00000000-0000-4000-8000-000000000001';
const demoUserId = '00000000-0000-4000-8000-000000000002';
const demoDriverId = '00000000-0000-4000-8000-000000000011';

async function main() {
  await prisma.user.upsert({
    where: { supabaseUserId: 'gatesync-demo-owner' },
    update: {
      email: 'owner@gatesync.local',
      fullName: 'Lê Minh Anh',
      phone: '0988000001'
    },
    create: {
      id: demoUserId,
      supabaseUserId: 'gatesync-demo-owner',
      email: 'owner@gatesync.local',
      fullName: 'Lê Minh Anh',
      phone: '0988000001'
    }
  });

  await prisma.organization.upsert({
    where: { id: demoOrganizationId },
    update: {
      name: 'Công ty Logistics Hữu Nghị',
      type: 'LOGISTICS_COMPANY',
      taxCode: '0109988776',
      phone: '+84988123456',
      email: 'ops@gatesync.local',
      address: 'Lạng Sơn, Việt Nam'
    },
    create: {
      id: demoOrganizationId,
      name: 'Công ty Logistics Hữu Nghị',
      type: 'LOGISTICS_COMPANY',
      taxCode: '0109988776',
      phone: '+84988123456',
      email: 'ops@gatesync.local',
      address: 'Lạng Sơn, Việt Nam'
    }
  });

  await prisma.membership.upsert({
    where: {
      organizationId_userId: {
        organizationId: demoOrganizationId,
        userId: demoUserId
      }
    },
    update: {
      role: 'OWNER',
      status: 'ACTIVE'
    },
    create: {
      organizationId: demoOrganizationId,
      userId: demoUserId,
      role: 'OWNER',
      status: 'ACTIVE'
    }
  });

  await prisma.driverProfile.upsert({
    where: {
      id: demoDriverId
    },
    update: {
      organizationId: demoOrganizationId,
      displayName: 'Nguyễn Văn Bình',
      phone: '0988123456',
      licenseNumber: '790123456789',
      deletedAt: null,
      deletedById: null
    },
    create: {
      id: demoDriverId,
      organizationId: demoOrganizationId,
      displayName: 'Nguyễn Văn Bình',
      phone: '0988123456',
      licenseNumber: '790123456789'
    }
  });

  await prisma.vehicle.upsert({
    where: {
      organizationId_plateNumber: {
        organizationId: demoOrganizationId,
        plateNumber: '29H12345'
      }
    },
    update: {
      vehicleType: 'CONTAINER_TRUCK',
      ownershipType: 'OWNED',
      defaultDriverId: demoDriverId,
      deletedAt: null,
      deletedById: null
    },
    create: {
      organizationId: demoOrganizationId,
      plateNumber: '29H12345',
      vehicleType: 'CONTAINER_TRUCK',
      ownershipType: 'OWNED',
      defaultDriverId: demoDriverId
    }
  });

  const huuNghi = await prisma.borderGate.upsert({
    where: { name: 'Hữu Nghị' },
    update: {
      province: 'Lạng Sơn',
      countrySide: 'VN_CN',
      isActive: true
    },
    create: {
      name: 'Hữu Nghị',
      province: 'Lạng Sơn',
      countrySide: 'VN_CN'
    }
  });

  await prisma.borderGate.upsert({
    where: { name: 'Tân Thanh' },
    update: {
      province: 'Lạng Sơn',
      countrySide: 'VN_CN',
      isActive: true
    },
    create: {
      name: 'Tân Thanh',
      province: 'Lạng Sơn',
      countrySide: 'VN_CN'
    }
  });

  const chiMa = await prisma.borderGate.upsert({
    where: { name: 'Chi Ma' },
    update: {
      province: 'Lạng Sơn',
      countrySide: 'VN_CN',
      isActive: true
    },
    create: {
      name: 'Chi Ma',
      province: 'Lạng Sơn',
      countrySide: 'VN_CN'
    }
  });

  await prisma.yard.upsert({
    where: {
      borderGateId_name: {
        borderGateId: huuNghi.id,
        name: 'Bãi Xuân Cương'
      }
    },
    update: {
      operatorName: 'Xuân Cương',
      address: 'Khu vực cửa khẩu Hữu Nghị',
      isActive: true
    },
    create: {
      borderGateId: huuNghi.id,
      name: 'Bãi Xuân Cương',
      operatorName: 'Xuân Cương',
      address: 'Khu vực cửa khẩu Hữu Nghị'
    }
  });

  await prisma.yard.upsert({
    where: {
      borderGateId_name: {
        borderGateId: chiMa.id,
        name: 'Bãi Chi Ma 01'
      }
    },
    update: {
      operatorName: 'GateSync Demo',
      address: 'Khu vực cửa khẩu Chi Ma',
      isActive: true
    },
    create: {
      borderGateId: chiMa.id,
      name: 'Bãi Chi Ma 01',
      operatorName: 'GateSync Demo',
      address: 'Khu vực cửa khẩu Chi Ma'
    }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
