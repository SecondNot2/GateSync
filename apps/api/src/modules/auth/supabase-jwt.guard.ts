import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createPublicKey,
  type JsonWebKey,
  type JsonWebKeyInput,
  type KeyObject
} from 'node:crypto';
import { decode, verify, type Algorithm, type JwtHeader, type JwtPayload } from 'jsonwebtoken';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import type { AuthenticatedRequest } from './request-user';

type SupportedAsymmetricAlgorithm = Extract<Algorithm, 'ES256' | 'RS256'>;

type JwksCache = {
  keys: JsonWebKey[];
  expiresAt: number;
};

const asymmetricAlgorithms = new Set<string>(['ES256', 'RS256']);
const jwksCacheTtlMilliseconds = 60 * 60 * 1000;
let jwksCache: JwksCache | undefined;

@Injectable()
export class SupabaseJwtGuard implements CanActivate {
  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(AuthService) private readonly authService: AuthService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractBearerToken(request);

    if (!token) {
      throw new UnauthorizedException('Missing bearer token.');
    }

    const payload = await this.verifyToken(token);
    request.user = await this.authService.resolveRequestUser(payload);

    return true;
  }

  private async verifyToken(token: string): Promise<JwtPayload> {
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

  private verifyHmacToken(token: string): JwtPayload {
    const secret = this.configService.get<string>('SUPABASE_JWT_SECRET');

    if (!secret) {
      throw new UnauthorizedException('Supabase JWT verification is not configured.');
    }

    try {
      return this.resolveVerifiedPayload(verify(token, secret, { algorithms: ['HS256'] }));
    } catch {
      throw new UnauthorizedException('Invalid Supabase bearer token.');
    }
  }

  private async verifyAsymmetricToken(
    token: string,
    header: JwtHeader,
    algorithm: SupportedAsymmetricAlgorithm
  ): Promise<JwtPayload> {
    const publicKey = await this.resolveJwksPublicKey(header, algorithm);

    try {
      return this.resolveVerifiedPayload(verify(token, publicKey, { algorithms: [algorithm] }));
    } catch {
      throw new UnauthorizedException('Invalid Supabase bearer token.');
    }
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

  private extractBearerToken(request: Request): string | undefined {
    const authorization = request.headers.authorization;

    if (!authorization) {
      return undefined;
    }

    const [scheme, token] = authorization.split(' ');

    if (scheme !== 'Bearer' || !token) {
      return undefined;
    }

    return token;
  }
}
