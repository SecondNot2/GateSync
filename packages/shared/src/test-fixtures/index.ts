/**
 * Test-fixtures barrel for `@gatesync/shared/test-fixtures`.
 *
 * IMPORTANT: this barrel must NOT be re-exported from
 * `packages/shared/src/index.ts`. It exists at a separate package export
 * path (`./test-fixtures`) so test code can import generators without
 * dragging `fast-check` into the runtime bundle of `apps/api` or `apps/web`.
 *
 * Consumers:
 *
 * ```ts
 * import { arbCksPayload, arbDomainEvent } from '@gatesync/shared/test-fixtures';
 * ```
 *
 * All arbitraries here are designed to be reused across property tests
 * (Properties 1–27, design.md §"Testing Strategy"). When adding a new
 * generator, prefer composing existing ones to keep the surface area small.
 */
export * from './arb-cron.js';
export * from './arb-timezone.js';
export * from './arb-uuid.js';
export * from './arb-sensitive-string.js';
export * from './arb-integration-account.js';
export * from './arb-cks-payload.js';
export * from './arb-yard-payload.js';
export * from './arb-gps-payload.js';
export * from './arb-trip-event-command.js';
export * from './arb-domain-event.js';
export * from './arb-user-org-graph.js';
