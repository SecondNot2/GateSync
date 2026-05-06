import type { TripEventType, TripStatus } from '@gatesync/shared';
import {
  adminDrivers,
  adminMembers,
  adminVehicles,
  demoOrganization,
  demoTrips,
  operationsMetrics,
  operationsStatusGroups,
  recentTripEvents
} from '@/lib/demo-data';
import type { ListTripsParams } from '@/lib/api/types';
import type {
  ApiCuaKhauSoDeclarationSummary,
  ListCuaKhauSoDeclarationsParams
} from '@/lib/api/types';
import type {
  AdminViewData,
  CuaKhauSoViewData,
  DashboardViewData,
  OperationsCuaKhauSoDeclaration,
  OperationsOrganizationContext,
  OperationsTripDetail,
  OperationsTripEvent,
  OperationsTripSummary,
  TripDetailViewData,
  TripsViewData
} from '@/lib/operations/view-model';

export function getDevDashboardData(reason: string): DashboardViewData {
  const trips = demoTrips.map(toDevTripSummary);

  return {
    organization: toDevOrganization(reason, trips.length),
    metrics: operationsMetrics,
    statusGroups: operationsStatusGroups,
    urgentTrips: trips.filter((trip) => trip.priority !== 'NORMAL' || trip.delayMinutes > 0),
    featuredTrips: trips,
    recentEvents: recentTripEvents.map(toDevTripEvent),
    notice: `Đang dùng dữ liệu mẫu cục bộ: ${reason}`
  };
}

export function getDevTripsData(filters: ListTripsParams, reason: string): TripsViewData {
  const trips = demoTrips.filter((trip) => matchesFilters(trip, filters)).map(toDevTripSummary);

  return {
    organization: toDevOrganization(reason, trips.length),
    trips,
    filters,
    notice: `Đang dùng dữ liệu mẫu cục bộ: ${reason}`
  };
}

export function getDevTripDetailData(tripId: string, reason: string): TripDetailViewData {
  const trip = demoTrips.find((item) => item.id === tripId);

  if (!trip) {
    throw new Error('Không tìm thấy chuyến trong dữ liệu mẫu cục bộ.');
  }

  return {
    organization: toDevOrganization(reason),
    trip: toDevTripDetail(trip),
    notice: `Đang dùng dữ liệu mẫu cục bộ: ${reason}`
  };
}

export function getDevAdminData(reason: string): AdminViewData {
  return {
    organization: toDevOrganization(reason),
    profile: {
      id: 'dev-organization',
      name: demoOrganization.name,
      type: demoOrganization.type,
      taxCode: demoOrganization.taxCode,
      location: demoOrganization.location,
      email: 'ops@gatesync.local',
      phone: '+84988123456',
      currentUserRole: 'OWNER',
      canManageMembers: true,
      canManageFleet: true,
      canOpenAdmin: true
    },
    members: adminMembers,
    vehicles: adminVehicles,
    drivers: adminDrivers,
    notice: `Đang dùng dữ liệu mẫu cục bộ: ${reason}`
  };
}

export function getDevCuaKhauSoData(
  filters: ListCuaKhauSoDeclarationsParams,
  reason: string
): CuaKhauSoViewData {
  const declarations = devCuaKhauSoDeclarations.filter((declaration) => {
    if (filters.direction && declaration.direction !== filters.direction) {
      return false;
    }

    if (filters.status === 2 && !declaration.completed) {
      return false;
    }

    if (filters.status === 1 && declaration.completed) {
      return false;
    }

    if (filters.keyword) {
      const keyword = filters.keyword.toLowerCase();
      return `${declaration.declarationNumber} ${declaration.plateNumber} ${declaration.trailerNumber}`
        .toLowerCase()
        .includes(keyword);
    }

    return true;
  });

  return {
    organization: toDevOrganization(reason, declarations.length),
    session: {
      authenticated: false
    },
    health: {
      configured: true,
      status: 'ACTIVE',
      freshnessLabel: 'Dữ liệu mẫu',
      stale: false,
      lastSyncAt: new Date().toISOString(),
      lastSuccessfulSyncAt: new Date().toISOString(),
      syncLagSeconds: 0,
      consecutiveFailures: 0
    },
    declarations: {
      declarations,
      totalCount: declarations.length,
      totalPage: declarations.length > 0 ? 1 : 0,
      message: 'Dữ liệu mẫu Cửa khẩu số chỉ dùng để xem giao diện.'
    },
    syncRuns: [],
    notice: `Đang dùng dữ liệu mẫu cục bộ: ${reason}`
  };
}

