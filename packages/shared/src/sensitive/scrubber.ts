/**
 * SensitiveScrubber
 *
 * Single shared utility used at three chokepoints (integration sync logs,
 * external channel dispatch payload digests, audit log before/after snapshots,
 * realtime broadcast payloads) to mask sensitive substrings before they leave
 * the trusted backend boundary.
 *
 * Design references:
 * - Requirements: 3.4, 4.7, 9.5, 11.4, 16.3
 * - Sensitive field policy in design.md (credentials, phone, CMND/CCCD,
 *   vehicle plates, declaration numbers, raw provider payloads).
 *
 * Behaviour contract:
 * - Operates on strings, JSON values (primitives, arrays, plain objects), and
 *   `Error` shapes.
 * - Returns a shallow-cloned masked output. Inputs are never mutated.
 * - Replaces matched values with the configured mask token (default `***`).
 * - Combines two strategies:
 *     1. Field-name match — if an object key is one of the configured
 *        sensitive keys, the whole value at that key is masked, regardless of
 *        its shape.
 *     2. Pattern match — applied to every remaining string value. Patterns
 *        target Vietnamese phones, CMND/CCCD ids, Vietnamese vehicle plates,
 *        declaration numbers, and credential-like tokens (JWT, Bearer,
 *        `sk_...`, `api_key=...`).
 * - Cycle-safe: object cycles are detected via a WeakSet and replaced with
 *   the mask token to avoid infinite recursion.
 */

const DEFAULT_MASK = '***';

/**
 * Default sensitive field-name keys.
 *
 * Matching is case-insensitive. A key is considered sensitive when it equals
 * any entry in this list OR contains any entry as a substring (after
 * lower-casing). This keeps `userPassword`, `password_hash`,
 * `encryptedCredentials`, etc. all covered without enumerating every variant.
 */
export const DEFAULT_SENSITIVE_FIELD_KEYS: readonly string[] = [
  // Credentials and tokens
  'password',
  'passwd',
  'secret',
  'token',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'apikey',
  'api_key',
  'authorization',
  'clientsecret',
  'privatekey',
  'encryptedcredentials',
  'credentials',
  // Contact details
  'phone',
  'phonenumber',
  'mobile',
  'email',
  // Driver identity
  'cmnd',
  'cccd',
  'drivercmnd',
  'idnumber',
  'nationalid',
  'licensenumber',
  // Vehicle plates
  'plate',
  'platenumber',
  'licenseplate',
  'licenceplate',
  'licenceplatevntq',
  'licenceplatechange',
  // Declarations
  'declarationnumber',
  'customsdeclarationnumber',
  'tokhai',
  'tokhaiso',
  // Provider raw payloads (only safe when debugMode + already masked)
  'rawpayload',
  'rawrequest',
  'rawresponse'
];

/**
 * Default regex patterns applied to free-form strings.
 *
 * Order matters: longer / more specific tokens (JWT, Bearer) are matched
 * first so their surrounding tokens are not partially eaten by shorter
 * digit-run rules.
 */
export const DEFAULT_SENSITIVE_PATTERNS: readonly RegExp[] = [
  // JWT triplets: eyJ.<base64url>.<base64url>
  /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
  // Bearer / Basic authorization headers
  /\b(?:Bearer|Basic)\s+[A-Za-z0-9._\-+/=]+/gi,
  // Stripe-style / generic secret-key prefixes
  /\bsk_[A-Za-z0-9_-]{8,}/g,
  /\bpk_live_[A-Za-z0-9_-]{8,}/g,
  // api_key=..., access_token=..., authorization=...
  /\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|password)\s*[:=]\s*"?[^\s"&,;]+/gi,
  // Vietnamese license plates: 29A-12345, 29A1-23456, 51F-1234, 51LD-12345
  /\b\d{2}[A-Z]{1,2}\d?-\d{4,5}\b/g,
  // Vietnamese phone numbers: +84..., 84..., 0... with 9-10 trailing digits
  /(?<!\d)(?:\+84|0)\d{9,10}(?!\d)/g,
  // CMND / CCCD: 9 or 12 digit national IDs, not surrounded by other digits
  /(?<!\d)\d{12}(?!\d)/g,
  /(?<!\d)\d{9}(?!\d)/g
];

export interface SensitiveScrubberConfig {
  /** Field-name keys (case-insensitive). Substring match. */
  fieldKeys: readonly string[];
  /** Regex patterns evaluated against every string value. */
  patterns: readonly RegExp[];
  /** Replacement token for matched values. Defaults to `***`. */
  mask: string;
  /** Hard ceiling on recursion depth. Defaults to 12. */
  maxDepth: number;
}

export interface SensitiveScrubber {
  /** Scrub any JSON-compatible value. */
  scrub<T>(value: T): T;
  /** Scrub a string in-place (returns the masked string). */
  scrubString(value: string): string;
  /** Scrub an `Error`-shaped value, returning a plain JSON-safe object. */
  scrubError(err: unknown): ScrubbedError;
}

export interface ScrubbedError {
  name: string;
  message: string;
  stack?: string;
  cause?: unknown;
  [key: string]: unknown;
}

