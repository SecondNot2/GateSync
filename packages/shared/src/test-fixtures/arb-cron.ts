/**
 * fast-check arbitrary for cron expressions.
 *
 * `arbValidCron` emits 5-field cron strings (`min hour dayOfMonth month dayOfWeek`)
 * compatible with `cron-parser` and the SyncScheduler (Requirement 1.5, 1.6).
 *
 * `arbInvalidCron` emits malformed strings the scheduler must reject by
 * logging a `VALIDATION_ERROR` log entry without throwing.
 *
 * `arbCron` mixes valid and invalid expressions. Tests that need a single
 * polarity should pick the corresponding sub-arbitrary directly.
 */
import * as fc from 'fast-check';

const minute = (): fc.Arbitrary<string> =>
  fc.oneof(
    fc.constant('*'),
    fc.integer({ min: 0, max: 59 }).map((n) => String(n)),
    fc.integer({ min: 1, max: 30 }).map((n) => `*/${n}`),
    fc
      .tuple(fc.integer({ min: 0, max: 30 }), fc.integer({ min: 31, max: 59 }))
      .map(([a, b]) => `${a}-${b}`)
  );

const hour = (): fc.Arbitrary<string> =>
  fc.oneof(
    fc.constant('*'),
    fc.integer({ min: 0, max: 23 }).map((n) => String(n)),
    fc.integer({ min: 1, max: 12 }).map((n) => `*/${n}`)
  );

const dayOfMonth = (): fc.Arbitrary<string> =>
  fc.oneof(
    fc.constant('*'),
    fc.integer({ min: 1, max: 28 }).map((n) => String(n))
  );

const month = (): fc.Arbitrary<string> =>
  fc.oneof(
    fc.constant('*'),
    fc.integer({ min: 1, max: 12 }).map((n) => String(n))
  );

const dayOfWeek = (): fc.Arbitrary<string> =>
  fc.oneof(
    fc.constant('*'),
    fc.integer({ min: 0, max: 6 }).map((n) => String(n))
  );

/** Always-valid 5-field cron expression. */
export const arbValidCron: fc.Arbitrary<string> = fc
  .tuple(minute(), hour(), dayOfMonth(), month(), dayOfWeek())
  .map((parts) => parts.join(' '));

/**
 * Always-invalid cron expressions. Includes wrong field counts, illegal
 * characters and out-of-range values so scheduler-level validators can be
 * exercised across many shapes.
 */
export const arbInvalidCron: fc.Arbitrary<string> = fc.oneof(
  fc.constant(''),
  fc.constant('not a cron'),
  fc.constant('* * *'),
  fc.constant('60 * * * *'),
  fc.constant('-1 * * * *'),
  fc.constant('* 24 * * *'),
  fc.constant('* * 32 * *'),
  fc.constant('* * * 13 *'),
  fc.constant('* * * * 7'),
  fc.constant('*/0 * * * *'),
  fc.string({ minLength: 1, maxLength: 8 }).map((s) => `${s} * *`)
);

/** Mixed valid + invalid cron arbitrary. */
export const arbCron: fc.Arbitrary<string> = fc.oneof(
  { weight: 4, arbitrary: arbValidCron },
  { weight: 1, arbitrary: arbInvalidCron }
);
