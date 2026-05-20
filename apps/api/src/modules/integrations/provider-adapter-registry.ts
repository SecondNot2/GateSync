/**
 * Provider adapter registry.
 *
 * The {@link SyncWorker} resolves a {@link ProviderAdapter} per inbound job
 * via this registry rather than a switch-statement, so consumer modules can
 * plug in concrete adapters (`CuaKhauSoMapper`, `YardMapper`, `GpsMapper`,
 * `MockMapper`) without circular module dependencies.
 *
 * Wiring is handled by task 17.1 — this file only declares the contract and
 * the DI token consumed by the worker.
 *
 * Validates: Requirements 2.1, 2.5
 */

import type { IntegrationProvider } from '@prisma/client';
import type { ProviderAdapter } from './adapters/provider-adapter';

/**
 * Injection token for the (provider → adapter) map. Modules that own a
 * concrete adapter `provide` it under this token in `forFeature`-style
 * factories. The map is intentionally typed `ProviderAdapter<unknown>`
 * because each adapter's payload type is private to its module; the worker
 * only needs the {@link ProviderAdapter.fetch} / {@link ProviderAdapter.map}
 * contract.
 */
export const PROVIDER_ADAPTERS = Symbol.for(
  'gatesync.integrations.providerAdapters'
) as unknown as symbol;

/**
 * Small registry interface used by the worker. Keeping this separate from the
 * raw `Map` allows tests and future implementations (e.g. a discovery-based
 * registry) to satisfy the contract without exposing internal storage.
 */
export interface ProviderAdapterRegistry {
  /** Register an adapter under its `provider` key. Throws when overwriting. */
  register(provider: IntegrationProvider, adapter: ProviderAdapter<unknown>): void;
  /** Look up an adapter, or `undefined` when no adapter is registered. */
  get(provider: IntegrationProvider): ProviderAdapter<unknown> | undefined;
  /** Enumerate registered providers, e.g. for worker startup. */
  providers(): IntegrationProvider[];
}

/**
 * In-memory registry implementation backed by a `Map`. Safe to instantiate as
 * a singleton; concrete adapters are pushed in during module initialisation.
 */
export class InMemoryProviderAdapterRegistry implements ProviderAdapterRegistry {
  private readonly adapters = new Map<IntegrationProvider, ProviderAdapter<unknown>>();

  constructor(initial?: Iterable<readonly [IntegrationProvider, ProviderAdapter<unknown>]>) {
    if (initial) {
      for (const [provider, adapter] of initial) {
        this.register(provider, adapter);
      }
    }
  }

  register(provider: IntegrationProvider, adapter: ProviderAdapter<unknown>): void {
    if (this.adapters.has(provider)) {
      throw new Error(`Adapter for provider "${provider}" is already registered`);
    }
    this.adapters.set(provider, adapter);
  }

  get(provider: IntegrationProvider): ProviderAdapter<unknown> | undefined {
    return this.adapters.get(provider);
  }

  providers(): IntegrationProvider[] {
    return Array.from(this.adapters.keys());
  }
}
