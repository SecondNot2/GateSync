/**
 * fast-check arbitrary for yard provider payloads.
 *
 * `sourceReference = gateLogId` per design §"Idempotency key format" and
 * task 4.3.
 */
import * as fc from 'fast-check';

import { arbUuid } from './arb-uuid.js';

export interface YardPayloadFixture {
  gateLogId: string;
  yardId?: string;
  plateNumber?: string;
  direction?: 'ENTRY' | 'EXIT';
  driverName?: string;
  occurredAt?: string;
  rawNote?: string;
}

export const YARD_REQUIRED_FIELDS = [
  'gateLogId',
  'yardId',
  'plateNumber',
  'direction',
  'occurredAt'
] as const satisfies readonly (keyof YardPayloadFixture)[];

const arbVnPlate = fc
  .tuple(
    fc.integer({ min: 11, max: 99 }),
    fc.constantFrom('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'),
    fc.integer({ min: 1000, max: 99999 })
  )
  .map(([prov, letter, suffix]) => `${prov}${letter}-${suffix}`);

const arbIso = fc
  .date({
    min: new Date('2024-01-01T00:00:00Z'),
    max: new Date('2026-12-31T23:59:59Z'),
    noInvalidDate: true
  })
  .map((d) => d.toISOString());

const arbDirection: fc.Arbitrary<'ENTRY' | 'EXIT'> = fc.constantFrom('ENTRY', 'EXIT');

const NAME_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzĐđÁÀẢÃẠÂẤẦẨẪẬĂẮẰẲẴẶÉÈẺẼẸÊẾỀỂỄỆÍÌỈĨỊÓÒỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÚÙỦŨỤƯỨỪỬỮỰÝỲỶỸỴ ';

const arbDriverName: fc.Arbitrary<string> = fc
  .array(
    fc.integer({ min: 0, max: NAME_ALPHABET.length - 1 }).map((i) => NAME_ALPHABET.charAt(i)),
    { minLength: 3, maxLength: 32 }
  )
  .map((chars) => chars.join('').trim())
  .filter((s) => s.length >= 3);

export const arbValidYardPayload: fc.Arbitrary<YardPayloadFixture> = fc.record({
  gateLogId: arbUuid,
  yardId: arbUuid,
  plateNumber: arbVnPlate,
  direction: arbDirection,
  driverName: arbDriverName,
  occurredAt: arbIso,
  rawNote: fc.string({ maxLength: 64 })
});

export const arbYardPayloadWithMissingFields: fc.Arbitrary<YardPayloadFixture> =
  arbValidYardPayload.chain((complete) =>
    fc
      .subarray([...YARD_REQUIRED_FIELDS], {
        minLength: 1,
        maxLength: YARD_REQUIRED_FIELDS.length
      })
      .map((toDrop) => {
        const next: YardPayloadFixture = { ...complete };
        for (const field of toDrop) {
          delete (next as unknown as Record<string, unknown>)[field];
        }
        return next;
      })
  );

export const arbYardPayload: fc.Arbitrary<YardPayloadFixture> = fc.oneof(
  { weight: 4, arbitrary: arbValidYardPayload },
  { weight: 1, arbitrary: arbYardPayloadWithMissingFields }
);
