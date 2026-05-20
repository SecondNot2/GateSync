/**
 * fast-check arbitrary for GPS provider payloads.
 *
 * `sourceReference = deviceId + ts` per design §"Idempotency key format"
 * and task 4.5.
 */
import * as fc from 'fast-check';

import { arbUuid } from './arb-uuid.js';

export interface GpsPayloadFixture {
  deviceId: string;
  ts: number;
  lat?: number;
  lng?: number;
  speedKph?: number;
  headingDeg?: number;
  zoneId?: string;
  ignitionOn?: boolean;
}

export const GPS_REQUIRED_FIELDS = [
  'deviceId',
  'ts',
  'lat',
  'lng'
] as const satisfies readonly (keyof GpsPayloadFixture)[];

/** Epoch seconds in [2024-01-01, 2026-12-31]. */
const arbEpochSeconds = fc.integer({ min: 1_704_067_200, max: 1_798_761_600 });

const arbLat = fc.float({ min: -90, max: 90, noNaN: true, noDefaultInfinity: true });
const arbLng = fc.float({ min: -180, max: 180, noNaN: true, noDefaultInfinity: true });
const arbSpeed = fc.float({ min: 0, max: 200, noNaN: true, noDefaultInfinity: true });
const arbHeading = fc.float({ min: 0, max: 360, noNaN: true, noDefaultInfinity: true });

export const arbValidGpsPayload: fc.Arbitrary<GpsPayloadFixture> = fc.record({
  deviceId: arbUuid,
  ts: arbEpochSeconds,
  lat: arbLat,
  lng: arbLng,
  speedKph: arbSpeed,
  headingDeg: arbHeading,
  zoneId: arbUuid,
  ignitionOn: fc.boolean()
});

export const arbGpsPayloadWithMissingFields: fc.Arbitrary<GpsPayloadFixture> =
  arbValidGpsPayload.chain((complete) =>
    fc
      .subarray([...GPS_REQUIRED_FIELDS], {
        minLength: 1,
        maxLength: GPS_REQUIRED_FIELDS.length
      })
      .map((toDrop) => {
        const next: GpsPayloadFixture = { ...complete };
        for (const field of toDrop) {
          delete (next as unknown as Record<string, unknown>)[field];
        }
        return next;
      })
  );

export const arbGpsPayload: fc.Arbitrary<GpsPayloadFixture> = fc.oneof(
  { weight: 4, arbitrary: arbValidGpsPayload },
  { weight: 1, arbitrary: arbGpsPayloadWithMissingFields }
);