const devCuaKhauSoDeclarations: ApiCuaKhauSoDeclarationSummary[] = [
  {
    externalId: '84b718cf-4a72-4c7e-91d8-24e51ae53154',
    declarationNumber: '2026050300533',
    createdAt: '2026-05-03T13:15:21.972Z',
    sourceObservedAt: '2026-05-03T13:20:21.972Z',
    lastIngestedAt: '2026-05-03T13:20:22.972Z',
    linkedTripCode: '2026050300533',
    direction: 'IMPORT',
    declarationType: 'IMPORT',
    status: 'SUBMITTED',
    statusLabel: 'Chưa hoàn thành',
    gateName: 'Hữu Nghị',
    gateCode: 'CKHN',
    companyGoodsName: 'CÔNG TY CỔ PHẦN LOGISTICS THÁI VIỆT TRUNG',
    plateNumber: 'FF0666',
    trailerNumber: 'Chưa cập nhật',
    changePlateNumber: 'Không sang tải',
    totalWeight: 3.25,
    completed: false,
    paymentStatus: 'Chưa thanh toán'
  }
];

function toDevTripDeclarationSignal(
  tripId: string
): OperationsTripSummary['declarationSignal'] | undefined {
  const declaration = toDevCuaKhauSoDeclaration(tripId);

  if (!declaration) {
    return undefined;
  }

  return {
    number: declaration.summary.number,
    status: declaration.summary.status,
    paymentStatus: declaration.payments[0]?.status ?? 'Chưa có thông tin phí',
    freshness: declaration.freshness.label,
    stale: declaration.freshness.stale,
    warnings: [
      {
        code: 'PAYMENT_PENDING',
        label: 'Chưa thanh toán',
        tone: 'bg-rose-50 text-rose-700 ring-rose-100'
      }
    ]
  };
}

