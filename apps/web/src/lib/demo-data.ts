import type {
  MembershipRole,
  MembershipStatus,
  OrganizationType,
  OwnershipType,
  TripDirection,
  TripEventSource,
  TripEventStatus,
  TripEventType,
  TripStatus,
  TripType,
  VehicleType
} from '@gatesync/shared';

export type DemoTripEvent = {
  id: string;
  eventType: TripEventType;
  eventStatus: TripEventStatus;
  source: TripEventSource;
  occurredAt: string;
  recordedAt: string;
  actor: string;
  note: string;
  confidence?: number;
};

export type DemoTrip = {
  id: string;
  tripCode: string;
  tripType: TripType;
  direction: TripDirection;
  currentStatus: TripStatus;
  statusUpdatedAt: string;
  borderGate: string;
  yard: string;
  vehicle: {
    plateNumber: string;
    type: VehicleType;
  };
  driver: {
    name: string;
    phone: string;
  };
  cargoOwner: string;
  customsAgent: string;
  shipment: {
    description: string;
    containerNumber: string;
    sealNumber: string;
    weightKg: string;
  };
  declaration: {
    number: string;
    status: string;
    customsOfficeCode: string;
  };
  plannedStartAt: string;
  plannedArrivalAt: string;
  delayMinutes: number;
  priority: 'HIGH' | 'MEDIUM' | 'NORMAL';
  nextAction: string;
  participants: string[];
  events: DemoTripEvent[];
};

export type DemoMember = {
  id: string;
  name: string;
  email: string;
  role: MembershipRole;
  status: MembershipStatus;
  lastActiveAt: string;
};

export type DemoVehicle = {
  id: string;
  plateNumber: string;
  vehicleType: VehicleType;
  ownershipType: OwnershipType;
  defaultDriver: string;
  currentTrip: string;
  health: string;
};

export type DemoDriver = {
  id: string;
  name: string;
  phone: string;
  licenseNumber: string;
  assignedVehicle: string;
  activeTrip: string;
  identityStatus: string;
};

export const demoOrganization = {
  name: 'Công ty Logistics Hữu Nghị',
  type: 'LOGISTICS_COMPANY',
  taxCode: '0109988776',
  location: 'Lạng Sơn, Việt Nam',
  activeTrips: 128,
  delayedTrips: 14,
  eventCountToday: 412,
  controlScore: '92%'
} satisfies {
  name: string;
  type: OrganizationType;
  taxCode: string;
  location: string;
  activeTrips: number;
  delayedTrips: number;
  eventCountToday: number;
  controlScore: string;
};

export const operationsMetrics = [
  {
    label: 'Chuyến đang vận hành',
    value: '128',
    trend: '+18 so với hôm qua',
    indicatorClass: 'bg-sky-400'
  },
  {
    label: 'Xe chậm cần xử lý',
    value: '14',
    trend: '6 xe quá 2 giờ',
    indicatorClass: 'bg-amber-400'
  },
  {
    label: 'Cảnh báo bãi/cửa khẩu',
    value: '7',
    trend: '3 cảnh báo mới',
    indicatorClass: 'bg-rose-400'
  },
  {
    label: 'Sự kiện hôm nay',
    value: '412',
    trend: '95% đã xác nhận',
    indicatorClass: 'bg-emerald-400'
  }
];

export const operationsStatusGroups: Array<{
  label: string;
  description: string;
  count: number;
  statuses: TripStatus[];
  tone: string;
}> = [
  {
    label: 'Chưa bắt đầu',
    description: 'Chuyến đã lập kế hoạch và chờ xuất phát',
    count: 19,
    statuses: ['PLANNED'],
    tone: 'bg-slate-100 text-slate-700'
  },
  {
    label: 'Đang di chuyển',
    description: 'Xe đang tiến về khu vực cửa khẩu hoặc điểm tập kết',
    count: 36,
    statuses: ['IN_PROGRESS', 'AT_BORDER_GATE'],
    tone: 'bg-sky-100 text-sky-700'
  },
  {
    label: 'Chờ vào bãi',
    description: 'Xe đã đến khu vực cửa khẩu và đang chờ điều phối bãi',
    count: 21,
    statuses: ['WAITING_YARD_ENTRY'],
    tone: 'bg-amber-100 text-amber-700'
  },
  {
    label: 'Trong bãi',
    description: 'Xe đang nằm trong bãi hoặc chờ xác nhận rời bãi',
    count: 28,
    statuses: ['IN_YARD'],
    tone: 'bg-indigo-100 text-indigo-700'
  },
  {
    label: 'Xử lý hải quan',
    description: 'Tờ khai, kiểm hóa hoặc phí đang được xử lý',
    count: 17,
    statuses: ['CUSTOMS_PROCESSING', 'INSPECTION_REQUIRED'],
    tone: 'bg-violet-100 text-violet-700'
  },
  {
    label: 'Chậm hoặc bị chặn',
    description: 'Cần điều phối viên theo dõi ngay',
    count: 7,
    statuses: ['DELAYED', 'BLOCKED'],
    tone: 'bg-rose-100 text-rose-700'
  }
];

