import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  UnauthorizedException
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { RealtimeTopicAuthorizer } from './realtime-topic-authorizer';

/**
 * Body of `POST /api/v1/realtime/authorize-topic`.
 *
 * Validation is performed manually (no class-validator) because the
 * endpoint must accept and reject malformed input with stable error codes
 * rather than 400s from a schema layer — Supabase Realtime expects a 200
 * with an `{ ok: false, reason }` envelope or a 401/403 to deny subscribe.
 */
type AuthorizeTopicRequestBody = {
  topic?: unknown;
};

/**
 * RealtimeController
 *
 * Single endpoint: `POST /api/v1/realtime/authorize-topic`.
 *
 * Integration points
 * ------------------
 * 1. Supabase Realtime "JWT auth" hook (preferred):
 *    Configure Supabase Realtime's authorize endpoint to point at this URL
 *    and forward the user's bearer token in `Authorization`. Realtime will
 *    POST `{ topic: "org:{organizationId}:user:{userId}" }` for each
 *    subscribe attempt against a private channel; we respond with 200 +
 *    `{ ok: true, userId, organizationId }` to permit, or 401 (token bad)
 *    / 403 (topic mismatch) to deny.
 *
 * 2. Custom WebSocket gateway clients:
 *    A custom client can call this endpoint before issuing `subscribe` to
 *    get a deterministic authorization decision tied to the same JWT
 *    pipeline used elsewhere in the API.
 *
 * Why this is NOT behind `SupabaseJwtGuard`
 * -----------------------------------------
 * The guard would map any auth failure to a 401 with a generic message
 * before we get a chance to distinguish `EXPIRED` from `UNAUTHENTICATED`
 * (Requirement 14.4 requires the client to be told to re-auth on expiry).
 * Handling auth inside the controller lets us return the discriminated
 * result envelope while still using the exact same verifier.
 *
 * Validates: Requirements 8.6, 14.1, 14.2, 14.3, 14.4.
 */
@ApiTags('realtime')
@ApiBearerAuth()
@Controller('realtime')
export class RealtimeController {
  constructor(
    @Inject(RealtimeTopicAuthorizer) private readonly authorizer: RealtimeTopicAuthorizer
  ) {}

  @Post('authorize-topic')
  @HttpCode(HttpStatus.OK)
  async authorizeTopic(
    @Req() request: Request,
    @Body() body: AuthorizeTopicRequestBody
  ): Promise<{ ok: true; userId: string; organizationId: string }> {
    const token = this.extractBearerToken(request);

    if (!token) {
      throw new UnauthorizedException('Missing bearer token.');
    }

    const requestedTopic = typeof body?.topic === 'string' ? body.topic : '';

    const result = await this.authorizer.authorizeTopicSubscription(token, requestedTopic);

    if (result.ok) {
      return {
        ok: true,
        userId: result.userId,
        organizationId: result.organizationId
      };
    }

    if (result.reason === 'FORBIDDEN') {
      throw new ForbiddenException('Topic does not match authenticated identity.');
    }

    // UNAUTHENTICATED and EXPIRED both map to 401. We use distinct
    // messages so a thoughtful client (or Supabase Realtime itself) can
    // tell whether to refresh the token or prompt the user to sign in.
    const message =
      result.reason === 'EXPIRED'
        ? 'Supabase bearer token has expired.'
        : 'Invalid Supabase bearer token.';

    throw new UnauthorizedException(message);
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