function toDevCuaKhauSoDeclaration(tripId: string): OperationsCuaKhauSoDeclaration | undefined {
  if (tripId !== 'gs-imp-2048') {
    return undefined;
  }

  return {
    summary: {
      externalId: '84b718cf-4a72-4c7e-91d8-24e51ae53154',
      number: '2026050300533',
      direction: 'Nhập khẩu',
      status: 'Chưa hoàn thành',
      gateName: 'Hữu Nghị',
      gateCode: 'CKHN',
      goodsName: 'Mô-đun màn hình LCD và linh kiện máy tính',
      plateNumber: 'FF0666',
      trailerNumber: 'Chưa cập nhật',
      changePlateNumber: '29E06997, 29E07714',
      totalWeight: '3,25 kg',
      createdAt: '03/05/2026 13:15'
    },
    freshness: {
      sourceObservedAt: '03/05/2026 13:20',
      sourceUpdatedAt: '03/05/2026 17:53',
      lastIngestedAt: '03/05/2026 13:20',
      label: 'Cập nhật 2 giờ trước',
      stale: false
    },
    generalInfo: [
      {
        label: 'Doanh nghiệp nộp phí',
        value: 'CÔNG TY CỔ PHẦN LOGISTICS THÁI VIỆT TRUNG'
      },
      {
        label: 'Mã số thuế',
        value: '0111172597'
      },
      {
        label: 'Cửa khẩu',
        value: 'Hữu Nghị'
      },
      {
        label: 'Bãi tập kết',
        value: 'Bãi Xuân Cương'
      },
      {
        label: 'Người tạo',
        value: 'Cửa khẩu Hữu Nghị 2'
      },
      {
        label: 'Số tờ khai biên phòng',
        value: '0305202600335'
      }
    ],
    payments: [
      {
        label: 'Trạng thái thanh toán',
        amount: 'Theo dữ liệu nguồn',
        status: 'Chưa thanh toán',
        paid: false
      },
      {
        label: 'Phí hạ tầng',
        amount: '600.000 ₫',
        status: 'Có ghi nhận',
        paid: false
      },
      {
        label: 'Phí sang tải',
        amount: '90.000 ₫',
        status: 'Có ghi nhận',
        paid: true
      }
    ],
    checks: [
      {
        label: 'Kiểm dịch y tế',
        done: true,
        detail: '03/05/2026 13:34'
      },
      {
        label: 'Kiểm dịch thực vật',
        done: true,
        detail: 'Đã xác nhận'
      },
      {
        label: 'Kiểm dịch động vật',
        done: true,
        detail: 'Đã xác nhận'
      },
      {
        label: 'Sang tải',
        done: true,
        detail: '03/05/2026 14:21'
      }
    ],
    procedureSteps: [
      {
        step: 1,
        label: 'Biên phòng xác nhận',
        done: true,
        occurredAt: '03/05/2026 13:34',
        status: 'Hoàn tất',
        description: 'Xe đã qua bước xác nhận biên phòng.'
      },
      {
        step: 2,
        label: 'Hải quan xác nhận đến',
        done: true,
        occurredAt: '03/05/2026 13:34',
        status: 'Hoàn tất',
        description: 'Hải quan xác nhận xe vào khu vực xử lý.'
      },
      {
        step: 3,
        label: 'Thanh toán phí',
        done: false,
        occurredAt: 'Chưa có dữ liệu',
        status: 'Đang chờ',
        description: 'Cần theo dõi trạng thái phí trong Cửa khẩu số.'
      }
    ],
    representativeGoods: [
      {
        id: 'dev-representative-goods-1',
        name: 'Mô-đun màn hình LCD 14 inch',
        hsCode: 'Chưa cập nhật',
        weight: '0 kg',
        priceVnd: '630.000 ₫'
      }
    ],
    customsDeclarations: [
      {
        id: 'dev-customs-declaration-1',
        companyName: 'Tổng Công Ty Bưu Điện Việt Nam',
        companyTaxCode: '0102595740',
        declarationNumber: '108200889900',
        declarationType: 'C11'
      }
    ],
    goods: [
      {
        id: 'dev-goods-1',
        companyName: 'Tổng Công Ty Bưu Điện Việt Nam',
        companyTaxCode: '0102595740',
        declarationNumber: '108200889900',
        declarationType: 'C11',
        items: [
          {
            id: 'dev-goods-item-1',
            name: 'Mô-đun màn hình LCD 14 inch',
            hsCode: 'Chưa cập nhật',
            weight: '0 kg',
            priceVnd: '630.000 ₫'
          }
        ]
      }
    ],
    vehicles: [
      {
        id: 'dev-cks-vehicle-1',
        plateNumber: 'FF0666',
        trailerNumber: 'Chưa cập nhật',
        driverName: 'LI CHUN',
        vehicleType: 'Từ 4 đến dưới 10 tấn',
        nationality: 'CN',
        containerNumber: 'Không có dữ liệu',
        phoneNumber: 'Chưa cập nhật',
        statusLabel: 'Đã tới cửa khẩu',
        transshipmentPlateNumber: '29E06997',
        responsiblePlateNumber: 'Không có dữ liệu',
        goodsGroup: 'Hàng điện tử',
        note: 'Không có ghi chú',
        transportLicenseNumber: 'C26YF0666521',
        weight: '3.254,5 kg',
        price: '300.000 ₫',
        feeRate: '0.3',
        borderGuardConfirmed: true,
        customsArrivalConfirmed: true,
        inParkingConfirmed: true,
        transportLicenseConfirmed: true,
        borderGuardAt: '03/05/2026 13:32',
        customsArrivalAt: '03/05/2026 13:34',
        inParkingAt: '03/05/2026 13:45',
        transportLicenseConfirmedAt: '03/05/2026 13:50',
        customsProcessingAt: 'Chưa có dữ liệu',
        outParkingBorderGuardAt: 'Chưa có dữ liệu',
        outParkingCustomsAt: 'Chưa có dữ liệu'
      },
      {
        id: 'dev-cks-vehicle-2',
        plateNumber: '29E06997',
        trailerNumber: 'Chưa cập nhật',
        driverName: 'Trần Văn Chính',
        vehicleType: 'Xe tải sang tải',
        nationality: 'VN',
        containerNumber: 'Không có dữ liệu',
        phoneNumber: 'Chưa cập nhật',
        statusLabel: 'Xe nhận sang tải',
        transshipmentPlateNumber: 'Không sang tải',
        responsiblePlateNumber: 'Không có dữ liệu',
        goodsGroup: 'Hàng điện tử',
        note: 'Không có ghi chú',
        transportLicenseNumber: 'Chưa cập nhật',
        weight: 'Chưa cập nhật',
        price: 'Chưa cập nhật',
        feeRate: 'Chưa cập nhật',
        borderGuardConfirmed: true,
        customsArrivalConfirmed: true,
        inParkingConfirmed: false,
        transportLicenseConfirmed: false,
        borderGuardAt: '03/05/2026 13:58',
        customsArrivalAt: '03/05/2026 14:02',
        inParkingAt: 'Chưa có dữ liệu',
        transportLicenseConfirmedAt: 'Chưa có dữ liệu',
        customsProcessingAt: 'Chưa có dữ liệu',
        outParkingBorderGuardAt: 'Chưa có dữ liệu',
        outParkingCustomsAt: 'Chưa có dữ liệu'
      }
    ],
    transshipmentVehicles: [
      {
        id: 'dev-cks-transshipment-vehicle-1',
        sourcePlateNumber: 'FF0666',
        plateNumber: '29E06997',
        driverName: 'Trần Văn Chính',
        vehicleType: 'Xe tải sang tải',
        areaChange: 'Bãi sang tải',
        containerNumber: 'Không có dữ liệu',
        trailerNumber: 'Chưa cập nhật',
        customsDeclarationNumbers: '108200889900',
        statusLabel: 'Đã xác nhận sang tải',
        note: 'Không có ghi chú',
        weight: 'Chưa cập nhật',
        price: 'Chưa cập nhật',
        feeRate: 'Chưa cập nhật',
        vehicleRegistrationFormId: 'bcbad4b8-9378-4eba-beb9-bf853ef5258a',
        borderGuardEntered: true,
        customsEntered: true,
        changeConfirmed: true,
        customsOutConfirmed: false,
        medicalQuarantineConfirmed: true,
        borderGuardEnteredAt: '03/05/2026 13:58',
        customsEnteredAt: '03/05/2026 14:02',
        changeConfirmedAt: '03/05/2026 14:21',
        customsOutAt: 'Chưa có dữ liệu',
        medicalQuarantineAt: '03/05/2026 14:05'
      }
    ],
    transshipment: {
      licenseRegistered: true,
      transportLicenseConfirmed: true,
      chinaVehicleEntered: true,
      vietnamVehicleEntered: true,
      foreignVehicleRequired: true,
      foreignVehicleEntered: true,
      borderGuardLagging: false,
      eligible: true,
      signed: true,
      licenseNumber: 'C26YF0666521',
      statusLabel: 'Đã ký/xác nhận sang tải',
      unmetConditions: [],
      borderGuardLaggedSince: 'Chưa có dữ liệu',
      eligibleAt: '03/05/2026 13:34',
      signedAt: '03/05/2026 14:21'
    },
    eventCandidates: [
      {
        eventType: 'DECLARATION_SUBMITTED',
        occurredAt: '03/05/2026 13:19',
        note: 'Cửa khẩu số ghi nhận đăng ký tờ khai vận tải.',
        confidence: '96%'
      },
      {
        eventType: 'FEE_PAID',
        occurredAt: '03/05/2026 14:48',
        note: 'Nguồn ghi nhận một phần phí đã thanh toán.',
        confidence: '92%'
      }
    ]
  };
}

