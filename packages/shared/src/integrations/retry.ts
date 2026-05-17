/**
 * Retry delay math and retry-eligibility decision used by the AUTO SYNC pipeline,
 * the realtime dispatch path, and the external-channel dispatcher.
 *
 * Formula (all variants share the same shape):
 *   delayMs = min(base^attemptIndex, capSeconds) * 1000 + jitterMs
 *
 * `attemptIndex` is 0-indexed and represents the upcoming retry attempt.
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 8.7, 9.4, 13.4
 * Cross-ref: design.md "Sync error taxonomy" + "Retry decision".
 */

/** Stable error code taxonomy for the sync pipeline (see design.md). */
export type SyncErrorCode =
  | 'NETWORK_ERROR'
  | 'PROVIDER_5XX'
  | 'PROVIDER_408'
  | 'PROVIDER_429'
  | 'PROVIDER_4XX'
  | 'TIMEOUT'
  | 'VALIDATION_ERROR'
  | 'INTERNAL_ERROR';

/** Jitter source. Takes the upcoming attemptIndex; returns delay in milliseconds. */
export type JitterFn = (attemptIndex: number) => number;

/** Default jitter: uniform [0, 1000) ms, matching `rand(0,1)s` from Requirement 3.1. */
export const defaultJitterMs: JitterFn = () => Math.floor(Math.random() * 1000);

/** Disable jitter. Useful in deterministic tests. */
export const noJitter: JitterFn = () => 0;

export interface ComputeRetryDelayOptions {
  /** 0-indexed retry attempt number (0 = first retry). */
  attemptIndex: number;
  /** Exponential base. */
  base: number;
  /** Cap on the exponential portion in seconds. */
  capSeconds: number;
  /** Jitter generator. Defaults to uniform [0,1000) ms; pass {@link noJitter} to disable. */
  jitter?: JitterFn;
}

/** Compute the delay (ms) to wait before the next retry attempt. */
export function computeRetryDelayMs(options: ComputeRetryDelayOptions): number {
  const { attemptIndex, base, capSeconds } = options;
  const jitter = options.jitter ?? defaultJitterMs;

  if (!Number.isInteger(attemptIndex) || attemptIndex < 0) {
    throw new RangeError(`attemptIndex must be a non-negative integer, got ${attemptIndex}`);
  }
  if (!Number.isFinite(base) || base <= 0) {
    throw new RangeError(`base must be a positive finite number, got ${base}`);
  }
  if (!Number.isFinite(capSeconds) || capSeconds <= 0) {
    throw new RangeError(`capSeconds must be a positive finite number, got ${capSeconds}`);
  }

  const exponential = Math.pow(base, attemptIndex);
  const cappedSeconds = Math.min(exponential, capSeconds);
  const jitterMs = Math.max(0, jitter(attemptIndex));
  return Math.floor(cappedSeconds * 1000 + jitterMs);
}

/** Retry policy parameters shared by sync / realtime / external-channel pipelines. */
export interface RetryPolicy {
  /** Max number of retries (does NOT count the initial attempt). */
  maxRetries: number;
  /** Exponential base for {@link computeRetryDelayMs}. */
  base: number;
  /** Cap on the exponential portion in seconds. */
  capSeconds: number;
  /**
   * Cumulative time budget across all attempts (ms). When elapsedMs exceeds this,
   * no further retry is scheduled. `Infinity` disables the time-window cap.
   */
  maxElapsedMs: number;
  /** Jitter generator for delays produced under this policy. */
  jitter: JitterFn;
}

/**
 * AUTO SYNC default policy.
 * Requirement 3.1/3.2: base=2, cap=300s, max 5 retries, 30-minute cumulative window.
 */
export const SYNC_RETRY_POLICY: RetryPolicy = Object.freeze({
  maxRetries: 5,
  base: 2,
  capSeconds: 300,
  maxElapsedMs: 30 * 60 * 1000,
  jitter: defaultJitterMs
});

