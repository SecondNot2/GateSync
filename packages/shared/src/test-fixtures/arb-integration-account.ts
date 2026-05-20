/**
 * fast-check arbitrary for `IntegrationAccount`-shaped fixtures.
 *
 * Mirrors the Prisma `IntegrationAccount` shape after task 1.1 extends it
 * with scheduler fields (`cron`, `timezone`, `manualOnly`, `debugMode`,
 * `maxRequestsPerSecond`, `maxRunDurationSeconds`, `syncLockOwner`,
 * `lastFiredAt`). The fixture is intentionally a plain TS interface — the
 * shared package must stay decoupled from the generated Prisma client to
 * avoid pulling `@prisma/client` into every consumer of test fixtures.
 */
import * as fc from 'fast-check';

import { integrationProviders, type IntegrationProvider, membershipStatuses } from '../domain.js';
import { arbValidCron, arbInvalidCron } from './arb-cron.js';
import { arbValidTimezone, arbInvalidTimezone } from './arb-timezone.js';
import { arbUuid } from './arb-uuid.js';

/** Status set used by IntegrationAccount-like records (subset of membership). */
export const integrationAccountStatuses = ['ACTIVE', 'INVITED', 'SUSPENDED', 'REMOVED'] as const;
export type IntegrationAccountStatus = (typeof integrationAccountStatuses)[number];

/**
 * Domain-level shape that backend tests can use without depending on Prisma.
 * Field names match the Prisma model exactly (post task 1.1 migration).
 */
export interface IntegrationAccountFixture {
  id: string;
  organizationId: string;
  provider: IntegrationProvider;
  status: IntegrationAccountStatus;
  enabled: boolean;
  manualOnly: boolean;
  debugMode: boolean;
  cron: string | null;
  timezone: string | null;
  maxRequestsPerSecond: number | null;
  maxRunDurationSeconds: number | null;
  syncLockOwner: string | null;
  lastFiredAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const arbStatus: fc.Arbitrary<IntegrationAccountStatus> = fc.constantFrom(
  ...integrationAccountStatuses
);

const arbProvider: fc.Arbitrary<IntegrationProvider> = fc.constantFrom(...integrationProviders);

const arbDate = (): fc.Arbitrary<Date> =>
  fc.date({
    min: new Date('2024-01-01T00:00:00Z'),
    max: new Date('2026-12-31T23:59:59Z'),
    noInvalidDate: true
  });

const arbNullableDate = (): fc.Arbitrary<Date | null> =>
  fc.option(arbDate(), { nil: null, freq: 3 });

/**
 * Always-valid IntegrationAccount fixture (cron/timezone valid, status sane).
 * Use this for happy-path scheduler tests.
 */
export const arbValidIntegrationAccount: fc.Arbitrary<IntegrationAccountFixture> = fc
  .record({
    id: arbUuid,
    organizationId: arbUuid,
    provider: arbProvider,
    status: fc.constant<IntegrationAccountStatus>('ACTIVE'),
    enabled: fc.boolean(),
    manualOnly: fc.boolean(),
    debugMode: fc.boolean(),
    cron: fc.option(arbValidCron, { nil: null, freq: 5 }),
    timezone: fc.option(arbValidTimezone, { nil: null, freq: 5 }),
    maxRequestsPerSecond: fc.option(fc.integer({ min: 1, max: 50 }), { nil: null, freq: 4 }),
    maxRunDurationSeconds: fc.option(fc.integer({ min: 30, max: 600 }), { nil: null, freq: 4 }),
    syncLockOwner: fc.option(arbUuid, { nil: null, freq: 4 }),
    lastFiredAt: arbNullableDate(),
    deletedAt: fc.constant<Date | null>(null),
    createdAt: arbDate(),
    updatedAt: arbDate()
  })
  .map((account) => {
    // Ensure updatedAt >= createdAt to keep fixtures internally consistent.
    if (account.updatedAt < account.createdAt) {
      return { ...account, updatedAt: account.createdAt };
    }
    return account;
  });

/**
 * Invalid IntegrationAccount fixture — covers scheduler edge cases:
 * malformed cron, malformed timezone, soft-deleted, suspended membership
 * status, manualOnly=true, status=REMOVED.
 *
 * Each scenario is sampled uniformly; combine with `oneof` upstream when
 * mixing with the valid arbitrary.
 */
export const arbInvalidIntegrationAccount: fc.Arbitrary<IntegrationAccountFixture> = fc
  .record({
    id: arbUuid,
    organizationId: arbUuid,
    provider: arbProvider,
    status: arbStatus,
    enabled: fc.boolean(),
    manualOnly: fc.boolean(),
    debugMode: fc.boolean(),
    cron: fc.oneof(arbInvalidCron, fc.constant<string | null>(null)),
    timezone: fc.oneof(arbInvalidTimezone, fc.constant<string | null>(null)),
    maxRequestsPerSecond: fc.option(fc.integer({ min: -10, max: 200 }), { nil: null }),
    maxRunDurationSeconds: fc.option(fc.integer({ min: -10, max: 6000 }), { nil: null }),
    syncLockOwner: fc.option(arbUuid, { nil: null }),
    lastFiredAt: arbNullableDate(),
    deletedAt: fc.option(arbDate(), { nil: null, freq: 2 }),
    createdAt: arbDate(),
    updatedAt: arbDate()
  })
  .map((account) => {
    if (account.updatedAt < account.createdAt) {
      return { ...account, updatedAt: account.createdAt };
    }
    return account;
  });

export const arbIntegrationAccount: fc.Arbitrary<IntegrationAccountFixture> = fc.oneof(
  { weight: 4, arbitrary: arbValidIntegrationAccount },
  { weight: 1, arbitrary: arbInvalidIntegrationAccount }
);

/** Re-export for visibility in property test setup. */
export const integrationAccountAllStatuses = membershipStatuses;
