/**
 * fast-check arbitraries for "sensitive" strings used by SensitiveScrubber
 * property tests (Property 8, Requirements 3.4, 4.7, 9.5, 11.4, 16.3).
 *
 * Each emitted value contains AT LEAST ONE substring that should match the
 * default scrubber patterns (Vietnamese phone, vehicle plate, declaration
 * number, CMND/CCCD, JWT/Bearer/api key). The arbitrary also returns the
 * sensitive substrings separately so tests can assert "no verbatim sensitive
 * substring survives in the output".
 */
import * as fc from 'fast-check';

export type SensitiveCategory =
  | 'phone'
  | 'plate'
  | 'declaration'
  | 'cmnd'
  | 'cccd'
  | 'jwt'
  | 'bearer'
  | 'apiKey';

export interface SensitiveSample {
  /** The wrapper string fed to the scrubber. */
  readonly text: string;
  /** Sensitive substrings embedded in `text` (verbatim). */
  readonly secrets: readonly string[];
  /** Categories present in `secrets`, parallel to its order. */
  readonly categories: readonly SensitiveCategory[];
}

const PHONE_PREFIXES = ['+84', '0', '84'];
const PLATE_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'K', 'L', 'M', 'N'];

const arbVnPhone = (): fc.Arbitrary<string> =>
  fc
    .tuple(
      fc.constantFrom(...PHONE_PREFIXES),
      fc
        .array(fc.integer({ min: 0, max: 9 }), { minLength: 9, maxLength: 9 })
        .map((digits) => digits.join(''))
    )
    .map(([prefix, rest]) => `${prefix}${rest}`);

const arbVnPlate = (): fc.Arbitrary<string> =>
  fc
    .tuple(
      fc.integer({ min: 11, max: 99 }),
      fc.constantFrom(...PLATE_LETTERS),
      fc.option(fc.constantFrom(...PLATE_LETTERS), { nil: '' as const }),
      fc.option(fc.integer({ min: 1, max: 9 }), { nil: undefined }),
      fc.integer({ min: 1000, max: 99999 })
    )
    .map(([prov, letter1, letter2, optDigit, suffix]) => {
      const letters = `${letter1}${letter2 ?? ''}`;
      const middle = optDigit !== undefined ? `${letters}${optDigit}` : letters;
      return `${prov}${middle}-${suffix}`;
    });

const arbDeclarationNumber = (): fc.Arbitrary<string> =>
  fc
    .array(fc.integer({ min: 0, max: 9 }), { minLength: 12, maxLength: 12 })
    .map((digits) => digits.join(''));

const arbCmnd = (): fc.Arbitrary<string> =>
  fc
    .array(fc.integer({ min: 0, max: 9 }), { minLength: 9, maxLength: 9 })
    .map((digits) => digits.join(''));

const arbCccd = (): fc.Arbitrary<string> =>
  fc
    .array(fc.integer({ min: 0, max: 9 }), { minLength: 12, maxLength: 12 })
    .map((digits) => digits.join(''));

const BASE64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const TOKEN_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._-+/=';
const APIKEY_VALUE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._-';

const stringFromAlphabet = (alphabet: string, min: number, max: number): fc.Arbitrary<string> =>
  fc
    .array(
      fc.integer({ min: 0, max: alphabet.length - 1 }).map((i) => alphabet[i]!),
      { minLength: min, maxLength: max }
    )
    .map((chars) => chars.join(''));

const arbJwt = (): fc.Arbitrary<string> =>
  fc
    .tuple(
      stringFromAlphabet(BASE64URL_ALPHABET, 8, 24),
      stringFromAlphabet(BASE64URL_ALPHABET, 16, 48),
      stringFromAlphabet(BASE64URL_ALPHABET, 16, 48)
    )
    .map(([h, p, s]) => `eyJ${h}.${p}.${s}`);

const arbBearer = (): fc.Arbitrary<string> =>
  stringFromAlphabet(TOKEN_ALPHABET, 16, 64).map((token) => `Bearer ${token}`);

const arbApiKeyAssignment = (): fc.Arbitrary<string> =>
  fc
    .tuple(
      fc.constantFrom('api_key', 'apikey', 'access_token', 'authorization', 'password'),
      stringFromAlphabet(APIKEY_VALUE_ALPHABET, 8, 32)
    )
    .map(([key, value]) => `${key}=${value}`);

interface CategorisedSecret {
  readonly category: SensitiveCategory;
  readonly secret: string;
}

const arbCategorisedSecret = (): fc.Arbitrary<CategorisedSecret> =>
  fc.oneof(
    arbVnPhone().map((secret) => ({ category: 'phone' as const, secret })),
    arbVnPlate().map((secret) => ({ category: 'plate' as const, secret })),
    arbDeclarationNumber().map((secret) => ({ category: 'declaration' as const, secret })),
    arbCmnd().map((secret) => ({ category: 'cmnd' as const, secret })),
    arbCccd().map((secret) => ({ category: 'cccd' as const, secret })),
    arbJwt().map((secret) => ({ category: 'jwt' as const, secret })),
    arbBearer().map((secret) => ({ category: 'bearer' as const, secret })),
    arbApiKeyAssignment().map((secret) => ({ category: 'apiKey' as const, secret }))
  );

/** A single sensitive token wrapped in random benign noise. */
export const arbSensitiveString: fc.Arbitrary<SensitiveSample> = fc
  .tuple(
    arbCategorisedSecret(),
    fc.string({ minLength: 0, maxLength: 32 }),
    fc.string({ minLength: 0, maxLength: 32 })
  )
  .map(([{ secret, category }, prefix, suffix]) => ({
    text: `${prefix} ${secret} ${suffix}`.trim(),
    secrets: [secret],
    categories: [category]
  }));

/**
 * Multi-secret variant — embeds 1–4 sensitive substrings into a single string
 * separated by random benign noise. Useful for stress-testing scrubber
 * regex ordering.
 */
export const arbSensitiveStringMulti: fc.Arbitrary<SensitiveSample> = fc
  .array(arbCategorisedSecret(), { minLength: 1, maxLength: 4 })
  .chain((tokens) =>
    fc
      .array(fc.string({ minLength: 0, maxLength: 16 }), {
        minLength: tokens.length + 1,
        maxLength: tokens.length + 1
      })
      .map((noises) => {
        const parts: string[] = [];
        for (let i = 0; i < tokens.length; i += 1) {
          parts.push(noises[i]!, tokens[i]!.secret);
        }
        parts.push(noises[noises.length - 1]!);
        return {
          text: parts.join(' ').replace(/\s+/g, ' ').trim(),
          secrets: tokens.map((t) => t.secret),
          categories: tokens.map((t) => t.category)
        };
      })
  );
