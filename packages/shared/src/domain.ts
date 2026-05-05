import { z } from 'zod';

export const organizationTypes = [
  'LOGISTICS_COMPANY',
  'CARGO_OWNER',
  'CUSTOMS_AGENT',
  'TRANSPORT_COMPANY',
  'YARD_OPERATOR',
  'OTHER'
] as const;

export const membershipRoles = [
  'OWNER',
  'ADMIN',
  'DISPATCHER',
  'DOCUMENT_STAFF',
  'FIELD_OPERATOR',
  'VIEWER',
  'BILLING_ADMIN'
] as const;

export const membershipStatuses = ['ACTIVE', 'INVITED', 'SUSPENDED', 'REMOVED'] as const;

export const membershipInvitationStatuses = ['PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED'] as const;

export const vehicleTypes = [
  'TRUCK',
  'TRACTOR_HEAD',
  'TRAILER',
  'CONTAINER_TRUCK',
  'VAN',
  'OTHER'
] as const;

export const ownershipTypes = ['OWNED', 'LEASED', 'PARTNER', 'CUSTOMER', 'OTHER'] as const;

export const tripTypes = [
  'EXPORT_WITH_GOODS',
  'IMPORT_WITH_GOODS',
  'EMPTY_VEHICLE_ENTRY',
  'EMPTY_VEHICLE_EXIT',
  'YARD_ONLY',
  'INTERNAL_TRANSFER'
] as const;

export const tripDirections = ['EXPORT', 'IMPORT', 'DOMESTIC', 'UNKNOWN'] as const;

export const tripStatuses = [
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
] as const;

export const tripParticipantRoles = [
  'OWNER_ORG',
  'DRIVER',
  'CARGO_OWNER',
  'CUSTOMS_AGENT',
  'FIELD_OPERATOR',
  'VIEWER'
] as const;

export const visibilityLevels = ['FULL', 'OPERATIONAL', 'MILESTONE_ONLY', 'LIMITED'] as const;

export const tripEventTypes = [
  'TRIP_CREATED',
  'VEHICLE_ASSIGNED',
  'DRIVER_ASSIGNED',
  'DEPARTED',
  'ARRIVED_BORDER_AREA',
  'WAITING_YARD_ENTRY',
  'YARD_ENTRY_CONFIRMED',
  'DRIVER_REPORTED_YARD_ENTRY',
  'YARD_EXIT_CONFIRMED',
  'DRIVER_REPORTED_GATE_ENTRY',
  'DECLARATION_SUBMITTED',
  'DECLARATION_APPROVED',
  'DECLARATION_REJECTED',
  'BORDER_GATE_ENTRY_CONFIRMED',
  'CUSTOMS_PROCESSING',
  'INSPECTION_REQUIRED',
  'INSPECTION_COMPLETED',
  'FEE_PAID',
  'BORDER_GATE_EXIT_CONFIRMED',
  'TRANSSHIPMENT_ELIGIBLE',
  'TRANSSHIPMENT_SIGNED',
  'TRANSSHIPMENT_STARTED',
  'TRANSSHIPMENT_COMPLETED',
  'DRIVER_LOCATION_SHARED',
  'DRIVER_MEDIA_UPLOADED',
  'RELEASE_READY',
  'RELEASE_REQUESTED',
  'VEHICLE_RELEASED',
  'PROOF_IMAGE_UPLOADED',
  'DRIVER_NOTE_ADDED',
  'TRIP_CANCELLED',
  'TRIP_COMPLETED'
] as const;

export const tripEventStatuses = [
  'RECORDED',
  'CONFIRMED',
  'REJECTED',
  'CORRECTED',
  'CONFLICTING'
] as const;

export const tripEventSources = [
  'MANUAL',
  'DRIVER_APP',
  'IMPORT',
  'CUA_KHAU_SO',
  'XUAN_CUONG',
  'GPS',
  'SYSTEM',
  'AI_ASSISTANT'
] as const;

export const tripExceptionFilters = [
  'ATTENTION',
  'DELAYED',
  'BLOCKED',
  'STALE',
  'INSPECTION',
  'WAITING_YARD'
] as const;

