import type {
  MembershipRole,
  MembershipInvitationStatus,
  MembershipStatus,
  IntegrationSyncRunStatus,
  NotificationChannel,
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
  sourceProvider?: string | null;
  sourceExternalId?: string | null;
  sourceStatus?: string | null;
  sourceObservedAt?: string | null;
  sourceUpdatedAt?: string | null;
  lastIngestedAt?: string | null;
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

export type ApiTripSourceSummary = {
  provider: 'CUA_KHAU_SO';
  declarationNumber?: string;
  statusLabel?: string;
  gateName?: string;
  yardName?: string;
  vehiclePlate?: string;
  driverName?: string;
  paymentStatus?: string;
  paymentCompleted?: boolean;
  completed?: boolean;
  sourceObservedAt?: string;
  sourceUpdatedAt?: string;
  lastIngestedAt?: string;
  freshnessLabel?: string;
  stale?: boolean;
  warningCodes?: Array<'STALE' | 'PAYMENT_PENDING' | 'INSPECTION' | string>;
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
  customsDeclaration?: ApiCustomsDeclaration | null;
  cuaKhauSoDeclaration?: ApiCuaKhauSoTripDeclaration | null;
  borderGate?: ApiBorderGate | null;
  yard?: ApiYard | null;
  events?: ApiTripSummaryEvent[];
  sourceSummary?: ApiTripSourceSummary;
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

export type ApiNotificationStatus = 'PENDING' | 'SENT' | 'FAILED' | 'READ';

export type ApiNotificationPayload = {
  kind?: 'trip_event' | string;
  eventId?: string;
  eventType?: TripEventType;
  currentStatus?: TripStatus;
  occurredAt?: string;
  title?: string;
  message?: string;
  declarationNumber?: string;
  idempotencyKey?: string;
  delivery?: string;
};

export type ApiNotification = {
  id: string;
  organizationId: string;
  tripId?: string | null;
  recipientUserId?: string | null;
  channel: NotificationChannel;
  status: ApiNotificationStatus;
  payload?: ApiNotificationPayload | Record<string, unknown> | null;
  sentAt?: string | null;
  failedAt?: string | null;
  readAt?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  trip?: Pick<ApiTripSummary, 'id' | 'tripCode' | 'currentStatus'> | null;
  organization?: Pick<ApiOrganization, 'id' | 'name' | 'type'> | null;
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

export type ApiCuaKhauSoHealth = {
  configured: boolean;
  status: string;
  freshnessLabel: string;
  stale: boolean;
  lastSyncAt?: string;
  lastSuccessfulSyncAt?: string;
  lastDetailRefreshedAt?: string;
  lastErrorAt?: string;
  nextRetryAt?: string;
  syncLagSeconds?: number;
  consecutiveFailures?: number;
  lastErrorMessage?: string | null;
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
  sourceObservedAt?: string;
  lastIngestedAt?: string;
  linkedTripId?: string;
  linkedTripCode?: string;
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
  createdBy?: {
    username: string;
    displayName: string;
    phoneNumber: string;
  };
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
  transshipment: {
    licenseRegistered: boolean;
    transportLicenseConfirmed: boolean;
    chinaVehicleEntered?: boolean;
    vietnamVehicleEntered?: boolean;
    foreignVehicleRequired?: boolean;
    foreignVehicleEntered?: boolean;
    borderGuardLagging?: boolean;
    eligible: boolean;
    signed: boolean;
    licenseNumber: string;
    statusLabel?: string;
    unmetConditions?: string[];
    borderGuardLaggedSince?: string;
    eligibleAt?: string;
    signedAt?: string;
  };
  checks?: Array<{
    key: string;
    label: string;
    done: boolean;
    detail: string;
  }>;
  vehicles: Array<{
    id?: string;
    plateNumber: string;
    trailerNumber: string;
    driverName: string;
    vehicleType: string;
    nationality: string;
    containerNumber?: string;
    phoneNumber?: string;
    statusLabel?: string;
    transshipmentPlateNumber?: string;
    responsiblePlateNumber?: string;
    goodsGroup?: string;
    note?: string;
    transportLicenseNumber?: string;
    weight?: number;
    selfWeight?: number;
    price?: number;
    feeRate?: number;
    unloadingPlace?: string;
    borderGuardConfirmed?: boolean;
    customsArrivalConfirmed?: boolean;
    inParkingConfirmed?: boolean;
    transportLicenseConfirmed?: boolean;
    borderGuardAt?: string;
    customsArrivalAt?: string;
    inParkingAt?: string;
    transportLicenseConfirmedAt?: string;
    customsProcessingAt?: string;
    outParkingBorderGuardAt?: string;
    outParkingCustomsAt?: string;
  }>;
  transshipmentVehicles?: Array<{
    id?: string;
    sourcePlateNumber: string;
    plateNumber: string;
    driverName: string;
    vehicleType: string;
    areaChange: string;
    containerNumber?: string;
    trailerNumber?: string;
    customsDeclarationNumbers?: string;
    statusLabel?: string;
    note?: string;
    weight?: number;
    driverIdentityNumber?: string;
    price?: number;
    feeRate?: number;
    vehicleRegistrationFormId?: string;
    borderGuardEntered: boolean;
    customsEntered: boolean;
    changeConfirmed: boolean;
    customsOutConfirmed: boolean;
    medicalQuarantineConfirmed: boolean;
    borderGuardEnteredAt?: string;
    customsEnteredAt?: string;
    changeConfirmedAt?: string;
    borderGuardOutAt?: string;
    customsOutAt?: string;
    medicalQuarantineAt?: string;
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

export type ApiCuaKhauSoTripDeclaration = Partial<ApiCuaKhauSoDeclarationDetail> &
  Partial<ApiCuaKhauSoDeclarationSummary> & {
    id?: string;
    externalId?: string;
    declarationNumber?: string;
    sourceStatus?: string | null;
    sourceObservedAt?: string | null;
    sourceUpdatedAt?: string | null;
    lastIngestedAt?: string | null;
    freshnessLabel?: string;
    stale?: boolean;
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
  mode: 'AUTO' | 'MANUAL' | 'REFRESH_ON_OPEN';
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
  syncRunId?: string;
  skipped?: boolean;
  reason?: string;
  recordsFetched: number;
  detailsFetched: number;
  eventsCreated: number;
  eventsSkipped: number;
  failedDeclarations: number;
  syncedDeclarations: string[];
  lastObservedAt?: string;
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
