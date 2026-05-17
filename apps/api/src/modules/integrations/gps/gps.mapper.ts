import { Injectable } from '@nestjs/common';
import {
  IntegrationProvider,
  TripEventSource,
  TripEventType,
  type IntegrationAccount,
  type Prisma
} from '@prisma/client';
import { buildIdempotencyKey } from '../idempotency-key';

import type {
  AdapterContext,
  MapResult,
  ProviderAdapter,
  RejectionReason,
  SyncCursor
} from '../adapters/provider-adapter';

/**
 * Payload produced by GPS telemetry providers (e.g. fleet trackers).
 *
 * `ts` accepts either a numeric epoch timestamp (seconds when smaller than
 * `1e12`, milliseconds otherwise) or any ISO-8601 / RFC-3339 string parseable
 * by `new Date()`. The mapper stamps `occurredAt` from this value.
 *
 * Per design.md §"Idempotency key format":
 *   `sourceReference = deviceId + ts` for GPS providers.
 */
export interface GpsPayload {
  /** Stable hardware identifier for the GPS device. */
  deviceId: string;
  /** Timestamp at which the fix was produced by the device. */
  ts: string | number;
  /** WGS-84 latitude in decimal degrees, [-90, 90]. */
  lat: number;
  /** WGS-84 longitude in decimal degrees, [-180, 180]. */
  lng: number;
  /** Optional ground speed in km/h reported by the device. */
  speedKph?: number;
  /** Optional heading in decimal degrees, [0, 360). */
  heading?: number;
  /**
   * Trip the device is currently bound to. Required to emit a
   * `TripEventCommand`; missing → `MISSING_REQUIRED_FIELD` reject.
   */
  tripId?: string;
  /**
   * Optional configured zone the device transitioned into (e.g. border
   * approach polygon). When present, the mapper emits a
   * `ARRIVED_BORDER_AREA` event instead of a plain location share.
   */
  zone?: string;
}

const MAX_LAT = 90;
const MAX_LNG = 180;
/**
 * Numbers smaller than this threshold are interpreted as epoch seconds
 * (matches `arbGpsPayload`); larger numbers are treated as epoch milliseconds.
 * `1e12` ms is in the year 2001, so any realistic *seconds* value is below it
 * and any realistic *ms* value is above it.
 */
const EPOCH_SECONDS_THRESHOLD = 1e12;

/**
 * GPS provider adapter.
 *
 * Pure, stateless mapper that normalizes telemetry payloads into
 * `TripEventCommand`s consumed by `Trip_Event_Service`.
 *
 * Validates: Requirements 2.1, 2.2, 2.5
 */
@Injectable()
export class GpsMapper implements ProviderAdapter<GpsPayload> {
  readonly provider: IntegrationProvider = IntegrationProvider.GPS_PROVIDER;

  /**
   * Pull pending GPS fixes for `account`.
   *
   * TODO(realtime-sync-notifications #4.5): integrate with the real GPS
   * provider HTTP API (auth, paging, cursor persistence). For now this is a
   * deliberate stub that yields nothing so the worker can wire the adapter
   * end-to-end without depending on an external service.
   */
  // eslint-disable-next-line require-yield
  async *fetch(_account: IntegrationAccount, _cursor: SyncCursor): AsyncIterable<GpsPayload> {
    // Intentionally empty until the GPS provider integration lands.
    return;
  }

