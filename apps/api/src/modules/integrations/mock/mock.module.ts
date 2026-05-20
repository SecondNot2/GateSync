import { Module } from '@nestjs/common';

import { MockMapper } from './mock.mapper';

/**
 * Mock integration module.
 *
 * Exposes {@link MockMapper} so the integrations layer can wire it as a
 * `ProviderAdapter` for the `MOCK` provider. Used by development and demo
 * environments per the integration steering rule "07-integrations.md".
 */
@Module({
  providers: [MockMapper],
  exports: [MockMapper]
})
export class MockModule {}