function toDevOrganization(
  reason: string,
  activeTripCount?: number
): OperationsOrganizationContext {
  const organization: OperationsOrganizationContext = {
    name: demoOrganization.name,
    type: demoOrganization.type,
    controlScore: demoOrganization.controlScore,
    notice: reason,
    currentUser: {
      id: 'dev-user',
      name: 'Điều phối viên GateSync',
      email: 'ops@gatesync.local',
      role: 'OWNER',
      permissions: [
        'organizations:read',
        'organizations:update',
        'memberships:manage',
        'fleet:manage',
        'trips:read',
        'trips:manage',
        'integrations:cua-khau-so:read',
        'integrations:cua-khau-so:sync',
        'integrations:cua-khau-so:connect',
        'billing:manage'
      ],
      activeOrganizationCount: 1,
      canReadTrips: true,
      canManageTrips: true,
      canManageMembers: true,
      canManageFleet: true,
      canUseCuaKhauSoIntegration: true,
      canConnectCuaKhauSoIntegration: true,
      canSyncCuaKhauSoIntegration: true,
      canManageBilling: true,
      canOpenAdmin: true
    }
  };

  if (activeTripCount !== undefined) {
    organization.tripBadge = String(activeTripCount);
  }

  return organization;
}

function toDevTripSummary(trip: (typeof demoTrips)[number]): OperationsTripSummary {
  const summary: OperationsTripSummary = {
    id: trip.id,
    tripCode: trip.tripCode,
    tripType: trip.tripType,
    direction: trip.direction,
    currentStatus: trip.currentStatus,
    statusUpdatedAt: trip.statusUpdatedAt,
    borderGate: trip.borderGate,
    yard: trip.yard,
    vehicle: {
      plateNumber: trip.vehicle.plateNumber,
      type: trip.vehicle.type
    },
    driver: trip.driver,
    plannedStartAt: trip.plannedStartAt,
    plannedArrivalAt: trip.plannedArrivalAt,
    delayMinutes: trip.delayMinutes,
    statusDurationMinutes: 0,
    priority: trip.priority,
    nextAction: trip.nextAction,
    nextActionLabel: 'Việc cần làm tiếp theo',
    exceptionCodes: getDevExceptionCodes(trip.currentStatus, trip.delayMinutes),
    availableManualActions: getDevManualActions(trip.currentStatus),
    eventCount: trip.events.length
  };
  const declarationSignal = toDevTripDeclarationSignal(trip.id);

  if (declarationSignal) {
    summary.declarationSignal = declarationSignal;
  }

  return summary;
}

