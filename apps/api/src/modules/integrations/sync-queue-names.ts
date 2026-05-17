/**
 * Stable mapping between {@link IntegrationProvider} and the BullMQ queue
 * names consumed by the AUTO SYNC pipeline.
 *
 * The design specifies short, lower-case provider keys in queue names
 * (`sync-run:cks`, `sync-run:yard`, `sync-run:gps`, `sync-run:mock`) rather
 * than the verbose Prisma enum values, so adapters / scheduler / worker all
 * agree on a single source of truth declared here.
 *
 * Validates: Requirements 13.1, 13.3
 * Cross-ref: design.md sections "Sync Worker", "Wire BullMQ queues" (task 17.2).
 */

import type { IntegrationProvider } from '@prisma/client';

/** Prefix shared by every per-provider sync queue. */
export const SYNC_QUEUE_PREFIX = 'sync-run' as const;

/**
 * Short, queue-friendly key per provider. Lower-case and hyphen-free so it can
 * be embedded directly into queue/topic names without further escaping.
 */
export const SYNC_PROVIDER_QUEUE_KEY: Readonly<Record<IntegrationProvider, string>> = {
  CUA_KHAU_SO: 'cks',
  XUAN_CUONG: 'yard',
  GPS_PROVIDER: 'gps',
  MOCK: 'mock',
  // Channels below do not run AUTO SYNC themselves, but we still expose
  // deterministic keys so callers cannot construct undefined queue names.
  ZALO_OA: 'zalo',
  EMAIL: 'email',
  SMS: 'sms'
};

/**
 * Providers that ship an AUTO SYNC worker. Keep this list aligned with the
 * provider adapters wired into {@link ProviderAdapterRegistry} (task 17.1).
 */
export const SYNC_WORKER_PROVIDERS: readonly IntegrationProvider[] = [
  'CUA_KHAU_SO',
  'XUAN_CUONG',
  'GPS_PROVIDER',
  'MOCK'
];

/** Build the BullMQ queue name for a given provider. */
export function syncQueueNameForProvider(provider: IntegrationProvider): string {
  const key = SYNC_PROVIDER_QUEUE_KEY[provider];
  return `${SYNC_QUEUE_PREFIX}:${key}`;
}

/** Build the deterministic `jobId` for a single sync run. */
export function syncJobIdForRun(syncRunId: string): string {
  return `${SYNC_QUEUE_PREFIX}:${syncRunId}`;
}

/** Payload shape pushed onto every sync queue by the scheduler (task 3.2). */
export interface SyncRunJobData {
  /** `IntegrationSyncRun.id` to execute. */
  syncRunId: string;
  /** Tenant scope, copied from the run for fast routing without a DB lookup. */
  organizationId: string;
  /** `IntegrationAccount.id` driving the run. */
  integrationAccountId: string;
  /** 0-indexed retry attempt this job represents. Matches `IntegrationSyncRun.attemptIndex`. */
  attemptIndex: number;
  /** Stable group identifier shared across all retries of the same logical run (Requirement 3.6). */
  attemptGroupId: string;
}
