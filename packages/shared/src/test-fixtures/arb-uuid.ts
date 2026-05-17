/**
 * fast-check arbitrary that emits RFC-4122 v4 style UUID strings.
 *
 * Many of the domain fixtures need stable identifiers (organizationId,
 * userId, integrationAccountId, ...). `fast-check` ships `uuidV(4)` which is
 * sufficient; this module simply re-exports a single named arbitrary so
 * fixtures stay consistent and can be swapped if we later need ULIDs.
 */
import * as fc from 'fast-check';

export const arbUuid: fc.Arbitrary<string> = fc.uuid({ version: 4 });
