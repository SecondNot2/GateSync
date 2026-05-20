-- AlterTable
ALTER TABLE "integration_accounts"
    ADD COLUMN "cron" TEXT,
    ADD COLUMN "timezone" TEXT DEFAULT 'Asia/Ho_Chi_Minh',
    ADD COLUMN "manualOnly" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "debugMode" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "maxRequestsPerSecond" INTEGER,
    ADD COLUMN "maxRunDurationSeconds" INTEGER,
    ADD COLUMN "lastFiredAt" TIMESTAMP(3);

-- RenameIndex (normalize previously-truncated index name to match Prisma's expected name)
ALTER INDEX "customs_declarations_organizationId_sourceProvider_sourceExtern" RENAME TO "customs_declarations_organizationId_sourceProvider_sourceEx_idx";