export interface CreateSensitiveScrubberOptions {
  fieldKeys?: readonly string[];
  patterns?: readonly RegExp[];
  mask?: string;
  maxDepth?: number;
}

/**
 * Build a SensitiveScrubber instance with the supplied (or default)
 * configuration. The returned object is stateless beyond its config and is
 * safe to reuse across requests.
 */
export function createSensitiveScrubber(
  options: CreateSensitiveScrubberOptions = {}
): SensitiveScrubber {
  const config: SensitiveScrubberConfig = {
    fieldKeys: (options.fieldKeys ?? DEFAULT_SENSITIVE_FIELD_KEYS).map((k) => k.toLowerCase()),
    patterns: options.patterns ?? DEFAULT_SENSITIVE_PATTERNS,
    mask: options.mask ?? DEFAULT_MASK,
    maxDepth: options.maxDepth ?? 12
  };

  const isSensitiveKey = (key: string): boolean => {
    const lower = key.toLowerCase();
    for (const candidate of config.fieldKeys) {
      if (lower === candidate || lower.includes(candidate)) {
        return true;
      }
    }
    return false;
  };

  const scrubString = (value: string): string => {
    let out = value;
    for (const pattern of config.patterns) {
      // Always create a fresh RegExp to avoid lastIndex pollution when the
      // caller-supplied pattern is /g sticky.
      const re =
        pattern.global || pattern.sticky ? new RegExp(pattern.source, pattern.flags) : pattern;
      out = out.replace(re, config.mask);
    }
    return out;
  };

  const scrubValue = (value: unknown, depth: number, seen: WeakSet<object>): unknown => {
    if (value === null || value === undefined) {
      return value;
    }

    const type = typeof value;
    if (type === 'string') {
      return scrubString(value as string);
    }
    if (type === 'number' || type === 'boolean' || type === 'bigint') {
      return value;
    }
    if (type === 'function' || type === 'symbol') {
      // Drop non-serialisable values to keep output JSON-safe.
      return config.mask;
    }

    if (depth >= config.maxDepth) {
      return config.mask;
    }

    if (value instanceof Date) {
      return new Date(value.getTime());
    }
    if (value instanceof RegExp) {
      return new RegExp(value.source, value.flags);
    }
    if (value instanceof Error) {
      return scrubErrorInternal(value, depth, seen);
    }

    if (Array.isArray(value)) {
      if (seen.has(value)) {
        return config.mask;
      }
      seen.add(value);
      const cloned = value.map((item) => scrubValue(item, depth + 1, seen));
      seen.delete(value);
      return cloned;
    }

    if (type === 'object') {
      const obj = value as Record<string, unknown>;
      if (seen.has(obj)) {
        return config.mask;
      }
      seen.add(obj);
      const cloned: Record<string, unknown> = {};
      for (const key of Object.keys(obj)) {
        if (isSensitiveKey(key)) {
          cloned[key] = config.mask;
        } else {
          cloned[key] = scrubValue(obj[key], depth + 1, seen);
        }
      }
      seen.delete(obj);
      return cloned;
    }

    return value;
  };

  const scrubErrorInternal = (err: Error, depth: number, seen: WeakSet<object>): ScrubbedError => {
    const safe: ScrubbedError = {
      name: err.name,
      message: typeof err.message === 'string' ? scrubString(err.message) : ''
    };
    if (typeof err.stack === 'string') {
      safe.stack = scrubString(err.stack);
    }
    // `cause` is standard since ES2022.
    const cause = (err as { cause?: unknown }).cause;
    if (cause !== undefined) {
      safe.cause = scrubValue(cause, depth + 1, seen);
    }
    // Copy any extra enumerable own properties an error subclass may carry.
    for (const key of Object.keys(err) as Array<keyof Error & string>) {
      if (key === 'name' || key === 'message' || key === 'stack' || key === 'cause') {
        continue;
      }
      const raw = (err as unknown as Record<string, unknown>)[key];
      safe[key] = isSensitiveKey(key) ? config.mask : scrubValue(raw, depth + 1, seen);
    }
    return safe;
  };

  return {
    scrub<T>(value: T): T {
      return scrubValue(value, 0, new WeakSet<object>()) as T;
    },
    scrubString,
    scrubError(err: unknown): ScrubbedError {
      if (err instanceof Error) {
        return scrubErrorInternal(err, 0, new WeakSet<object>());
      }
      // Coerce non-Error throwables into a stable shape.
      if (err && typeof err === 'object') {
        const cloned = scrubValue(err, 0, new WeakSet<object>()) as Record<string, unknown>;
        return {
          name: typeof cloned.name === 'string' ? cloned.name : 'NonError',
          message:
            typeof cloned.message === 'string' ? cloned.message : scrubString(safeStringify(err)),
          ...cloned
        };
      }
      return {
        name: 'NonError',
        message: scrubString(safeStringify(err))
      };
    }
  };
}

function safeStringify(value: unknown): string {
  try {
    return typeof value === 'string' ? value : (JSON.stringify(value) ?? String(value));
  } catch {
    return String(value);
  }
}

/** Convenience singleton with default configuration. */
export const defaultSensitiveScrubber: SensitiveScrubber = createSensitiveScrubber();
