import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.borderGate.upsert({
    where: { name: 'Huu Nghi' },
    update: {},
    create: {
      name: 'Huu Nghi',
      province: 'Lang Son',
      countrySide: 'VN_CN',
      yards: {
        create: [
          {
            name: 'Huu Nghi Staging Yard',
            operatorName: 'GateSync Demo',
            address: 'Lang Son'
          }
        ]
      }
    }
  });

  await prisma.borderGate.upsert({
    where: { name: 'Tan Thanh' },
    update: {},
    create: {
      name: 'Tan Thanh',
      province: 'Lang Son',
      countrySide: 'VN_CN'
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
