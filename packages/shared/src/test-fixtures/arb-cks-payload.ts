/**
 * fast-check arbitrary for Cua Khau So (CKS) provider payloads.
 *
 * Mirrors the CKS JSON shape documented in the integration rules
 * (`licencePlateVNTQ`, `licencePlateChange`, `numberOfMooc`,
 * `numberOfTrailer`, `driverCMND`, `loadDueToOwnWeight`, `unloadingPlace`,
 * BP/HQ confirm timestamps).
 *
 * Two orthogonal axes are covered:
 *   1. `arbValidCksPayload` — every required field is present, allowing the
 *      mapper to produce a `TripEventCommand`.
 *   2. `arbCksPayloadWithMissingFields` — randomly removes 1+ required
 *      fields so adapters can be exercised against the malformed-payload
 *      rejection contract (Property 4 / Requirement 2.5). Missing fields
 *      shrink to the minimal failing case.
 */
import * as fc from 'fast-check';

import { arbUuid } from './arb-uuid.js';

export interface CksPayloadFixture {
  declarationNumber: string;
  lineId: string;
  licencePlateVNTQ?: string;
  licencePlateChange?: string;
  numberOfMooc?: string;
  numberOfTrailer?: string;
  driverCMND?: string;
  driverName?: string;
  loadDueToOwnWeight?: number;
  unloadingPlace?: string;
  bpConfirmAt?: string;
  hqConfirmAt?: string;
  status?: string;
  occurredAt?: string;
  rawProviderId?: string;
}

/**
 * Every field required by the CKS adapter. Keep this list in sync with
 * `CuaKhauSoMapper` — when the mapper relaxes a field, drop it from the list
 * (and from the missing-field generator below) so property tests stay green.
 */
export const CKS_REQUIRED_FIELDS = [
  'declarationNumber',
  'lineId',
  'licencePlateVNTQ',
  'driverCMND',
  'occurredAt'
] as const satisfies readonly (keyof CksPayloadFixture)[];

const arbDeclarationNumber = fc
  .array(fc.integer({ min: 0, max: 9 }), { minLength: 12, maxLength: 12 })
  .map((digits) => digits.join(''));

const arbVnPlate = fc
  .tuple(
    fc.integer({ min: 11, max: 99 }),
    fc.constantFrom('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'K', 'L', 'M', 'N'),
    fc.option(fc.constantFrom('A', 'B', 'C', 'D', 'E'), { nil: '' as const }),
    fc.integer({ min: 1000, max: 99999 })
  )
  .map(([prov, l1, l2, suffix]) => `${prov}${l1}${l2 ?? ''}-${suffix}`);

const arbCmnd = fc
  .array(fc.integer({ min: 0, max: 9 }), { minLength: 9, maxLength: 12 })
  .map((digits) => digits.join(''));

const arbIso = fc
  .date({
    min: new Date('2024-01-01T00:00:00Z'),
    max: new Date('2026-12-31T23:59:59Z'),
    noInvalidDate: true
  })
  .map((d) => d.toISOString());

const NAME_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzĐđÁÀẢÃẠÂẤẦẨẪẬĂẮẰẲẴẶÉÈẺẼẸÊẾỀỂỄỆÍÌỈĨỊÓÒỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÚÙỦŨỤƯỨỪỬỮỰÝỲỶỸỴ ';
const PLACE_ALPHABET = `${NAME_ALPHABET}0123456789,.-`;

const stringFromAlphabet = (alphabet: string, min: number, max: number): fc.Arbitrary<string> =>
  fc
    .array(
      fc.integer({ min: 0, max: alphabet.length - 1 }).map((i) => alphabet.charAt(i)),
      { minLength: min, maxLength: max }
    )
    .map((chars) => chars.join('').trim())
    .filter((s) => s.length >= 3);

const arbDriverName = stringFromAlphabet(NAME_ALPHABET, 3, 32);
const arbUnloadingPlace = stringFromAlphabet(PLACE_ALPHABET, 3, 64);

const arbStatus = fc.constantFrom(
  'WAITING',
  'IN_YARD',
  'AT_BORDER_GATE',
  'CUSTOMS_PROCESSING',
  'INSPECTION_REQUIRED',
  'COMPLETED'
);

/** Always-complete CKS payload (every required field present). */
export const arbValidCksPayload: fc.Arbitrary<CksPayloadFixture> = fc.record({
  declarationNumber: arbDeclarationNumber,
  lineId: arbUuid,
  licencePlateVNTQ: arbVnPlate,
  licencePlateChange: arbVnPlate,
  numberOfMooc: fc.integer({ min: 0, max: 99 }).map((n) => String(n)),
  numberOfTrailer: fc.integer({ min: 0, max: 99 }).map((n) => String(n)),
  driverCMND: arbCmnd,
  driverName: arbDriverName,
  loadDueToOwnWeight: fc.float({ min: 0, max: 50000, noNaN: true, noDefaultInfinity: true }),
  unloadingPlace: arbUnloadingPlace,
  bpConfirmAt: arbIso,
  hqConfirmAt: arbIso,
  status: arbStatus,
  occurredAt: arbIso,
  rawProviderId: arbUuid
});

/**
 * CKS payloads with a non-empty subset of REQUIRED fields removed. Each
 * generated payload guarantees ≥ 1 required field is missing so the mapper
 * must reject with `RejectionReason` per Property 4.
 */
export const arbCksPayloadWithMissingFields: fc.Arbitrary<CksPayloadFixture> =
  arbValidCksPayload.chain((complete) =>
    fc
      .subarray([...CKS_REQUIRED_FIELDS], { minLength: 1, maxLength: CKS_REQUIRED_FIELDS.length })
      .map((toDrop) => {
        const next: CksPayloadFixture = { ...complete };
        for (const field of toDrop) {
          delete (next as unknown as Record<string, unknown>)[field];
        }
        return next;
      })
  );

/**
 * Mixed arbitrary used by adapter property tests. Skewed towards valid
 * payloads (4:1) so the happy path gets enough coverage while still
 * exercising rejection paths.
 */
export const arbCksPayload: fc.Arbitrary<CksPayloadFixture> = fc.oneof(
  { weight: 4, arbitrary: arbValidCksPayload },
  { weight: 1, arbitrary: arbCksPayloadWithMissingFields }
);
