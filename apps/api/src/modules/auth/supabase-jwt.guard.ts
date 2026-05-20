import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import type { AuthenticatedRequest } from './request-user';
import { SupabaseJwtVerifier } from './supabase-jwt.verifier';

@Injectable()
export class SupabaseJwtGuard implements CanActivate {
  constructor(
    @Inject(SupabaseJwtVerifier) private readonly verifier: SupabaseJwtVerifier,
    @Inject(AuthService) private readonly authService: AuthService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractBearerToken(request);

    if (!token) {
      throw new UnauthorizedException('Missing bearer token.');
    }

    let payload;
    try {
      payload = await this.verifier.verifyToken(token);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      // Wrap any underlying `jsonwebtoken` failure (signature mismatch,
      // expiry, malformed payload, ...) in the same unauthorized message
      // the guard has historically returned.
      throw new UnauthorizedException('Invalid Supabase bearer token.');
    }

    request.user = await this.authService.resolveRequestUser(payload);

    return true;
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