/**
 * Realtime dispatch policy.
 * Requirement 8.7: max 2 retries with backoff 1s and 3s. With base=3, cap=3:
 *   attempt 0 → min(3^0, 3) = 1s
 *   attempt 1 → min(3^1, 3) = 3s
 * Jitter is disabled by default to honour the exact 1s / 3s cadence.
 */
export const REALTIME_RETRY_POLICY: RetryPolicy = Object.freeze({
  maxRetries: 2,
  base: 3,
  capSeconds: 3,
  maxElapsedMs: Number.POSITIVE_INFINITY,
  jitter: noJitter
});

/**
 * External-channel (Zalo / SMS / Email) dispatch policy.
 * Requirement 9.4: max 3 retries with exponential backoff.
 */
export const EXTERNAL_CHANNEL_RETRY_POLICY: RetryPolicy = Object.freeze({
  maxRetries: 3,
  base: 2,
  capSeconds: 300,
  maxElapsedMs: Number.POSITIVE_INFINITY,
  jitter: defaultJitterMs
});

export interface ShouldRetryOptions {
  /** Domain error code from the sync taxonomy (optional when `httpStatus` is present). */
  errorCode?: SyncErrorCode;
  /** HTTP status code returned by the provider, if any. */
  httpStatus?: number;
  /** 0-indexed upcoming retry attempt number. */
  attemptIndex: number;
  /** Total elapsed time (ms) since the first attempt of this logical run. */
  elapsedMs: number;
  /** Retry policy. Defaults to {@link SYNC_RETRY_POLICY}. */
  policy?: RetryPolicy;
}

/**
 * Decide whether the worker should schedule another retry.
 *
 * - HTTP 5xx, 408, 429 are retryable.
 * - HTTP `[400, 500) \ {408, 429}` is non-retryable.
 * - When no httpStatus is supplied, fall back to the {@link SyncErrorCode} taxonomy.
 * - Hard caps: `attemptIndex >= maxRetries` or `elapsedMs >= maxElapsedMs` → no retry.
 */
export function shouldRetry(options: ShouldRetryOptions): boolean {
  const { errorCode, httpStatus, attemptIndex, elapsedMs } = options;
  const policy = options.policy ?? SYNC_RETRY_POLICY;

  if (!Number.isFinite(attemptIndex) || attemptIndex < 0) return false;
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return false;

  // Hard caps: budget exhausted.
  if (attemptIndex >= policy.maxRetries) return false;
  if (elapsedMs >= policy.maxElapsedMs) return false;

  // HTTP status takes precedence when provided.
  if (typeof httpStatus === 'number' && Number.isFinite(httpStatus)) {
    return isRetryableHttpStatus(httpStatus);
  }

  if (errorCode) {
    return isRetryableErrorCode(errorCode);
  }

  // Without any classification, treat as a transient generic failure (network-like).
  return true;
}

/** True iff the HTTP status is retry-eligible per design rules. */
export function isRetryableHttpStatus(status: number): boolean {
  if (!Number.isFinite(status)) return false;
  if (status >= 500 && status < 600) return true;
  if (status === 408 || status === 429) return true;
  // [400, 500) \ {408, 429} → non-retryable.
  if (status >= 400 && status < 500) return false;
  // 1xx/2xx/3xx are not failures; conservative default is non-retryable.
  return false;
}

/** True iff the sync error code is retry-eligible per design rules. */
export function isRetryableErrorCode(code: SyncErrorCode): boolean {
  switch (code) {
    case 'NETWORK_ERROR':
    case 'PROVIDER_5XX':
    case 'PROVIDER_408':
    case 'PROVIDER_429':
    case 'TIMEOUT':
      return true;
    case 'PROVIDER_4XX':
    case 'VALIDATION_ERROR':
    case 'INTERNAL_ERROR':
      return false;
    default: {
      const _exhaustive: never = code;
      return _exhaustive;
    }
  }
}