export const demoTrips: DemoTrip[] = [
  {
    id: 'gs-exp-1024',
    tripCode: 'GS-EXP-1024',
    tripType: 'EXPORT_WITH_GOODS',
    direction: 'EXPORT',
    currentStatus: 'IN_YARD',
    statusUpdatedAt: '03/05/2026 16:35',
    borderGate: 'Hữu Nghị',
    yard: 'Bãi Xuân Cương',
    vehicle: {
      plateNumber: '29H-456.78',
      type: 'CONTAINER_TRUCK'
    },
    driver: {
      name: 'Nguyễn Văn Hùng',
      phone: '0988 123 456'
    },
    cargoOwner: 'Công ty Nông sản An Phát',
    customsAgent: 'Đại lý Hải quan Việt Bắc',
    shipment: {
      description: 'Thanh long tươi xuất khẩu',
      containerNumber: 'TEMU 4589210',
      sealNumber: 'VN-88421',
      weightKg: '24.500 kg'
    },
    declaration: {
      number: '103987654320',
      status: 'Đã nộp',
      customsOfficeCode: 'LS01'
    },
    plannedStartAt: '03/05/2026 08:00',
    plannedArrivalAt: '03/05/2026 14:30',
    delayMinutes: 45,
    priority: 'MEDIUM',
    nextAction: 'Xác nhận xe rời bãi để chuyển sang cửa khẩu',
    participants: ['Điều phối', 'Chứng từ', 'Hiện trường', 'Tài xế'],
    events: [
      {
        id: 'evt-1024-1',
        eventType: 'TRIP_CREATED',
        eventStatus: 'CONFIRMED',
        source: 'MANUAL',
        occurredAt: '03/05/2026 07:42',
        recordedAt: '03/05/2026 07:43',
        actor: 'Trần Thị Mai',
        note: 'Điều phối tạo chuyến xuất khẩu có hàng.'
      },
      {
        id: 'evt-1024-2',
        eventType: 'DRIVER_ASSIGNED',
        eventStatus: 'CONFIRMED',
        source: 'MANUAL',
        occurredAt: '03/05/2026 07:48',
        recordedAt: '03/05/2026 07:49',
        actor: 'Trần Thị Mai',
        note: 'Gán tài xế Nguyễn Văn Hùng và xe 29H-456.78.'
      },
      {
        id: 'evt-1024-3',
        eventType: 'DEPARTED',
        eventStatus: 'CONFIRMED',
        source: 'DRIVER_APP',
        occurredAt: '03/05/2026 08:16',
        recordedAt: '03/05/2026 08:18',
        actor: 'Nguyễn Văn Hùng',
        note: 'Tài xế xác nhận xe xuất phát từ kho Bắc Ninh.'
      },
      {
        id: 'evt-1024-4',
        eventType: 'YARD_ENTRY_CONFIRMED',
        eventStatus: 'RECORDED',
        source: 'XUAN_CUONG',
        occurredAt: '03/05/2026 15:20',
        recordedAt: '03/05/2026 15:22',
        actor: 'Bãi Xuân Cương',
        note: 'Xe đã vào bãi, chờ điều phối luồng ra cửa khẩu.',
        confidence: 0.96
      }
    ]
  },
  {
    id: 'gs-imp-2048',
    tripCode: 'GS-IMP-2048',
    tripType: 'IMPORT_WITH_GOODS',
    direction: 'IMPORT',
    currentStatus: 'CUSTOMS_PROCESSING',
    statusUpdatedAt: '03/05/2026 15:58',
    borderGate: 'Tân Thanh',
    yard: 'Bãi Tân Thanh 02',
    vehicle: {
      plateNumber: '12C-888.21',
      type: 'TRUCK'
    },
    driver: {
      name: 'Lê Quốc Bình',
      phone: '0977 888 221'
    },
    cargoOwner: 'Công ty Thiết bị Minh Hải',
    customsAgent: 'Đại lý Hải quan Đồng Đăng',
    shipment: {
      description: 'Linh kiện máy đóng gói',
      containerNumber: 'Không container',
      sealNumber: 'CN-55719',
      weightKg: '11.200 kg'
    },
    declaration: {
      number: '204812348888',
      status: 'Đang xử lý',
      customsOfficeCode: 'LS02'
    },
    plannedStartAt: '03/05/2026 06:30',
    plannedArrivalAt: '03/05/2026 13:00',
    delayMinutes: 130,
    priority: 'HIGH',
    nextAction: 'Kiểm tra lý do tờ khai kéo dài quá 2 giờ',
    participants: ['Điều phối', 'Chứng từ', 'Đại lý hải quan', 'Tài xế'],
    events: [
      {
        id: 'evt-2048-1',
        eventType: 'TRIP_CREATED',
        eventStatus: 'CONFIRMED',
        source: 'IMPORT',
        occurredAt: '02/05/2026 17:20',
        recordedAt: '02/05/2026 17:22',
        actor: 'Nhập Excel vận hành',
        note: 'Chuyến nhập khẩu được tạo từ tệp kế hoạch ngày.'
      },
      {
        id: 'evt-2048-2',
        eventType: 'ARRIVED_BORDER_AREA',
        eventStatus: 'CONFIRMED',
        source: 'DRIVER_APP',
        occurredAt: '03/05/2026 12:38',
        recordedAt: '03/05/2026 12:40',
        actor: 'Lê Quốc Bình',
        note: 'Tài xế báo đã đến khu vực Tân Thanh.'
      },
      {
        id: 'evt-2048-3',
        eventType: 'DECLARATION_SUBMITTED',
        eventStatus: 'CONFIRMED',
        source: 'MANUAL',
        occurredAt: '03/05/2026 13:26',
        recordedAt: '03/05/2026 13:29',
        actor: 'Phạm Thu Hà',
        note: 'Nhân sự chứng từ xác nhận đã nộp tờ khai nhập khẩu.'
      },
      {
        id: 'evt-2048-4',
        eventType: 'CUSTOMS_PROCESSING',
        eventStatus: 'RECORDED',
        source: 'SYSTEM',
        occurredAt: '03/05/2026 15:58',
        recordedAt: '03/05/2026 15:58',
        actor: 'GateSync',
        note: 'Hệ thống gắn cờ xử lý kéo dài so với ngưỡng nội bộ.'
      }
    ]
  },
  {
    id: 'gs-yard-3310',
    tripCode: 'GS-YARD-3310',
    tripType: 'YARD_ONLY',
    direction: 'DOMESTIC',
    currentStatus: 'WAITING_YARD_ENTRY',
    statusUpdatedAt: '03/05/2026 16:10',
    borderGate: 'Chi Ma',
    yard: 'Bãi Chi Ma 01',
    vehicle: {
      plateNumber: '98R-112.45',
      type: 'TRACTOR_HEAD'
    },
    driver: {
      name: 'Hoàng Minh Đức',
      phone: '0966 112 445'
    },
    cargoOwner: 'Nội bộ',
    customsAgent: 'Không áp dụng',
    shipment: {
      description: 'Điều chuyển đầu kéo trong khu vực bãi',
      containerNumber: 'Không container',
      sealNumber: 'Không áp dụng',
      weightKg: 'Không áp dụng'
    },
    declaration: {
      number: 'Không áp dụng',
      status: 'Không áp dụng',
      customsOfficeCode: 'CM01'
    },
    plannedStartAt: '03/05/2026 11:00',
    plannedArrivalAt: '03/05/2026 12:30',
    delayMinutes: 210,
    priority: 'HIGH',
    nextAction: 'Liên hệ hiện trường để xác nhận xe có được vào bãi hay chưa',
    participants: ['Điều phối', 'Hiện trường', 'Tài xế'],
    events: [
      {
        id: 'evt-3310-1',
        eventType: 'TRIP_CREATED',
        eventStatus: 'CONFIRMED',
        source: 'MANUAL',
        occurredAt: '03/05/2026 10:12',
        recordedAt: '03/05/2026 10:13',
        actor: 'Trần Thị Mai',
        note: 'Tạo chuyến điều phối đầu kéo trong khu vực Chi Ma.'
      },
      {
        id: 'evt-3310-2',
        eventType: 'DEPARTED',
        eventStatus: 'CONFIRMED',
        source: 'DRIVER_APP',
        occurredAt: '03/05/2026 11:08',
        recordedAt: '03/05/2026 11:09',
        actor: 'Hoàng Minh Đức',
        note: 'Tài xế xác nhận đã xuất phát đến bãi Chi Ma 01.'
      },
      {
        id: 'evt-3310-3',
        eventType: 'WAITING_YARD_ENTRY',
        eventStatus: 'CONFLICTING',
        source: 'SYSTEM',
        occurredAt: '03/05/2026 16:10',
        recordedAt: '03/05/2026 16:10',
        actor: 'GateSync',
        note: 'Chưa có xác nhận từ bãi sau hơn 3 giờ; cần kiểm tra xung đột nguồn.'
      }
    ]
  },
  {
    id: 'gs-exp-1188',
    tripCode: 'GS-EXP-1188',
    tripType: 'EXPORT_WITH_GOODS',
    direction: 'EXPORT',
    currentStatus: 'INSPECTION_REQUIRED',
    statusUpdatedAt: '03/05/2026 14:45',
    borderGate: 'Hữu Nghị',
    yard: 'Bãi Xuân Cương',
    vehicle: {
      plateNumber: '15C-902.18',
      type: 'CONTAINER_TRUCK'
    },
    driver: {
      name: 'Vũ Mạnh Cường',
      phone: '0933 902 180'
    },
    cargoOwner: 'Công ty Dệt may Sao Việt',
    customsAgent: 'Đại lý Hải quan Việt Bắc',
    shipment: {
      description: 'Vải thành phẩm xuất khẩu',
      containerNumber: 'CAIU 7719204',
      sealNumber: 'VN-77204',
      weightKg: '18.900 kg'
    },
    declaration: {
      number: '118899201188',
      status: 'Yêu cầu kiểm hóa',
      customsOfficeCode: 'LS01'
    },
    plannedStartAt: '03/05/2026 05:30',
    plannedArrivalAt: '03/05/2026 12:00',
    delayMinutes: 0,
    priority: 'MEDIUM',
    nextAction: 'Theo dõi kết quả kiểm hóa và cập nhật ảnh minh chứng nếu cần',
    participants: ['Điều phối', 'Chứng từ', 'Hiện trường', 'Tài xế'],
    events: [
      {
        id: 'evt-1188-1',
        eventType: 'TRIP_CREATED',
        eventStatus: 'CONFIRMED',
        source: 'MANUAL',
        occurredAt: '02/05/2026 16:05',
        recordedAt: '02/05/2026 16:06',
        actor: 'Trần Thị Mai',
        note: 'Tạo chuyến xuất khẩu vải thành phẩm.'
      },
      {
        id: 'evt-1188-2',
        eventType: 'YARD_ENTRY_CONFIRMED',
        eventStatus: 'CONFIRMED',
        source: 'XUAN_CUONG',
        occurredAt: '03/05/2026 11:52',
        recordedAt: '03/05/2026 11:54',
        actor: 'Bãi Xuân Cương',
        note: 'Xe vào bãi đúng kế hoạch.',
        confidence: 0.98
      },
      {
        id: 'evt-1188-3',
        eventType: 'INSPECTION_REQUIRED',
        eventStatus: 'CONFIRMED',
        source: 'MANUAL',
        occurredAt: '03/05/2026 14:45',
        recordedAt: '03/05/2026 14:46',
        actor: 'Phạm Thu Hà',
        note: 'Tờ khai bị phân luồng kiểm hóa; đội hiện trường đã nhận việc.'
      }
    ]
  }
];

