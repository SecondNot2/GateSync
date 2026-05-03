import type {
  MembershipRole,
  MembershipStatus,
  OrganizationType,
  OwnershipType,
  TripDirection,
  TripEventSource,
  TripEventStatus,
  TripEventType,
  TripParticipantRole,
  TripStatus,
  TripType,
  VehicleType,
  VisibilityLevel
} from '@gatesync/shared';

export type ApiMembership = {
  id: string;
  organizationId: string;
  role: MembershipRole;
  status: MembershipStatus;
};

export type ApiOrganization = {
  id: string;
  name: string;
  type: OrganizationType;
  taxCode?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  createdAt?: string;
  updatedAt?: string;
  currentUserMembership: ApiMembership;
};

export type ApiUserProfile = {
  id: string;
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
};

export type ApiVehicle = {
  id: string;
  organizationId?: string;
  plateNumber: string;
  vehicleType: VehicleType;
  ownershipType?: OwnershipType;
  defaultDriverId?: string | null;
};

export type ApiDriverProfile = {
  id: string;
  userId: string;
  licenseNumber?: string | null;
  phone?: string | null;
  user: ApiUserProfile;
};

export type ApiBorderGate = {
  id: string;
  name: string;
  province?: string | null;
  countrySide?: string | null;
  isActive?: boolean;
};

export type ApiYard = {
  id: string;
  name: string;
  borderGateId: string;
  operatorName?: string | null;
  address?: string | null;
  isActive?: boolean;
};

export type ApiShipment = {
  id: string;
  description?: string | null;
  commodityCode?: string | null;
  quantity?: string | number | null;
  unit?: string | null;
  weightKg?: string | number | null;
  containerNumber?: string | null;
  sealNumber?: string | null;
};

export type ApiCustomsDeclaration = {
  id: string;
  declarationNumber: string;
  declarationType: string;
  customsOfficeCode?: string | null;
  status: string;
  submittedAt?: string | null;
  approvedAt?: string | null;
  rejectedAt?: string | null;
};

export type ApiTripCounts = {
  events: number;
  participants: number;
};

export type ApiTripSummary = {
  id: string;
  organizationId: string;
  tripCode: string;
  tripType: TripType;
  direction: TripDirection;
  vehicleId?: string | null;
  driverProfileId?: string | null;
  shipmentId?: string | null;
  customsDeclarationId?: string | null;
  borderGateId?: string | null;
  yardId?: string | null;
  plannedStartAt?: string | null;
  plannedArrivalAt?: string | null;
  currentStatus: TripStatus;
  currentStatusUpdatedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  vehicle?: ApiVehicle | null;
  driverProfile?: ApiDriverProfile | null;
  borderGate?: ApiBorderGate | null;
  yard?: ApiYard | null;
  _count?: ApiTripCounts;
};

export type ApiTripParticipant = {
  id: string;
  role: TripParticipantRole;
  visibilityLevel: VisibilityLevel;
  organizationId?: string | null;
  userId?: string | null;
  createdAt?: string;
  organization?: Pick<ApiOrganization, 'id' | 'name' | 'type'> | null;
  user?: ApiUserProfile | null;
};

export type ApiTripDetail = ApiTripSummary & {
  shipment?: ApiShipment | null;
  customsDeclaration?: ApiCustomsDeclaration | null;
  participants: ApiTripParticipant[];
};

export type ApiTripEvent = {
  id: string;
  tripId: string;
  organizationId: string;
  eventType: TripEventType;
  eventStatus: TripEventStatus;
  source: TripEventSource;
  sourceRef?: string | null;
  idempotencyKey?: string | null;
  occurredAt: string;
  recordedAt: string;
  createdById?: string | null;
  confidence?: string | number | null;
  note?: string | null;
  rawPayload?: unknown;
  createdBy?: ApiUserProfile | null;
};

export type ApiDashboardSummary = {
  generatedAt: string;
  metrics: {
    activeTrips: number;
    delayedTrips: number;
    attentionTrips: number;
    eventsToday: number;
  };
  statusGroups: Array<{
    key: string;
    statuses: TripStatus[];
    count: number;
  }>;
  urgentTrips: ApiTripSummary[];
  recentEvents: Array<
    ApiTripEvent & {
      trip?: Pick<ApiTripSummary, 'id' | 'tripCode'> & {
        borderGate?: ApiBorderGate | null;
        yard?: ApiYard | null;
      };
    }
  >;
};

export type ListTripsParams = {
  search?: string;
  status?: TripStatus;
  limit?: number;
  cursor?: string;
  borderGateId?: string;
  yardId?: string;
  driverProfileId?: string;
  vehicleId?: string;
  from?: string;
  to?: string;
};

export type CreateTripEventPayload = {
  eventType: TripEventType;
  occurredAt: string;
  source?: TripEventSource;
  sourceRef?: string;
  note?: string;
};
