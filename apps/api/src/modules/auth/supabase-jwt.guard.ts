import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { verify, type JwtPayload } from 'jsonwebtoken';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import type { AuthenticatedRequest } from './request-user';

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

    const secret = this.configService.get<string>('SUPABASE_JWT_SECRET');

    if (!secret) {
      throw new UnauthorizedException('Supabase JWT verification is not configured.');
    }

    const payload = await this.verifyToken(token, secret);
    request.user = await this.authService.resolveRequestUser(payload);

    return true;
  }

  private async verifyToken(token: string, secret: string): Promise<JwtPayload> {
    try {
      const payload = verify(token, secret);

      if (typeof payload === 'string') {
        throw new UnauthorizedException('Invalid Supabase bearer token payload.');
      }

      return payload;
    } catch {
      throw new UnauthorizedException('Invalid Supabase bearer token.');
    }
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