export const recentTripEvents = demoTrips
  .flatMap((trip) =>
    trip.events.map((event) => ({
      ...event,
      tripId: trip.id,
      tripCode: trip.tripCode,
      borderGate: trip.borderGate
    }))
  )
  .slice(-8)
  .reverse();

export const adminMembers: DemoMember[] = [
  {
    id: 'mem-1',
    name: 'Lê Minh Anh',
    email: 'minhanh@gatesync.local',
    role: 'OWNER',
    status: 'ACTIVE',
    lastActiveAt: '03/05/2026 16:48'
  },
  {
    id: 'mem-2',
    name: 'Trần Thị Mai',
    email: 'mai.dispatch@gatesync.local',
    role: 'DISPATCHER',
    status: 'ACTIVE',
    lastActiveAt: '03/05/2026 16:52'
  },
  {
    id: 'mem-3',
    name: 'Phạm Thu Hà',
    email: 'ha.docs@gatesync.local',
    role: 'DOCUMENT_STAFF',
    status: 'ACTIVE',
    lastActiveAt: '03/05/2026 16:20'
  },
  {
    id: 'mem-4',
    name: 'Đỗ Quốc Nam',
    email: 'nam.field@gatesync.local',
    role: 'FIELD_OPERATOR',
    status: 'INVITED',
    lastActiveAt: 'Chưa đăng nhập'
  }
];