  map(payload: GpsPayload, ctx: AdapterContext): MapResult {
    const sourceReference = this.buildSourceReference(payload);

    const deviceId = this.requireNonEmptyString(payload?.deviceId);
    if (!deviceId) {
      return this.reject(sourceReference, {
        code: 'MISSING_REQUIRED_FIELD',
        field: 'deviceId',
        message: 'GPS payload is missing `deviceId`.'
      });
    }

    const occurredAt = this.parseTimestamp(payload?.ts);
    if (!occurredAt) {
      return this.reject(sourceReference, {
        code: 'INVALID_OCCURRED_AT',
        field: 'ts',
        message: 'GPS payload `ts` is missing or not a valid timestamp.'
      });
    }

    const lat = this.parseFiniteNumber(payload?.lat);
    if (lat === undefined) {
      return this.reject(sourceReference, {
        code: 'MISSING_REQUIRED_FIELD',
        field: 'lat',
        message: 'GPS payload is missing or has invalid `lat`.'
      });
    }
    if (Math.abs(lat) > MAX_LAT) {
      return this.reject(sourceReference, {
        code: 'INVALID_PAYLOAD',
        field: 'lat',
        message: `GPS \`lat\` ${lat} is outside [-90, 90].`
      });
    }

    const lng = this.parseFiniteNumber(payload?.lng);
    if (lng === undefined) {
      return this.reject(sourceReference, {
        code: 'MISSING_REQUIRED_FIELD',
        field: 'lng',
        message: 'GPS payload is missing or has invalid `lng`.'
      });
    }
    if (Math.abs(lng) > MAX_LNG) {
      return this.reject(sourceReference, {
        code: 'INVALID_PAYLOAD',
        field: 'lng',
        message: `GPS \`lng\` ${lng} is outside [-180, 180].`
      });
    }

    const tripId = this.requireNonEmptyString(payload?.tripId);
    if (!tripId) {
      // TripEventCommand requires a resolved tripId; per the adapter contract
      // we reject rather than fabricate one (Requirement 2.5).
      return this.reject(sourceReference, {
        code: 'MISSING_REQUIRED_FIELD',
        field: 'tripId',
        message: 'GPS payload cannot be mapped without `tripId`.'
      });
    }

    const zone = this.requireNonEmptyString(payload?.zone);
    const eventType = zone
      ? TripEventType.ARRIVED_BORDER_AREA
      : TripEventType.DRIVER_LOCATION_SHARED;

    const idempotencyKey = buildIdempotencyKey({
      provider: this.provider,
      sourceReference,
      occurredAt
    });

    const normalizedPayload = this.buildNormalizedPayload({
      deviceId,
      occurredAt,
      lat,
      lng,
      speedKph: this.parseFiniteNumber(payload.speedKph),
      heading: this.parseFiniteNumber(payload.heading),
      zone
    });

    return {
      kind: 'event',
      command: {
        // Property 3 / Requirement 2.1 — tenant scope is taken from ctx,
        // never from the untrusted payload.
        organizationId: ctx.organizationId,
        tripId,
        eventType,
        source: TripEventSource.GPS,
        sourceRef: sourceReference,
        idempotencyKey,
        occurredAt,
        payload: normalizedPayload,
        actor: { kind: 'integration', id: ctx.integrationAccountId }
      }
    };
  }

  private buildSourceReference(payload: GpsPayload | null | undefined): string {
    const deviceId =
      typeof payload?.deviceId === 'string' && payload.deviceId.trim().length > 0
        ? payload.deviceId.trim()
        : 'unknown';
    const ts =
      payload?.ts !== undefined && payload?.ts !== null && `${payload.ts}`.length > 0
        ? `${payload.ts}`
        : 'unknown';
    return `${deviceId}|${ts}`;
  }

  private parseTimestamp(value: GpsPayload['ts'] | undefined): Date | null {
    if (value === undefined || value === null) {
      return null;
    }

    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        return null;
      }
      const ms = value < EPOCH_SECONDS_THRESHOLD ? value * 1000 : value;
      const date = new Date(ms);
      return Number.isNaN(date.getTime()) ? null : date;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length === 0) {
        return null;
      }
      const numeric = Number(trimmed);
      if (Number.isFinite(numeric) && /^-?\d+(?:\.\d+)?$/.test(trimmed)) {
        return this.parseTimestamp(numeric);
      }
      const date = new Date(trimmed);
      return Number.isNaN(date.getTime()) ? null : date;
    }

    return null;
  }

  private parseFiniteNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  }

  private requireNonEmptyString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
  }

  private buildNormalizedPayload(input: {
    deviceId: string;
    occurredAt: Date;
    lat: number;
    lng: number;
    speedKph: number | undefined;
    heading: number | undefined;
    zone: string | undefined;
  }): Prisma.InputJsonValue {
    const payload: Record<string, unknown> = {
      deviceId: input.deviceId,
      occurredAt: input.occurredAt.toISOString(),
      lat: input.lat,
      lng: input.lng
    };

    if (input.speedKph !== undefined) {
      payload.speedKph = input.speedKph;
    }
    if (input.heading !== undefined) {
      payload.heading = input.heading;
    }
    if (input.zone) {
      payload.zone = input.zone;
    }

    return payload as Prisma.InputJsonValue;
  }

  private reject(sourceReference: string, reason: RejectionReason): MapResult {
    return { kind: 'reject', sourceReference, reason };
  }
}