function toDevTripDetail(trip: (typeof demoTrips)[number]): OperationsTripDetail {
  const detail: OperationsTripDetail = {
    ...toDevTripSummary(trip),
    shipment: trip.shipment,
    declaration: trip.declaration,
    participants: trip.participants.map((participant) => ({
      id: participant,
      label: participant,
      role: 'VIEWER',
      visibilityLevel: 'OPERATIONAL'
    })),
    events: trip.events.map((event) =>
      toDevTripEvent({
        ...event,
        tripId: trip.id,
        tripCode: trip.tripCode,
        borderGate: trip.borderGate
      })
    )
  };
  const cksDeclaration = toDevCuaKhauSoDeclaration(trip.id);

  if (cksDeclaration) {
    detail.cuaKhauSoDeclaration = cksDeclaration;
  }

  return detail;
}

function toDevTripEvent(event: (typeof recentTripEvents)[number]): OperationsTripEvent {
  const mappedEvent: OperationsTripEvent = {
    id: event.id,
    tripId: event.tripId,
    tripCode: event.tripCode,
    borderGate: event.borderGate,
    eventType: event.eventType,
    eventStatus: event.eventStatus,
    source: event.source,
    occurredAt: event.occurredAt,
    recordedAt: event.recordedAt,
    actor: event.actor,
    note: event.note
  };

  if (event.confidence !== undefined) {
    mappedEvent.confidence = event.confidence;
  }

  return mappedEvent;
}

function matchesFilters(trip: (typeof demoTrips)[number], filters: ListTripsParams) {
  const query = filters.search?.trim().toLowerCase();

  if (filters.status && trip.currentStatus !== filters.status) {
    return false;
  }

  if (
    !filters.status &&
    (trip.currentStatus === 'COMPLETED' || trip.currentStatus === 'CANCELLED')
  ) {
    return false;
  }

  const plannedStartAt = new Date(trip.plannedStartAt).getTime();

  if (filters.from && plannedStartAt < new Date(filters.from).getTime()) {
    return false;
  }

  if (filters.to && plannedStartAt > new Date(filters.to).getTime()) {
    return false;
  }

  if (filters.borderGateId && trip.borderGate !== filters.borderGateId) {
    return false;
  }

  if (filters.yardId && trip.yard !== filters.yardId) {
    return false;
  }

  if (filters.exception && !matchesExceptionFilter(trip, filters.exception)) {
    return false;
  }

  if (!query) {
    return true;
  }

  return [
    trip.tripCode,
    toDevTripDeclarationSignal(trip.id)?.number ?? '',
    toDevCuaKhauSoDeclaration(trip.id)?.summary.goodsName ?? '',
    trip.vehicle.plateNumber,
    trip.driver.name,
    trip.driver.phone,
    trip.borderGate,
    trip.yard
  ].some((value) => value.toLowerCase().includes(query));
}

