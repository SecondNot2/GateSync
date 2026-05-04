-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "OrganizationType" AS ENUM ('LOGISTICS_COMPANY', 'CARGO_OWNER', 'CUSTOMS_AGENT', 'TRANSPORT_COMPANY', 'YARD_OPERATOR', 'OTHER');

-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('OWNER', 'ADMIN', 'DISPATCHER', 'DOCUMENT_STAFF', 'FIELD_OPERATOR', 'VIEWER', 'BILLING_ADMIN');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'INVITED', 'SUSPENDED', 'REMOVED');

-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('TRUCK', 'TRACTOR_HEAD', 'TRAILER', 'CONTAINER_TRUCK', 'VAN', 'OTHER');

-- CreateEnum
CREATE TYPE "OwnershipType" AS ENUM ('OWNED', 'LEASED', 'PARTNER', 'CUSTOMER', 'OTHER');

-- CreateEnum
CREATE TYPE "TripType" AS ENUM ('EXPORT_WITH_GOODS', 'IMPORT_WITH_GOODS', 'EMPTY_VEHICLE_ENTRY', 'EMPTY_VEHICLE_EXIT', 'YARD_ONLY', 'INTERNAL_TRANSFER');

-- CreateEnum
CREATE TYPE "TripDirection" AS ENUM ('EXPORT', 'IMPORT', 'DOMESTIC', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'WAITING_YARD_ENTRY', 'IN_YARD', 'AT_BORDER_GATE', 'CUSTOMS_PROCESSING', 'INSPECTION_REQUIRED', 'BLOCKED', 'DELAYED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TripParticipantRole" AS ENUM ('OWNER_ORG', 'DRIVER', 'CARGO_OWNER', 'CUSTOMS_AGENT', 'FIELD_OPERATOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "VisibilityLevel" AS ENUM ('FULL', 'OPERATIONAL', 'MILESTONE_ONLY', 'LIMITED');

-- CreateEnum
CREATE TYPE "TripEventType" AS ENUM ('TRIP_CREATED', 'VEHICLE_ASSIGNED', 'DRIVER_ASSIGNED', 'DEPARTED', 'ARRIVED_BORDER_AREA', 'WAITING_YARD_ENTRY', 'YARD_ENTRY_CONFIRMED', 'DRIVER_REPORTED_YARD_ENTRY', 'YARD_EXIT_CONFIRMED', 'DRIVER_REPORTED_GATE_ENTRY', 'DECLARATION_SUBMITTED', 'DECLARATION_APPROVED', 'DECLARATION_REJECTED', 'BORDER_GATE_ENTRY_CONFIRMED', 'CUSTOMS_PROCESSING', 'INSPECTION_REQUIRED', 'INSPECTION_COMPLETED', 'FEE_PAID', 'BORDER_GATE_EXIT_CONFIRMED', 'PROOF_IMAGE_UPLOADED', 'DRIVER_NOTE_ADDED', 'TRIP_CANCELLED', 'TRIP_COMPLETED');

-- CreateEnum
CREATE TYPE "TripEventStatus" AS ENUM ('RECORDED', 'CONFIRMED', 'REJECTED', 'CORRECTED', 'CONFLICTING');

-- CreateEnum
CREATE TYPE "TripEventSource" AS ENUM ('MANUAL', 'DRIVER_APP', 'IMPORT', 'CUA_KHAU_SO', 'XUAN_CUONG', 'GPS', 'SYSTEM', 'AI_ASSISTANT');

-- CreateEnum
CREATE TYPE "IntegrationProvider" AS ENUM ('CUA_KHAU_SO', 'XUAN_CUONG', 'GPS_PROVIDER', 'ZALO_OA', 'EMAIL', 'SMS', 'MOCK');

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('ACTIVE', 'DISABLED', 'ERROR', 'PENDING');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'IN_APP', 'ZALO_OA', 'SMS', 'WEBHOOK');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'READ');

-- CreateEnum
CREATE TYPE "DeclarationType" AS ENUM ('EXPORT', 'IMPORT', 'TRANSIT', 'OTHER');