export const integrationProviders = [
  'CUA_KHAU_SO',
  'XUAN_CUONG',
  'GPS_PROVIDER',
  'ZALO_OA',
  'EMAIL',
  'SMS',
  'MOCK'
] as const;

export const notificationChannels = [
  'EMAIL',
  'IN_APP',
  'WEB_PUSH',
  'ZALO_OA',
  'SMS',
  'WEBHOOK'
] as const;

export const integrationSyncRunStatuses = ['RUNNING', 'SUCCEEDED', 'FAILED', 'PARTIAL'] as const;

export const tripMediaTypes = ['IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'OTHER'] as const;

export const organizationPermissions = [
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
] as const;

export type OrganizationType = (typeof organizationTypes)[number];
export type MembershipRole = (typeof membershipRoles)[number];
export type MembershipStatus = (typeof membershipStatuses)[number];
export type MembershipInvitationStatus = (typeof membershipInvitationStatuses)[number];
export type VehicleType = (typeof vehicleTypes)[number];
export type OwnershipType = (typeof ownershipTypes)[number];
export type TripType = (typeof tripTypes)[number];
export type TripDirection = (typeof tripDirections)[number];
export type TripStatus = (typeof tripStatuses)[number];
export type TripParticipantRole = (typeof tripParticipantRoles)[number];
export type VisibilityLevel = (typeof visibilityLevels)[number];
export type TripEventType = (typeof tripEventTypes)[number];
export type TripEventStatus = (typeof tripEventStatuses)[number];
export type TripEventSource = (typeof tripEventSources)[number];
export type TripExceptionFilter = (typeof tripExceptionFilters)[number];
export type IntegrationProvider = (typeof integrationProviders)[number];
export type NotificationChannel = (typeof notificationChannels)[number];
export type IntegrationSyncRunStatus = (typeof integrationSyncRunStatuses)[number];
export type TripMediaType = (typeof tripMediaTypes)[number];
export type OrganizationPermission = (typeof organizationPermissions)[number];

export const rolePermissions = {
  OWNER: [
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
  ADMIN: [
    'organizations:read',
    'organizations:update',
    'memberships:manage',
    'fleet:manage',
    'trips:read',
    'trips:manage',
    'integrations:cua-khau-so:read',
    'integrations:cua-khau-so:sync',
    'integrations:cua-khau-so:connect'
  ],
  DISPATCHER: [
    'organizations:read',
    'fleet:manage',
    'trips:read',
    'trips:manage',
    'integrations:cua-khau-so:read',
    'integrations:cua-khau-so:sync',
    'integrations:cua-khau-so:connect'
  ],
  DOCUMENT_STAFF: [
    'organizations:read',
    'trips:read',
    'trips:manage',
    'integrations:cua-khau-so:read',
    'integrations:cua-khau-so:sync',
    'integrations:cua-khau-so:connect'
  ],
  FIELD_OPERATOR: ['organizations:read', 'trips:read', 'trips:manage'],
  VIEWER: ['organizations:read', 'trips:read'],
  BILLING_ADMIN: ['organizations:read', 'billing:manage']
} satisfies Record<MembershipRole, OrganizationPermission[]>;

export function getRolePermissions(role: MembershipRole): OrganizationPermission[] {
  return [...rolePermissions[role]];
}

export function hasOrganizationPermission(
  role: MembershipRole,
  permission: OrganizationPermission
) {
  return rolePermissions[role].some((item) => item === permission);
}

export function hasAnyOrganizationPermission(
  role: MembershipRole,
  permissions: OrganizationPermission[]
) {
  return permissions.some((permission) => hasOrganizationPermission(role, permission));
}

export const organizationTypeSchema = z.enum(organizationTypes);
export const membershipRoleSchema = z.enum(membershipRoles);
export const vehicleTypeSchema = z.enum(vehicleTypes);
export const tripTypeSchema = z.enum(tripTypes);
export const tripDirectionSchema = z.enum(tripDirections);
export const tripStatusSchema = z.enum(tripStatuses);
export const tripEventTypeSchema = z.enum(tripEventTypes);
export const tripEventSourceSchema = z.enum(tripEventSources);
export const notificationChannelSchema = z.enum(notificationChannels);
