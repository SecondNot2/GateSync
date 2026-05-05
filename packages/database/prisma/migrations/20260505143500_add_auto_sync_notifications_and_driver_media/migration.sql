ALTER TYPE "TripEventType" ADD VALUE 'TRANSSHIPMENT_ELIGIBLE';
ALTER TYPE "TripEventType" ADD VALUE 'TRANSSHIPMENT_SIGNED';
ALTER TYPE "TripEventType" ADD VALUE 'TRANSSHIPMENT_STARTED';
ALTER TYPE "TripEventType" ADD VALUE 'TRANSSHIPMENT_COMPLETED';
ALTER TYPE "TripEventType" ADD VALUE 'DRIVER_LOCATION_SHARED';
ALTER TYPE "TripEventType" ADD VALUE 'DRIVER_MEDIA_UPLOADED';
ALTER TYPE "TripEventType" ADD VALUE 'RELEASE_READY';
ALTER TYPE "TripEventType" ADD VALUE 'RELEASE_REQUESTED';
ALTER TYPE "TripEventType" ADD VALUE 'VEHICLE_RELEASED';

ALTER TYPE "NotificationChannel" ADD VALUE 'WEB_PUSH';

CREATE TYPE "IntegrationSyncRunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED', 'PARTIAL');
CREATE TYPE "TripMediaType" AS ENUM ('IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'OTHER');

CREATE TABLE "integration_sync_runs" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "integrationAccountId" UUID NOT NULL,
    "status" "IntegrationSyncRunStatus" NOT NULL DEFAULT 'RUNNING',
    "mode" TEXT NOT NULL DEFAULT 'AUTO',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "recordsFetched" INTEGER NOT NULL DEFAULT 0,
    "detailsFetched" INTEGER NOT NULL DEFAULT 0,
    "eventsCreated" INTEGER NOT NULL DEFAULT 0,
    "eventsSkipped" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "metadata" JSONB,
    CONSTRAINT "integration_sync_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "trip_media_attachments" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "tripId" UUID NOT NULL,
    "tripEventId" UUID,
    "uploadedById" UUID,
    "mediaType" "TripMediaType" NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT,
    "storagePath" TEXT,
    "publicUrl" TEXT,
    "sizeBytes" INTEGER,
    "message" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "trip_media_attachments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "integration_sync_runs_organizationId_startedAt_idx" ON "integration_sync_runs"("organizationId", "startedAt");
CREATE INDEX "integration_sync_runs_integrationAccountId_startedAt_idx" ON "integration_sync_runs"("integrationAccountId", "startedAt");
CREATE INDEX "integration_sync_runs_status_startedAt_idx" ON "integration_sync_runs"("status", "startedAt");
CREATE INDEX "trip_media_attachments_organizationId_createdAt_idx" ON "trip_media_attachments"("organizationId", "createdAt");
CREATE INDEX "trip_media_attachments_tripId_createdAt_idx" ON "trip_media_attachments"("tripId", "createdAt");
CREATE INDEX "trip_media_attachments_tripEventId_idx" ON "trip_media_attachments"("tripEventId");
CREATE INDEX "trip_media_attachments_uploadedById_idx" ON "trip_media_attachments"("uploadedById");

ALTER TABLE "integration_sync_runs" ADD CONSTRAINT "integration_sync_runs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "integration_sync_runs" ADD CONSTRAINT "integration_sync_runs_integrationAccountId_fkey" FOREIGN KEY ("integrationAccountId") REFERENCES "integration_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "trip_media_attachments" ADD CONSTRAINT "trip_media_attachments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "trip_media_attachments" ADD CONSTRAINT "trip_media_attachments_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "trip_media_attachments" ADD CONSTRAINT "trip_media_attachments_tripEventId_fkey" FOREIGN KEY ("tripEventId") REFERENCES "trip_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "trip_media_attachments" ADD CONSTRAINT "trip_media_attachments_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "integration_sync_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "trip_media_attachments" ENABLE ROW LEVEL SECURITY;
