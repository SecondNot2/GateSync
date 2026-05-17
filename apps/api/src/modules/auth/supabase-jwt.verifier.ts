import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createPublicKey,
  type JsonWebKey,
  type JsonWebKeyInput,
  type KeyObject
} from 'node:crypto';
import { decode, verify, type Algorithm, type JwtHeader, type JwtPayload } from 'jsonwebtoken';

type SupportedAsymmetricAlgorithm = Extract<Algorithm, 'ES256' | 'RS256'>;

type JwksCache = {
  keys: JsonWebKey[];
  expiresAt: number;
};

const asymmetricAlgorithms = new Set<string>(['ES256', 'RS256']);
const jwksCacheTtlMilliseconds = 60 * 60 * 1000;
let jwksCache: JwksCache | undefined;

/**
 * SupabaseJwtVerifier
 *
 * Verifies Supabase Auth JWTs (HS256 with shared secret, or ES256/RS256 via
 * the project JWKS endpoint) and returns the decoded payload.
 *
 * Why this is a standalone service:
 * - The HTTP guard (`SupabaseJwtGuard`) needs it during request handling.
 * - The realtime topic authorizer (Requirements 8.6, 14.1-14.4) needs the
 *   exact same verification logic when authorizing topic subscriptions
 *   without going through the request pipeline.
 *
 * All `UnauthorizedException`s thrown here use the same wording as the
 * guard so existing error contracts are preserved.
 */
@Injectable()
export class SupabaseJwtVerifier {
  constructor(@Inject(ConfigService) private readonly configService: ConfigService) {}

  /**
   * Verify the signature and structure of a Supabase JWT.
   *
   * Note: this method does NOT enforce the `exp` claim itself — `jsonwebtoken`
   * raises a `TokenExpiredError` when the token is expired, which is mapped
   * to `UnauthorizedException`. Callers that need to distinguish expiry from
   * other auth failures should use `verifyTokenWithReason` instead.
   */
  async verifyToken(token: string): Promise<JwtPayload> {
    const decodedToken = decode(token, { complete: true });

    if (!decodedToken || typeof decodedToken === 'string') {
      throw new UnauthorizedException('Invalid Supabase bearer token.');
    }

    const algorithm = decodedToken.header.alg;

    if (algorithm === 'HS256') {
      return this.verifyHmacToken(token);
    }

    if (this.isSupportedAsymmetricAlgorithm(algorithm)) {
      return this.verifyAsymmetricToken(token, decodedToken.header, algorithm);
    }

    throw new UnauthorizedException('Unsupported Supabase bearer token algorithm.');
  }

  /**
   * Verify a Supabase JWT and report failures as a discriminated reason
   * instead of throwing. Used by the realtime topic authorizer so it can
   * differentiate `EXPIRED` from `UNAUTHENTICATED` (Requirements 14.1, 14.4).
   */
  async verifyTokenWithReason(
    token: string
  ): Promise<
    { ok: true; payload: JwtPayload } | { ok: false; reason: 'UNAUTHENTICATED' | 'EXPIRED' }
  > {
    try {
      const payload = await this.verifyToken(token);

      // Defence in depth: even if `jsonwebtoken` somehow returned a payload
      // for a token whose `exp` is in the past, treat it as expired here.
      if (typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now()) {
        return { ok: false, reason: 'EXPIRED' };
      }

      return { ok: true, payload };
    } catch (error) {
      if (this.isExpiredError(error)) {
        return { ok: false, reason: 'EXPIRED' };
      }
      return { ok: false, reason: 'UNAUTHENTICATED' };
    }
  }

  private verifyHmacToken(token: string): JwtPayload {
    const secret = this.configService.get<string>('SUPABASE_JWT_SECRET');

    if (!secret) {
      throw new UnauthorizedException('Supabase JWT verification is not configured.');
    }

    return this.resolveVerifiedPayload(verify(token, secret, { algorithms: ['HS256'] }));
  }

  private async verifyAsymmetricToken(
    token: string,
    header: JwtHeader,
    algorithm: SupportedAsymmetricAlgorithm
  ): Promise<JwtPayload> {
    const publicKey = await this.resolveJwksPublicKey(header, algorithm);

    return this.resolveVerifiedPayload(verify(token, publicKey, { algorithms: [algorithm] }));
  }

  private async resolveJwksPublicKey(
    header: JwtHeader,
    algorithm: SupportedAsymmetricAlgorithm
  ): Promise<KeyObject> {
    const keyId = header.kid;

    if (!keyId) {
      throw new UnauthorizedException('Supabase bearer token is missing a key id.');
    }

    const keys = await this.fetchSupabaseJwks();
    const matchingKey = keys.find(
      (key) => key.kid === keyId && (!key.alg || key.alg === algorithm)
    );

    if (!matchingKey) {
      throw new UnauthorizedException('Supabase bearer token key was not found.');
    }

    return createPublicKey({
      key: matchingKey,
      format: 'jwk'
    } satisfies JsonWebKeyInput);
  }

  private async fetchSupabaseJwks(): Promise<JsonWebKey[]> {
    const now = Date.now();

    if (jwksCache && jwksCache.expiresAt > now) {
      return jwksCache.keys;
    }

    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');

    if (!supabaseUrl) {
      throw new UnauthorizedException('Supabase JWKS verification is not configured.');
    }

    try {
      const response = await fetch(new URL('/auth/v1/.well-known/jwks.json', supabaseUrl));
      const body = (await response.json()) as unknown;
      const keys = this.resolveJwksKeys(body);

      jwksCache = {
        keys,
        expiresAt: now + jwksCacheTtlMilliseconds
      };

      return keys;
    } catch {
      throw new UnauthorizedException('Supabase JWKS verification failed.');
    }
  }

  private resolveJwksKeys(value: unknown): JsonWebKey[] {
    if (!this.isRecord(value) || !Array.isArray(value.keys)) {
      throw new UnauthorizedException('Invalid Supabase JWKS response.');
    }

    return value.keys.filter(
      (key): key is JsonWebKey => this.isRecord(key) && typeof key.kty === 'string'
    );
  }

  private resolveVerifiedPayload(payload: string | JwtPayload): JwtPayload {
    if (typeof payload === 'string') {
      throw new UnauthorizedException('Invalid Supabase bearer token payload.');
    }

    return payload;
  }

  private isSupportedAsymmetricAlgorithm(
    algorithm?: string
  ): algorithm is SupportedAsymmetricAlgorithm {
    return Boolean(algorithm && asymmetricAlgorithms.has(algorithm));
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private isExpiredError(error: unknown): boolean {
    return (
      error instanceof Error &&
      (error.name === 'TokenExpiredError' || /jwt expired/i.test(error.message))
    );
  }
}

/**
 * Reset the in-process JWKS cache. Intended for tests only.
 */
export function __resetSupabaseJwksCacheForTests(): void {
  jwksCache = undefined;
}