export const adminVehicles: DemoVehicle[] = [
  {
    id: 'veh-1',
    plateNumber: '29H-456.78',
    vehicleType: 'CONTAINER_TRUCK',
    ownershipType: 'OWNED',
    defaultDriver: 'Nguyễn Văn Hùng',
    currentTrip: 'GS-EXP-1024',
    health: 'Đang vận hành'
  },
  {
    id: 'veh-2',
    plateNumber: '12C-888.21',
    vehicleType: 'TRUCK',
    ownershipType: 'PARTNER',
    defaultDriver: 'Lê Quốc Bình',
    currentTrip: 'GS-IMP-2048',
    health: 'Cần theo dõi chậm'
  },
  {
    id: 'veh-3',
    plateNumber: '98R-112.45',
    vehicleType: 'TRACTOR_HEAD',
    ownershipType: 'LEASED',
    defaultDriver: 'Hoàng Minh Đức',
    currentTrip: 'GS-YARD-3310',
    health: 'Chờ xác nhận bãi'
  },
  {
    id: 'veh-4',
    plateNumber: '15C-902.18',
    vehicleType: 'CONTAINER_TRUCK',
    ownershipType: 'OWNED',
    defaultDriver: 'Vũ Mạnh Cường',
    currentTrip: 'GS-EXP-1188',
    health: 'Đang kiểm hóa'
  }
];