function getDevExceptionCodes(
  status: TripStatus,
  delayMinutes: number
): OperationsTripSummary['exceptionCodes'] {
  const exceptionCodes: OperationsTripSummary['exceptionCodes'] = [];

  if (delayMinutes > 0) {
    exceptionCodes.push('ARRIVAL_OVERDUE');
  }

  if (status === 'BLOCKED') {
    exceptionCodes.push('BLOCKED');
  }

  if (status === 'DELAYED') {
    exceptionCodes.push('DELAYED_STATUS');
  }

  if (status === 'INSPECTION_REQUIRED') {
    exceptionCodes.push('INSPECTION_REQUIRED');
  }

  if (status === 'WAITING_YARD_ENTRY') {
    exceptionCodes.push('WAITING_YARD');
  }

  return exceptionCodes;
}

function getDevManualActions(status: TripStatus): TripEventType[] {
  const actions: Record<TripStatus, TripEventType[]> = {
    PLANNED: ['DEPARTED', 'TRIP_CANCELLED'],
    IN_PROGRESS: ['ARRIVED_BORDER_AREA', 'WAITING_YARD_ENTRY', 'DRIVER_NOTE_ADDED'],
    WAITING_YARD_ENTRY: ['YARD_ENTRY_CONFIRMED', 'DRIVER_REPORTED_YARD_ENTRY'],
    IN_YARD: ['YARD_EXIT_CONFIRMED', 'DECLARATION_SUBMITTED'],
    AT_BORDER_GATE: ['BORDER_GATE_ENTRY_CONFIRMED', 'DECLARATION_SUBMITTED', 'CUSTOMS_PROCESSING'],
    CUSTOMS_PROCESSING: ['DECLARATION_APPROVED', 'INSPECTION_REQUIRED', 'FEE_PAID'],
    INSPECTION_REQUIRED: ['INSPECTION_COMPLETED', 'DECLARATION_APPROVED'],
    BLOCKED: ['DRIVER_NOTE_ADDED', 'DECLARATION_APPROVED', 'TRIP_CANCELLED'],
    DELAYED: ['DRIVER_NOTE_ADDED', 'ARRIVED_BORDER_AREA', 'YARD_ENTRY_CONFIRMED'],
    COMPLETED: [],
    CANCELLED: []
  };

  return actions[status];
}

function matchesExceptionFilter(
  trip: (typeof demoTrips)[number],
  exception: NonNullable<ListTripsParams['exception']>
) {
  if (exception === 'ATTENTION') {
    return trip.priority !== 'NORMAL' || trip.delayMinutes > 0;
  }

  if (exception === 'DELAYED') {
    return trip.delayMinutes > 0 || trip.currentStatus === 'DELAYED';
  }

  if (exception === 'BLOCKED') {
    return trip.currentStatus === 'BLOCKED';
  }

  if (exception === 'STALE') {
    return trip.delayMinutes > 0;
  }

  if (exception === 'INSPECTION') {
    return trip.currentStatus === 'INSPECTION_REQUIRED';
  }

  return trip.currentStatus === 'WAITING_YARD_ENTRY';
}

export const filterableStatuses: TripStatus[] = [
  'PLANNED',
  'IN_PROGRESS',
  'WAITING_YARD_ENTRY',
  'IN_YARD',
  'AT_BORDER_GATE',
  'CUSTOMS_PROCESSING',
  'INSPECTION_REQUIRED',
  'BLOCKED',
  'DELAYED',
  'COMPLETED',
  'CANCELLED'
];
