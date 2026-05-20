/**
 * External notification channel adapter contracts.
 *
 * The `Notification_Orchestrator` (and the downstream
 * `External_Channel_Dispatcher` BullMQ worker) resolve a concrete adapter per
 * channel via {@link ExternalChannelRegistry} rather than a switch statement,
 * so concrete adapters (`ZaloOaAdapter`, `SmsAdapter`, `EmailAdapter`,
 * mock/test adapters) can be plugged in without circular module dependencies.
 *
 * Adapters are stateless and pure given `(input)`; they MUST NOT log raw
 * sensitive fields — rendering and scrubbing happen upstream and the
 * `body`/`payload` arriving here are already masked.
 *
 * Validates: Requirements 9.1
 * Cross-ref: design.md section "External Channel Dispatcher".
 */

/** Supported external channels. Mirrors `Notification_Rule.externalChannels`. */
export type ExternalChannelKind = 'zalo' | 'sms' | 'email';

/**
 * Input handed to an adapter for a single delivery attempt. The dispatcher
 * builds this from a persisted `Notification_Delivery` row plus the rendered
 * Vietnamese-friendly template; adapters never reach back into the database.
 */
export interface ExternalDispatchInput {
  /** `Notification_Delivery.id` — used by adapters for correlation/logging. */
  deliveryId: string;
  /** Recipient `User.id`. Adapters MAY use this to tag provider metadata. */
  recipientUserId: string;
  /** Channel-specific contact value (phone for SMS/Zalo, address for email). */
  recipientContact: string;
  /** Source `Trip.id` when the notification originates from a trip event. */
  tripId?: string;
  /** Notification eventType (e.g. `vehicle_arrived_gate`). */
  eventType: string;
  /** Rendered, scrubbed title shown to the recipient. */
  title: string;
  /** Rendered, scrubbed body shown to the recipient. */
  body: string;
  /**
   * Optional channel-specific structured payload (e.g. Zalo template params).
   * Already passed through `SensitiveScrubber` upstream.
   */
  payload?: Record<string, unknown>;
}

/**
 * Discriminated result of a single dispatch attempt.
 *
 * - `SENT`: the provider accepted the message; `providerMessageId` SHOULD be
 *   stored on `Notification_Delivery` for cross-reference.
 * - `FAILED`: the provider rejected the message. `transient = true` means the
 *   dispatcher SHOULD retry (subject to the retry policy in Requirement 9.4);
 *   `transient = false` means the failure is permanent and the delivery row
 *   transitions to `FAILED` immediately. `failureReason` MUST be sanitized
 *   (no credentials, no sensitive PII) per Requirement 9.5 / 11.4.
 */
export type ExternalDispatchResult =
  | { status: 'SENT'; providerMessageId?: string }
  | { status: 'FAILED'; failureReason: string; transient: boolean };

/**
 * Adapter contract for a single external channel. Implementations MUST be
 * stateless and pure given `(input)`; cross-attempt state (e.g. retry count)
 * lives on the BullMQ job, not inside the adapter.
 */
export interface ExternalChannelAdapter {
  readonly kind: ExternalChannelKind;
  send(input: ExternalDispatchInput): Promise<ExternalDispatchResult>;
}

/**
 * Injection token for the (channel → adapter) map. Modules that own a
 * concrete adapter `provide` it under this token in `forFeature`-style
 * factories so the dispatcher can resolve them at runtime.
 */
export const EXTERNAL_CHANNEL_ADAPTERS = Symbol.for(
  'gatesync.notifications.externalChannelAdapters'
) as unknown as symbol;

/**
 * Small registry interface used by the dispatcher. Keeping this separate
 * from the raw `Map` allows tests and future implementations (e.g. a
 * discovery-based registry) to satisfy the contract without exposing
 * internal storage. Mirrors `ProviderAdapterRegistry` in the integrations
 * module.
 */
export interface ExternalChannelRegistry {
  /** Register an adapter under its `kind` key. Throws when overwriting. */
  register(kind: ExternalChannelKind, adapter: ExternalChannelAdapter): void;
  /** Look up an adapter, or `undefined` when no adapter is registered. */
  get(kind: ExternalChannelKind): ExternalChannelAdapter | undefined;
  /** Enumerate registered channels, e.g. for dispatcher startup. */
  kinds(): ExternalChannelKind[];
}

/**
 * In-memory registry implementation backed by a `Map`. Safe to instantiate
 * as a singleton; concrete adapters are pushed in during module
 * initialisation.
 */
export class InMemoryExternalChannelRegistry implements ExternalChannelRegistry {
  private readonly adapters = new Map<ExternalChannelKind, ExternalChannelAdapter>();

  constructor(initial?: Iterable<readonly [ExternalChannelKind, ExternalChannelAdapter]>) {
    if (initial) {
      for (const [kind, adapter] of initial) {
        this.register(kind, adapter);
      }
    }
  }

  register(kind: ExternalChannelKind, adapter: ExternalChannelAdapter): void {
    if (this.adapters.has(kind)) {
      throw new Error(`External channel adapter for "${kind}" is already registered`);
    }
    if (adapter.kind !== kind) {
      throw new Error(
        `External channel adapter kind mismatch: expected "${kind}", got "${adapter.kind}"`
      );
    }
    this.adapters.set(kind, adapter);
  }

  get(kind: ExternalChannelKind): ExternalChannelAdapter | undefined {
    return this.adapters.get(kind);
  }

  kinds(): ExternalChannelKind[] {
    return Array.from(this.adapters.keys());
  }
}
