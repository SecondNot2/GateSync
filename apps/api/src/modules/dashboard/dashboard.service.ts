import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, TripStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TripOperationsService } from '../trips/trip-operations.service';

const activeStatuses: readonly TripStatus[] = [
  'PLANNED',
  'IN_PROGRESS',
  'WAITING_YARD_ENTRY',
  'IN_YARD',
  'AT_BORDER_GATE',
  'CUSTOMS_PROCESSING',
  'INSPECTION_REQUIRED',
  'BLOCKED',
  'DELAYED'
];

const attentionStatuses: readonly TripStatus[] = [
  'WAITING_YARD_ENTRY',
  'INSPECTION_REQUIRED',
  'BLOCKED',
  'DELAYED'
];

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

const latestTripEventsSelect = {
  eventType: true,
  occurredAt: true,
  recordedAt: true
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

@Injectable()
export class DashboardService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TripOperationsService) private readonly operations: TripOperationsService
  ) {}

  async getSummary(organizationId: string) {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    const [operationTrips, eventsToday, recentEvents] = await this.prisma.$transaction([
      this.prisma.trip.findMany({
        where: {
          organizationId,
          deletedAt: null
        },
        include: tripSummaryInclude
      }),
      this.prisma.tripEvent.count({
        where: {
          organizationId,
          occurredAt: {
            gte: startOfDay
          }
        }
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

    const enrichedTrips = this.operations.enrichTrips(operationTrips, now);
    const activeTrips = enrichedTrips.filter((trip) => activeStatuses.includes(trip.currentStatus));
    const delaySummary = this.operations.createDelaySummary(activeTrips);
    const urgentTrips = this.operations
      .sortTripsForOperations(
        activeTrips.filter(
          (trip) =>
            trip.operationalState.priority !== 'NORMAL' ||
            attentionStatuses.includes(trip.currentStatus)
        )
      )
      .slice(0, 6);
    const countByStatus = enrichedTrips.reduce((counts, item) => {
      counts.set(item.currentStatus, (counts.get(item.currentStatus) ?? 0) + 1);
      return counts;
    }, new Map<TripStatus, number>());

    return {
      generatedAt: now.toISOString(),
      metrics: {
        activeTrips: activeTrips.length,
        delayedTrips: delaySummary.delayedTrips,
        attentionTrips: urgentTrips.length,
        eventsToday
      },
      delaySummary,
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
