import type {
  MembershipRole,
  MembershipInvitationStatus,
  MembershipStatus,
  IntegrationSyncRunStatus,
  OrganizationType,
  OwnershipType,
  TripDirection,
  TripEventSource,
  TripEventStatus,
  TripEventType,
  TripExceptionFilter,
  TripMediaType,
  TripParticipantRole,
  TripStatus,
  TripType,
  VehicleType,
  VisibilityLevel
} from '@gatesync/shared';

export type ApiMembership = {
  id: string;
  organizationId: string;
  userId?: string;
  role: MembershipRole;
  status: MembershipStatus;
  createdAt?: string;
  user?: ApiUserProfile | null;
};

export type ApiMembershipInvitation = {
  id: string;
  organizationId: string;
  email: string;
  role: MembershipRole;
  status: MembershipInvitationStatus;
  expiresAt: string;
  createdAt?: string;
  acceptedAt?: string | null;
  inviteCode?: string;
  message?: string;
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

export type ApiCurrentUser = ApiUserProfile & {
  supabaseUserId: string;
  memberships: ApiMembership[];
  role?: string;
};

export type ApiVehicle = {
  id: string;
  organizationId?: string;
  plateNumber: string;
  vehicleType: VehicleType;
  ownershipType?: OwnershipType;
  defaultDriverId?: string | null;
  defaultDriver?: ApiDriverProfile | null;
  _count?: {
    trips?: number;
  };
};

export type ApiDriverProfile = {
  id: string;
  organizationId?: string;
  userId?: string | null;
  displayName?: string | null;
  licenseNumber?: string | null;
  phone?: string | null;
  user?: ApiUserProfile | null;
  vehicles?: ApiVehicle[];
  _count?: {
    trips?: number;
    vehicles?: number;
  };
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

export type ApiTripOperationalPriority = 'HIGH' | 'MEDIUM' | 'NORMAL';

export type ApiTripExceptionCode =
  | 'ARRIVAL_OVERDUE'
  | 'BLOCKED'
  | 'DELAYED_STATUS'
  | 'INSPECTION_REQUIRED'
  | 'PLANNED_START_OVERDUE'
  | 'STATUS_STALE'
  | 'WAITING_YARD';

export type ApiTripNextAction = {
  code: string;
  label: string;
  description: string;
  suggestedEventTypes: TripEventType[];
};

export type ApiTripOperationalState = {
  delayMinutes: number;
  statusDurationMinutes: number;
  priority: ApiTripOperationalPriority;
  exceptionCodes: ApiTripExceptionCode[];
  nextAction: ApiTripNextAction;
  availableManualActions: TripEventType[];
  latestEventType?: TripEventType;
  latestEventOccurredAt?: string;
};

export type ApiTripSummaryEvent = {
  eventType: TripEventType;
  occurredAt: string;
  recordedAt: string;
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
  events?: ApiTripSummaryEvent[];
  operationalState?: ApiTripOperationalState;
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
  delaySummary: {
    delayedTrips: number;
    blockedTrips: number;
    staleTrips: number;
    averageDelayMinutes: number;
    longestDelayMinutes: number;
    groups: Array<{
      key: ApiTripExceptionCode;
      count: number;
    }>;
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

export type ApiCuaKhauSoDirection = 'IMPORT' | 'EXPORT';
export type ApiCuaKhauSoStatus = 1 | 2 | 3;
export type ApiCuaKhauSoPageSize = 10 | 20 | 50 | 100;

export type CuaKhauSoLoginPayload = {
  username: string;
  password: string;
};

export type CreateOrganizationPayload = {
  name: string;
  type?: OrganizationType;
  taxCode?: string;
  phone?: string;
  email?: string;
  address?: string;
};

export type ApiCuaKhauSoSession = {
  authenticated: boolean;
  username?: string;
  expiresAt?: string;
};

export type ListCuaKhauSoDeclarationsParams = {
  pageNumber?: number;
  pageSize?: ApiCuaKhauSoPageSize;
  status?: ApiCuaKhauSoStatus;
  keyword?: string;
  direction?: ApiCuaKhauSoDirection;
  from?: string;
  to?: string;
};

export type ApiCuaKhauSoProcedureStep = {
  step: number;
  label: string;
  done: boolean;
  occurredAt?: string;
  status?: 'DONE' | 'WAITING_AUTHORITY' | 'PENDING';
  description?: string;
};

export type ApiCuaKhauSoDeclarationSummary = {
  externalId: string;
  declarationNumber: string;
  createdAt?: string;
  direction: string;
  declarationType: string;
  status: string;
  statusLabel: string;
  gateName: string;
  gateCode?: string;
  companyGoodsName: string;
  plateNumber: string;
  trailerNumber: string;
  changePlateNumber: string;
  totalWeight?: number;
  completed: boolean;
  paymentStatus: string;
};

export type ApiCuaKhauSoEventCandidate = {
  eventType: TripEventType;
  occurredAt: string;
  sourceRef: string;
  idempotencyKey: string;
  note: string;
  confidence: number;
};

export type ApiCuaKhauSoDeclarationDetail = ApiCuaKhauSoDeclarationSummary & {
  borderGuardDeclarationNumber: string;
  arrivalAt: string;
  feePayingCompany: {
    name: string;
    taxCode: string;
    address: string;
    phone: string;
  };
  parkingPlace: {
    name: string;
    address: string;
    description: string;
  };
  infrastructureCharges: number;
  transferCharges: number;
  vehicles: Array<{
    id?: string;
    plateNumber: string;
    trailerNumber: string;
    driverName: string;
    vehicleType: string;
    nationality: string;
    weight?: number;
  }>;
  goods: Array<{
    id?: string;
    companyName: string;
    companyTaxCode: string;
    declarationNumber: string;
    declarationType: string;
    items: Array<{
      id?: string;
      name: string;
      hsCode: string;
      weight?: number;
      priceVnd?: number;
    }>;
  }>;
  procedureSteps: ApiCuaKhauSoProcedureStep[];
  eventCandidates: ApiCuaKhauSoEventCandidate[];
};

export type ApiCuaKhauSoDeclarationList = {
  declarations: ApiCuaKhauSoDeclarationSummary[];
  totalCount: number;
  totalPage: number;
  message: string;
};

export type SyncCuaKhauSoDeclarationPayload = {
  tripId?: string;
};

export type ApiCuaKhauSoSyncResult = {
  declaration: ApiCuaKhauSoDeclarationSummary & {
    id: string;
  };
  linkedTripId?: string;
  linkedBy: 'requested' | 'declaration' | 'tripCode' | 'created' | 'none';
  recordedEvents: Array<{
    id: string;
    eventType: TripEventType;
    occurredAt: string;
  }>;
  skippedEvents: Array<{
    eventType: TripEventType;
    reason: string;
  }>;
  lastSyncAt: string;
};

export type ApiIntegrationSyncRun = {
  id: string;
  organizationId: string;
  integrationAccountId: string;
  status: IntegrationSyncRunStatus;
  mode: 'AUTO' | 'MANUAL';
  startedAt: string;
  finishedAt?: string | null;
  recordsFetched: number;
  detailsFetched: number;
  eventsCreated: number;
  eventsSkipped: number;
  errorMessage?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type ApiCuaKhauSoSyncRunResult = {
  syncRunId: string;
  recordsFetched: number;
  detailsFetched: number;
  eventsCreated: number;
  eventsSkipped: number;
  failedDeclarations: number;
  syncedDeclarations: string[];
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
  cargoOwnerOrganizationId?: string;
  exception?: TripExceptionFilter;
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

export type ApiTripMediaAttachment = {
  id: string;
  organizationId: string;
  tripId: string;
  tripEventId: string;
  uploadedById?: string | null;
  mediaType: TripMediaType;
  fileName: string;
  mimeType?: string | null;
  storagePath?: string | null;
  publicUrl?: string | null;
  sizeBytes?: number | null;
  message?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: string;
  tripEvent?: ApiTripEvent;
};

export type CreateDriverTripMediaPayload = {
  mediaType: TripMediaType;
  fileName: string;
  mimeType?: string;
  storagePath?: string;
  publicUrl?: string;
  sizeBytes?: number;
  message?: string;
  occurredAt?: string;
  metadata?: Record<string, unknown>;
};

export type ApiDriverTripMediaResult = {
  tripId: string;
  tripCode: string;
  event: ApiTripEvent;
  media: ApiTripMediaAttachment;
};

export type CreateVehiclePayload = {
  plateNumber: string;
  vehicleType: VehicleType;
  ownershipType?: OwnershipType;
  defaultDriverId?: string;
};

export type UpdateVehiclePayload = Partial<Omit<CreateVehiclePayload, 'defaultDriverId'>> & {
  defaultDriverId?: string | null;
};

export type CreateDriverPayload = {
  displayName?: string;
  phone?: string;
  licenseNumber?: string;
  userId?: string;
};

export type UpdateDriverPayload = Partial<Omit<CreateDriverPayload, 'userId'>> & {
  userId?: string | null;
};

export type InviteMembershipPayload = {
  email: string;
  role: MembershipRole;
};

export type AcceptMembershipInvitationPayload = {
  code: string;
};

export type UpdateMembershipPayload = {
  role?: MembershipRole;
  status?: MembershipStatus;
};
