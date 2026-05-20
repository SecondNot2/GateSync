-- Postgres requires new enum values to be COMMITTED in their own transaction
-- before they can be referenced (e.g. as a column DEFAULT) in subsequent
-- statements. This migration adds the values introduced by tasks 1.2 (sync
-- run status) and 1.6 (notification status) so that the next migration
-- (`20260517153941_realtime_sync_notifications_models`) can rely on them.

-- ============================================================================
-- AlterEnum: IntegrationSyncRunStatus (task 1.2)
-- ============================================================================
ALTER TYPE "IntegrationSyncRunStatus" ADD VALUE IF NOT EXISTS 'QUEUED';
ALTER TYPE "IntegrationSyncRunStatus" ADD VALUE IF NOT EXISTS 'RETRYING';
ALTER TYPE "IntegrationSyncRunStatus" ADD VALUE IF NOT EXISTS 'TIMEOUT';

-- ============================================================================
-- AlterEnum: NotificationStatus (task 1.6)
-- ============================================================================
ALTER TYPE "NotificationStatus" ADD VALUE IF NOT EXISTS 'PENDING_IN_APP';
ALTER TYPE "NotificationStatus" ADD VALUE IF NOT EXISTS 'HIDDEN';