-- CreateEnum
CREATE TYPE "DeclarationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "OrganizationType" NOT NULL DEFAULT 'LOGISTICS_COMPANY',
    "taxCode" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedById" UUID,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "supabaseUserId" TEXT NOT NULL,
    "fullName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "MembershipRole" NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "deletedById" UUID,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_profiles" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID,
    "displayName" TEXT,
    "licenseNumber" TEXT,
    "phone" TEXT,
    "identityVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "deletedById" UUID,

    CONSTRAINT "driver_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "plateNumber" TEXT NOT NULL,
    "vehicleType" "VehicleType" NOT NULL,
    "ownershipType" "OwnershipType" NOT NULL DEFAULT 'OWNED',
    "defaultDriverId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedById" UUID,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "border_gates" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "province" TEXT,
    "countrySide" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "border_gates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "yards" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "borderGateId" UUID NOT NULL,
    "operatorName" TEXT,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "yards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipments" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "cargoOwnerOrganizationId" UUID,
    "description" TEXT,
    "commodityCode" TEXT,
    "quantity" DECIMAL(18,3),
    "unit" TEXT,
    "weightKg" DECIMAL(18,3),
    "containerNumber" TEXT,
    "sealNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shipments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customs_declarations" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "declarationNumber" TEXT NOT NULL,
    "declarationType" "DeclarationType" NOT NULL,
    "customsOfficeCode" TEXT,
    "status" "DeclarationStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customs_declarations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trips" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "tripCode" TEXT NOT NULL,
    "tripType" "TripType" NOT NULL,
    "direction" "TripDirection" NOT NULL DEFAULT 'UNKNOWN',
    "vehicleId" UUID,
    "driverProfileId" UUID,
    "shipmentId" UUID,
    "customsDeclarationId" UUID,
    "borderGateId" UUID,
    "yardId" UUID,
    "plannedStartAt" TIMESTAMP(3),
    "plannedArrivalAt" TIMESTAMP(3),
    "currentStatus" "TripStatus" NOT NULL DEFAULT 'PLANNED',
    "currentStatusUpdatedAt" TIMESTAMP(3),
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedById" UUID,

    CONSTRAINT "trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_participants" (
    "id" UUID NOT NULL,
    "tripId" UUID NOT NULL,
    "organizationId" UUID,
    "userId" UUID,
    "role" "TripParticipantRole" NOT NULL,
    "visibilityLevel" "VisibilityLevel" NOT NULL DEFAULT 'OPERATIONAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_events" (
    "id" UUID NOT NULL,
    "tripId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "eventType" "TripEventType" NOT NULL,
    "eventStatus" "TripEventStatus" NOT NULL DEFAULT 'RECORDED',
    "source" "TripEventSource" NOT NULL,
    "sourceRef" TEXT,
    "idempotencyKey" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" UUID,
    "confidence" DECIMAL(5,2),
    "note" TEXT,
    "rawPayload" JSONB,

    CONSTRAINT "trip_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_accounts" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "displayName" TEXT NOT NULL,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'PENDING',
    "encryptedCredentials" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "deletedById" UUID,

    CONSTRAINT "integration_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_rules" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "eventType" "TripEventType",
    "condition" JSONB,
    "channels" "NotificationChannel"[],
    "recipientStrategy" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "notification_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "tripId" UUID,
    "recipientUserId" UUID,
    "channel" "NotificationChannel" NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB,
    "sentAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "organizationId" UUID,
    "actorUserId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "organizations_type_idx" ON "organizations"("type");

-- CreateIndex
CREATE INDEX "organizations_taxCode_idx" ON "organizations"("taxCode");

-- CreateIndex
CREATE UNIQUE INDEX "users_supabaseUserId_key" ON "users"("supabaseUserId");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_supabaseUserId_idx" ON "users"("supabaseUserId");

-- CreateIndex
CREATE INDEX "users_phone_idx" ON "users"("phone");

-- CreateIndex
CREATE INDEX "memberships_userId_organizationId_idx" ON "memberships"("userId", "organizationId");

-- CreateIndex
CREATE INDEX "memberships_organizationId_role_status_idx" ON "memberships"("organizationId", "role", "status");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_organizationId_userId_key" ON "memberships"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "driver_profiles_userId_key" ON "driver_profiles"("userId");

-- CreateIndex
CREATE INDEX "driver_profiles_organizationId_idx" ON "driver_profiles"("organizationId");

-- CreateIndex
CREATE INDEX "driver_profiles_phone_idx" ON "driver_profiles"("phone");

-- CreateIndex
CREATE INDEX "driver_profiles_licenseNumber_idx" ON "driver_profiles"("licenseNumber");

-- CreateIndex
CREATE INDEX "vehicles_organizationId_vehicleType_idx" ON "vehicles"("organizationId", "vehicleType");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_organizationId_plateNumber_key" ON "vehicles"("organizationId", "plateNumber");

-- CreateIndex
CREATE UNIQUE INDEX "border_gates_name_key" ON "border_gates"("name");

-- CreateIndex
CREATE INDEX "border_gates_isActive_idx" ON "border_gates"("isActive");

-- CreateIndex
CREATE INDEX "yards_borderGateId_isActive_idx" ON "yards"("borderGateId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "yards_borderGateId_name_key" ON "yards"("borderGateId", "name");

-- CreateIndex
CREATE INDEX "shipments_organizationId_idx" ON "shipments"("organizationId");

-- CreateIndex
CREATE INDEX "shipments_cargoOwnerOrganizationId_idx" ON "shipments"("cargoOwnerOrganizationId");

-- CreateIndex
CREATE INDEX "shipments_containerNumber_idx" ON "shipments"("containerNumber");

-- CreateIndex
CREATE INDEX "customs_declarations_organizationId_status_idx" ON "customs_declarations"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "customs_declarations_organizationId_declarationNumber_key" ON "customs_declarations"("organizationId", "declarationNumber");

-- CreateIndex
CREATE INDEX "trips_organizationId_currentStatus_plannedStartAt_idx" ON "trips"("organizationId", "currentStatus", "plannedStartAt");

-- CreateIndex
CREATE INDEX "trips_driverProfileId_currentStatus_idx" ON "trips"("driverProfileId", "currentStatus");

-- CreateIndex
CREATE INDEX "trips_vehicleId_currentStatus_idx" ON "trips"("vehicleId", "currentStatus");

-- CreateIndex
CREATE UNIQUE INDEX "trips_organizationId_tripCode_key" ON "trips"("organizationId", "tripCode");

-- CreateIndex
CREATE INDEX "trip_participants_tripId_role_idx" ON "trip_participants"("tripId", "role");

-- CreateIndex
CREATE INDEX "trip_participants_organizationId_idx" ON "trip_participants"("organizationId");

-- CreateIndex
CREATE INDEX "trip_participants_userId_idx" ON "trip_participants"("userId");

-- CreateIndex
CREATE INDEX "trip_events_tripId_occurredAt_idx" ON "trip_events"("tripId", "occurredAt");

-- CreateIndex
CREATE INDEX "trip_events_organizationId_eventType_occurredAt_idx" ON "trip_events"("organizationId", "eventType", "occurredAt");

-- CreateIndex
CREATE INDEX "trip_events_source_sourceRef_idx" ON "trip_events"("source", "sourceRef");

-- CreateIndex
CREATE UNIQUE INDEX "trip_events_idempotencyKey_key" ON "trip_events"("idempotencyKey");

-- CreateIndex
CREATE INDEX "integration_accounts_organizationId_provider_idx" ON "integration_accounts"("organizationId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "integration_accounts_organizationId_provider_displayName_key" ON "integration_accounts"("organizationId", "provider", "displayName");

-- CreateIndex
CREATE INDEX "notification_rules_organizationId_isActive_idx" ON "notification_rules"("organizationId", "isActive");

-- CreateIndex
CREATE INDEX "notifications_recipientUserId_status_createdAt_idx" ON "notifications"("recipientUserId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_organizationId_status_idx" ON "notifications"("organizationId", "status");

-- CreateIndex
CREATE INDEX "audit_logs_organizationId_createdAt_idx" ON "audit_logs"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_actorUserId_createdAt_idx" ON "audit_logs"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_profiles" ADD CONSTRAINT "driver_profiles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_profiles" ADD CONSTRAINT "driver_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_defaultDriverId_fkey" FOREIGN KEY ("defaultDriverId") REFERENCES "driver_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "yards" ADD CONSTRAINT "yards_borderGateId_fkey" FOREIGN KEY ("borderGateId") REFERENCES "border_gates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_cargoOwnerOrganizationId_fkey" FOREIGN KEY ("cargoOwnerOrganizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customs_declarations" ADD CONSTRAINT "customs_declarations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_driverProfileId_fkey" FOREIGN KEY ("driverProfileId") REFERENCES "driver_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "shipments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_customsDeclarationId_fkey" FOREIGN KEY ("customsDeclarationId") REFERENCES "customs_declarations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_borderGateId_fkey" FOREIGN KEY ("borderGateId") REFERENCES "border_gates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_yardId_fkey" FOREIGN KEY ("yardId") REFERENCES "yards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_participants" ADD CONSTRAINT "trip_participants_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_participants" ADD CONSTRAINT "trip_participants_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_participants" ADD CONSTRAINT "trip_participants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_events" ADD CONSTRAINT "trip_events_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_events" ADD CONSTRAINT "trip_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_events" ADD CONSTRAINT "trip_events_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_accounts" ADD CONSTRAINT "integration_accounts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_rules" ADD CONSTRAINT "notification_rules_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

