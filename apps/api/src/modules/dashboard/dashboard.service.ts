import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, TripStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const activeStatuses = [
  'PLANNED',
  'IN_PROGRESS',
  'WAITING_YARD_ENTRY',
  'IN_YARD',
  'AT_BORDER_GATE',
  'CUSTOMS_PROCESSING',
  'INSPECTION_REQUIRED',
  'BLOCKED',
  'DELAYED'
] satisfies TripStatus[];

const attentionStatuses = [
  'WAITING_YARD_ENTRY',
  'INSPECTION_REQUIRED',
  'BLOCKED',
  'DELAYED'
] satisfies TripStatus[];

const dashboardStatusGroups = [
  {
    key: 'notStarted',
    statuses: ['PLANNED']
  },
  {
    key: 'moving',
    statuses: ['IN_PROGRESS', 'AT_BORDER_GATE']
  },
  {
    key: 'waitingYard',
    statuses: ['WAITING_YARD_ENTRY']
  },
  {
    key: 'inYard',
    statuses: ['IN_YARD']
  },
  {
    key: 'customs',
    statuses: ['CUSTOMS_PROCESSING', 'INSPECTION_REQUIRED']
  },
  {
    key: 'blockedOrDelayed',
    statuses: ['DELAYED', 'BLOCKED']
  }
] satisfies Array<{ key: string; statuses: TripStatus[] }>;

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

@Injectable()
export class DashboardService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getSummary(organizationId: string) {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    const [
      activeTrips,
      delayedTrips,
      attentionTrips,
      eventsToday,
      statusRows,
      urgentTrips,
      recentEvents
    ] = await this.prisma.$transaction([
      this.prisma.trip.count({
        where: {
          organizationId,
          deletedAt: null,
          currentStatus: {
            in: activeStatuses
          }
        }
      }),
      this.prisma.trip.count({
        where: {
          organizationId,
          deletedAt: null,
          currentStatus: {
            notIn: ['COMPLETED', 'CANCELLED']
          },
          OR: [
            {
              currentStatus: {
                in: ['DELAYED', 'BLOCKED']
              }
            },
            {
              plannedArrivalAt: {
                lt: now
              }
            }
          ]
        }
      }),
      this.prisma.trip.count({
        where: {
          organizationId,
          deletedAt: null,
          currentStatus: {
            in: attentionStatuses
          }
        }
      }),
      this.prisma.tripEvent.count({
        where: {
          organizationId,
          occurredAt: {
            gte: startOfDay
          }
        }
      }),
      this.prisma.trip.findMany({
        where: {
          organizationId,
          deletedAt: null
        },
        select: {
          currentStatus: true
        }
      }),
      this.prisma.trip.findMany({
        where: {
          organizationId,
          deletedAt: null,
          currentStatus: {
            notIn: ['COMPLETED', 'CANCELLED']
          },
          OR: [
            {
              currentStatus: {
                in: attentionStatuses
              }
            },
            {
              plannedArrivalAt: {
                lt: now
              }
            }
          ]
        },
        include: tripSummaryInclude,
        orderBy: [
          {
            plannedArrivalAt: 'asc'
          },
          {
            currentStatusUpdatedAt: 'asc'
          }
        ],
        take: 6
      }),
      this.prisma.tripEvent.findMany({
        where: {
          organizationId
        },
        include: {
          trip: {
            select: {
              id: true,
              tripCode: true,
              borderGate: true,
              yard: true
            }
          },
          createdBy: {
            select: {
              id: true,
              fullName: true,
              email: true
            }
          }
        },
        orderBy: [
          {
            occurredAt: 'desc'
          },
          {
            recordedAt: 'desc'
          }
        ],
        take: 8
      })
    ]);

    const countByStatus = statusRows.reduce((counts, item) => {
      counts.set(item.currentStatus, (counts.get(item.currentStatus) ?? 0) + 1);
      return counts;
    }, new Map<TripStatus, number>());

    return {
      generatedAt: now.toISOString(),
      metrics: {
        activeTrips,
        delayedTrips,
        attentionTrips,
        eventsToday
      },
      statusGroups: dashboardStatusGroups.map((group) => ({
        key: group.key,
        statuses: group.statuses,
        count: group.statuses.reduce((total, status) => total + (countByStatus.get(status) ?? 0), 0)
      })),
      urgentTrips,
      recentEvents
    };
  }
}
