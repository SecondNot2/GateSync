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

const defaultTripWindowDays = 7;

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
  recordedAt: true,
  rawPayload: true
} satisfies Prisma.TripEventSelect;

type TripSourceSummary = {
  provider: 'CUA_KHAU_SO';
  declarationNumber?: string;
  gateName?: string;
  yardName?: string;
  vehiclePlate?: string;
  driverName?: string;
  paymentCompleted?: boolean;
};

type DashboardTripSourceEvent = {
  rawPayload?: Prisma.JsonValue | null;
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
    const defaultTripWindowStart = new Date(now);
    defaultTripWindowStart.setDate(defaultTripWindowStart.getDate() - defaultTripWindowDays);
    defaultTripWindowStart.setHours(0, 0, 0, 0);
    const defaultTripWindowEnd = new Date(now);
    defaultTripWindowEnd.setHours(23, 59, 59, 999);

    const [operationTrips, eventsToday, recentEvents] = await this.prisma.$transaction([
      this.prisma.trip.findMany({
        where: {
          organizationId,
          deletedAt: null,
          currentStatus: {
            in: [...activeStatuses]
          },
          NOT: {
            customsDeclaration: {
              is: {
                status: 'APPROVED'
              }
            }
          },
          plannedStartAt: {
            gte: defaultTripWindowStart,
            lte: defaultTripWindowEnd
          }
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
          organizationId,
          trip: {
            organizationId,
            deletedAt: null,
            currentStatus: {
              in: [...activeStatuses]
            },
            NOT: {
              customsDeclaration: {
                is: {
                  status: 'APPROVED'
                }
              }
            },
            plannedStartAt: {
              gte: defaultTripWindowStart,
              lte: defaultTripWindowEnd
            }
          }
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
    const publicActiveTrips = activeTrips.map((trip) => this.toPublicTrip(trip));
    const delaySummary = this.operations.createDelaySummary(activeTrips);
    const urgentTrips = this.operations
      .sortTripsForOperations(
        publicActiveTrips.filter(
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

  private toPublicTrip<T extends object>(trip: T) {
    const tripWithSources = trip as T & {
      events?: DashboardTripSourceEvent[];
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
    events?: DashboardTripSourceEvent[];
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
}
