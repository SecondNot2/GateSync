/**
 * fast-check arbitrary for IANA timezones.
 *
 * Default timezone for IntegrationAccount is `Asia/Ho_Chi_Minh` (design.md
 * + tasks 1.1). The valid set below is a curated cross-section used by
 * scheduler property tests; it is intentionally small to keep generation fast
 * while still exercising offset variety (positive, negative, half-hour and
 * 45-minute offsets, DST and non-DST zones).
 */
import * as fc from 'fast-check';

export const VALID_IANA_TIMEZONES: readonly string[] = [
  'Asia/Ho_Chi_Minh',
  'Asia/Bangkok',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Asia/Kolkata',
  'Asia/Kathmandu',
  'Asia/Dubai',
  'Australia/Sydney',
  'Pacific/Auckland',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Africa/Cairo',
  'America/New_York',
  'America/Los_Angeles',
  'America/Chicago',
  'America/Sao_Paulo',
  'UTC'
] as const;

/** Always-valid IANA timezone. */
export const arbValidTimezone: fc.Arbitrary<string> = fc.constantFrom(...VALID_IANA_TIMEZONES);

/** Strings that look like timezones but are invalid for `cron-parser` / Intl. */
export const arbInvalidTimezone: fc.Arbitrary<string> = fc.oneof(
  fc.constant(''),
  fc.constant('Mars/Olympus_Mons'),
  fc.constant('Asia/Atlantis'),
  fc.constant('GMT+25'),
  fc.constant('UTC+99'),
  fc.constant('Europe/'),
  fc.constant('   '),
  fc.string({ minLength: 1, maxLength: 12 })
);

/** Mixed valid + invalid timezone arbitrary. */
export const arbTimezone: fc.Arbitrary<string> = fc.oneof(
  { weight: 5, arbitrary: arbValidTimezone },
  { weight: 1, arbitrary: arbInvalidTimezone }
);
