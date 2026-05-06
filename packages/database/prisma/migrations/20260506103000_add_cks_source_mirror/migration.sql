ALTER TABLE "customs_declarations"
  ADD COLUMN "sourceProvider" "IntegrationProvider",
  ADD COLUMN "sourceExternalId" TEXT,
  ADD COLUMN "sourceStatus" TEXT,
  ADD COLUMN "sourceUpdatedAt" TIMESTAMP(3),
  ADD COLUMN "sourceObservedAt" TIMESTAMP(3),
  ADD COLUMN "lastIngestedAt" TIMESTAMP(3),
  ADD COLUMN "latestSyncRunId" UUID,
  ADD COLUMN "normalizedSummary" JSONB,
  ADD COLUMN "sourceSnapshot" JSONB;

ALTER TABLE "integration_accounts"
  ADD COLUMN "lastListScannedAt" TIMESTAMP(3),
  ADD COLUMN "lastDetailRefreshedAt" TIMESTAMP(3),
  ADD COLUMN "lastSuccessfulSyncAt" TIMESTAMP(3),
  ADD COLUMN "lastErrorAt" TIMESTAMP(3),
  ADD COLUMN "nextRetryAt" TIMESTAMP(3),
  ADD COLUMN "syncLagSeconds" INTEGER,
  ADD COLUMN "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastErrorMessage" TEXT,
  ADD COLUMN "syncLockOwner" TEXT,
  ADD COLUMN "syncLockExpiresAt" TIMESTAMP(3);

CREATE INDEX "customs_declarations_organizationId_sourceProvider_sourceExternalId_idx" ON "customs_declarations"("organizationId", "sourceProvider", "sourceExternalId");
CREATE INDEX "customs_declarations_organizationId_sourceObservedAt_idx" ON "customs_declarations"("organizationId", "sourceObservedAt");
CREATE INDEX "customs_declarations_organizationId_lastIngestedAt_idx" ON "customs_declarations"("organizationId", "lastIngestedAt");
CREATE INDEX "integration_accounts_nextRetryAt_idx" ON "integration_accounts"("nextRetryAt");
CREATE INDEX "integration_accounts_syncLockExpiresAt_idx" ON "integration_accounts"("syncLockExpiresAt");
