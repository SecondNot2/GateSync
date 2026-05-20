-- Realtime Sync & Notifications: schema changes for tasks 1.2 - 1.8
-- Tasks 1.2 (IntegrationSyncRun + status enum), 1.3 (IntegrationSyncLog),
-- 1.4 (TripEvent.isCorrection + composite idempotency unique),
-- 1.5 (NotificationRule reshaping), 1.6 (Notification delivery fields + de-dup unique),
-- 1.7 (NotificationPreference), 1.8 (AuditLog entityType — no DDL; entityType is free-text TEXT).
--
-- NOTE: enum-value additions for `IntegrationSyncRunStatus` and `NotificationStatus`
-- live in the prior migration `20260517153940_extend_status_enums` so Postgres
-- can commit them in their own transaction before this migration uses them as
-- column defaults (Postgres error code 55P04 — "unsafe use of new value").

-- ============================================================================
-- DropIndex
-- ============================================================================
DROP INDEX IF EXISTS "notification_rules_organizationId_isActive_idx";
DROP INDEX IF EXISTS "trip_events_idempotencyKey_key";

-- ============================================================================
-- Task 1.2: integration_sync_runs
-- ============================================================================
-- Add new columns. attemptGroupId is NOT NULL with a backfill from existing
-- run id so legacy rows remain a valid singleton attempt group.
ALTER TABLE "integration_sync_runs"
  ADD COLUMN "attemptIndex"     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "attemptGroupId"   UUID,
  ADD COLUMN "recordsRejected"  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "errorCode"        TEXT,
  ADD COLUMN "httpStatus"       INTEGER,
  ADD COLUMN "nextRetryAt"      TIMESTAMP(3);

UPDATE "integration_sync_runs" SET "attemptGroupId" = "id" WHERE "attemptGroupId" IS NULL;

ALTER TABLE "integration_sync_runs" ALTER COLUMN "attemptGroupId" SET NOT NULL;
ALTER TABLE "integration_sync_runs" ALTER COLUMN "status" SET DEFAULT 'QUEUED';

-- ============================================================================
-- Task 1.3: integration_sync_logs (new table)
-- ============================================================================
CREATE TABLE "integration_sync_logs" (
    "id"               UUID         NOT NULL,
    "organizationId"   UUID         NOT NULL,
    "syncRunId"        UUID         NOT NULL,
    "level"            TEXT         NOT NULL,
    "code"             TEXT,
    "message"          TEXT         NOT NULL,
    "sourceReference"  TEXT,
    "rawPayloadMasked" JSONB,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_sync_logs_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "integration_sync_logs"
    ADD CONSTRAINT "integration_sync_logs_syncRunId_fkey"
    FOREIGN KEY ("syncRunId") REFERENCES "integration_sync_runs"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- Task 1.4: trip_events.isCorrection + composite (organizationId, idempotencyKey) unique
-- ============================================================================
ALTER TABLE "trip_events" ADD COLUMN "isCorrection" BOOLEAN NOT NULL DEFAULT false;

-- ============================================================================
-- Task 1.5: notification_rules reshape
-- This feature has not shipped; existing rows would not satisfy the new NOT NULL
-- columns (recipientScope, updatedAt) or the eventType String contract.
-- We truncate the table to allow a clean reshape. Acceptable because the
-- module is pre-launch.
-- ============================================================================
TRUNCATE TABLE "notification_rules";

ALTER TABLE "notification_rules"
    DROP COLUMN "isActive",
    DROP COLUMN "eventType",
    ADD COLUMN  "eventType"      TEXT     NOT NULL,
    ADD COLUMN  "recipientScope" TEXT     NOT NULL,
    ADD COLUMN  "customUserIds"  TEXT[]   DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN  "mandatory"      BOOLEAN  NOT NULL DEFAULT false,
    ADD COLUMN  "enabled"        BOOLEAN  NOT NULL DEFAULT true,
    ADD COLUMN  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN  "updatedAt"      TIMESTAMP(3) NOT NULL,
    ADD COLUMN  "deletedAt"      TIMESTAMP(3);

-- ============================================================================
-- Task 1.6: notifications delivery fields
-- ============================================================================
ALTER TABLE "notifications"
    ADD COLUMN "notificationRuleId" UUID,
    ADD COLUMN "eventId"            UUID,
    ADD COLUMN "payloadDigest"      TEXT,
    ADD COLUMN "failureReason"      TEXT;

-- ============================================================================
-- Task 1.7: notification_preferences (new table)
-- ============================================================================
CREATE TABLE "notification_preferences" (
    "id"             UUID                 NOT NULL,
    "userId"         UUID                 NOT NULL,
    "organizationId" UUID                 NOT NULL,
    "eventType"      TEXT                 NOT NULL,
    "channel"        "NotificationChannel" NOT NULL,
    "enabled"        BOOLEAN              NOT NULL DEFAULT true,
    "updatedAt"      TIMESTAMP(3)         NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "notification_preferences"
    ADD CONSTRAINT "notification_preferences_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- Indexes & unique constraints
-- ============================================================================
CREATE INDEX "integration_sync_runs_integrationAccountId_status_idx"
    ON "integration_sync_runs"("integrationAccountId", "status");

CREATE INDEX "integration_sync_runs_nextRetryAt_idx"
    ON "integration_sync_runs"("nextRetryAt");

CREATE INDEX "integration_sync_logs_organizationId_syncRunId_createdAt_idx"
    ON "integration_sync_logs"("organizationId", "syncRunId", "createdAt");

CREATE INDEX "integration_sync_logs_organizationId_code_createdAt_idx"
    ON "integration_sync_logs"("organizationId", "code", "createdAt");

CREATE UNIQUE INDEX "trip_events_organizationId_idempotencyKey_key"
    ON "trip_events"("organizationId", "idempotencyKey");

CREATE INDEX "notification_rules_organizationId_eventType_enabled_idx"
    ON "notification_rules"("organizationId", "eventType", "enabled");

CREATE UNIQUE INDEX "notifications_eventId_recipientUserId_channel_key"
    ON "notifications"("eventId", "recipientUserId", "channel");

CREATE INDEX "notification_preferences_userId_idx"
    ON "notification_preferences"("userId");

CREATE UNIQUE INDEX "notification_preferences_userId_organizationId_eventType_ch_key"
    ON "notification_preferences"("userId", "organizationId", "eventType", "channel");

-- Task 1.8: AuditLog.entityType is a free-text TEXT column (no DB enum). The
-- application layer is responsible for emitting canonical values, including
-- the new entries: INTEGRATION_ACCOUNT, NOTIFICATION_RULE, INTEGRATION_DEBUG_MODE.
-- No DDL change required for this task.