export const adminDrivers: DemoDriver[] = [
  {
    id: 'drv-1',
    name: 'Nguyễn Văn Hùng',
    phone: '0988 123 456',
    licenseNumber: 'LX-29-004211',
    assignedVehicle: '29H-456.78',
    activeTrip: 'GS-EXP-1024',
    identityStatus: 'Đã xác minh'
  },
  {
    id: 'drv-2',
    name: 'Lê Quốc Bình',
    phone: '0977 888 221',
    licenseNumber: 'LX-12-008821',
    assignedVehicle: '12C-888.21',
    activeTrip: 'GS-IMP-2048',
    identityStatus: 'Đã xác minh'
  },
  {
    id: 'drv-3',
    name: 'Hoàng Minh Đức',
    phone: '0966 112 445',
    licenseNumber: 'LX-98-001245',
    assignedVehicle: '98R-112.45',
    activeTrip: 'GS-YARD-3310',
    identityStatus: 'Cần bổ sung hồ sơ'
  },
  {
    id: 'drv-4',
    name: 'Vũ Mạnh Cường',
    phone: '0933 902 180',
    licenseNumber: 'LX-15-009218',
    assignedVehicle: '15C-902.18',
    activeTrip: 'GS-EXP-1188',
    identityStatus: 'Đã xác minh'
  }
];

export function getTripById(tripId: string) {
  return demoTrips.find((trip) => trip.id === tripId);
}

export function getPriorityLabel(priority: DemoTrip['priority']) {
  const labels: Record<DemoTrip['priority'], string> = {
    HIGH: 'Ưu tiên cao',
    MEDIUM: 'Ưu tiên vừa',
    NORMAL: 'Theo dõi thường'
  };

  return labels[priority];
}
