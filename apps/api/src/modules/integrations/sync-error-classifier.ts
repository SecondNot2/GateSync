/**
 * Classify thrown errors and provider HTTP responses into the canonical
 * {@link SyncErrorCode} taxonomy used by the AUTO SYNC pipeline.
 *
 * The classifier is intentionally tolerant:
 *  - It accepts loosely-typed error shapes (`unknown`) because adapters may
 *    surface anything from `axios` errors to plain strings to `AbortError`.
 *  - It never throws — when nothing matches it falls back to
 *    `INTERNAL_ERROR`, which is non-retryable per
 *    {@link isRetryableErrorCode} (matching design rules for unclassified
 *    failures).
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 13.4
 */

import type { SyncErrorCode } from '@gatesync/shared';

/** Result of classifying an inbound failure. */
export interface ClassifiedSyncError {
  errorCode: SyncErrorCode;
  /** HTTP status code, when extractable from the error. */
  httpStatus?: number;
  /** Human-readable message. Caller is responsible for scrubbing. */
  message: string;
}

/**
 * Sentinel error throwers can use to short-circuit retry logic when they
 * already know the failure mode (e.g. a per-run timeout watchdog).
 */
export class SyncRunTimeoutError extends Error {
  readonly code: SyncErrorCode = 'TIMEOUT';

  constructor(message = 'Sync run exceeded maxRunDurationSeconds') {
    super(message);
    this.name = 'SyncRunTimeoutError';
  }
}

/**
 * Best-effort extraction of an HTTP status from a wide variety of error
 * shapes (fetch `Response`, axios, raw `{ status }`, etc.).
 */
export function extractHttpStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const candidate = error as Record<string, unknown> & { response?: Record<string, unknown> };

  if (typeof candidate.status === 'number') return candidate.status;
  if (typeof candidate.statusCode === 'number') return candidate.statusCode;
  if (typeof candidate.httpStatus === 'number') return candidate.httpStatus;

  const response = candidate.response;
  if (response && typeof response === 'object') {
    if (typeof response.status === 'number') return response.status;
    if (typeof (response as { statusCode?: unknown }).statusCode === 'number') {
      return (response as { statusCode: number }).statusCode;
    }
  }
  return undefined;
}

/** Map a known HTTP status onto the closest matching error code. */
export function classifyHttpStatus(status: number): SyncErrorCode {
  if (!Number.isFinite(status)) return 'INTERNAL_ERROR';
  if (status >= 500 && status < 600) return 'PROVIDER_5XX';
  if (status === 408) return 'PROVIDER_408';
  if (status === 429) return 'PROVIDER_429';
  if (status >= 400 && status < 500) return 'PROVIDER_4XX';
  return 'INTERNAL_ERROR';
}

/**
 * Classify an arbitrary thrown value. Order:
 *   1. Explicit `SyncErrorCode`-bearing errors (e.g. {@link SyncRunTimeoutError}).
 *   2. HTTP-shaped errors with extractable status.
 *   3. Common Node network error codes (`ETIMEDOUT`, `ECONNRESET`, ...).
 *   4. `AbortError` / timeout name patterns → TIMEOUT.
 *   5. Validation-flavoured names → VALIDATION_ERROR.
 *   6. Default → INTERNAL_ERROR.
 */
export function classifySyncError(error: unknown): ClassifiedSyncError {
  if (error instanceof SyncRunTimeoutError) {
    return { errorCode: 'TIMEOUT', message: error.message };
  }

  const message = errorMessage(error);
  const httpStatus = extractHttpStatus(error);

  if (typeof httpStatus === 'number') {
    return {
      errorCode: classifyHttpStatus(httpStatus),
      httpStatus,
      message
    };
  }

  if (error && typeof error === 'object') {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string') {
      switch (code) {
        case 'ETIMEDOUT':
        case 'ESOCKETTIMEDOUT':
          return { errorCode: 'TIMEOUT', message };
        case 'ECONNRESET':
        case 'ECONNREFUSED':
        case 'ENOTFOUND':
        case 'EAI_AGAIN':
        case 'EPIPE':
          return { errorCode: 'NETWORK_ERROR', message };
        case 'VALIDATION_ERROR':
          return { errorCode: 'VALIDATION_ERROR', message };
        default:
          break;
      }
    }

    const name = (error as { name?: unknown }).name;
    if (name === 'AbortError' || name === 'TimeoutError') {
      return { errorCode: 'TIMEOUT', message };
    }
    if (typeof name === 'string' && /validation/i.test(name)) {
      return { errorCode: 'VALIDATION_ERROR', message };
    }
  }

  return { errorCode: 'INTERNAL_ERROR', message };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const m = (error as { message?: unknown }).message;
    if (typeof m === 'string') return m;
  }
  return 'Unknown sync error';
}
