import { Inject, Injectable } from '@nestjs/common';
import type { JwtPayload } from 'jsonwebtoken';
import { SupabaseJwtVerifier } from '../../auth/supabase-jwt.verifier';

/**
 * Outcome of a realtime topic authorization check.
 *
 * - `UNAUTHENTICATED`: JWT signature was invalid, the token was malformed,
 *   or required claims were missing.
 * - `EXPIRED`: JWT signature was valid but `exp` was in the past.
 * - `FORBIDDEN`: JWT was valid, but the requested topic does not match the
 *   `org:{organizationId}:user:{userId}` of the authenticated user.
 *
 * Note: at this layer we never expose event content. The consumer (Supabase
 * Realtime auth hook or custom WebSocket gateway) is expected to deny
 * subscription on any non-`ok` result. Per Requirement 8.6, downstream
 * publishers are still responsible for RBAC checks on `tripId` before any
 * trip-scoped event content is delivered to the subscriber.
 */
export type AuthorizationResult =
  | { ok: true; userId: string; organizationId: string }
  | { ok: false; reason: 'UNAUTHENTICATED' | 'FORBIDDEN' | 'EXPIRED' };

/**
 * Topic naming convention agreed across the realtime stack:
 *   `org:{organizationId}:user:{userId}`
 *
 * Both segments must match the authenticated identity exactly. The regex is
 * deliberately strict: only non-empty, non-`:` characters are allowed in
 * each segment so neither side can sneak extra topic levels through.
 */
const TOPIC_PATTERN = /^org:([^:]+):user:([^:]+)$/u;

/**
 * RealtimeTopicAuthorizer
 *
 * Validates a Supabase JWT and authorizes a topic subscription request used
 * by the realtime stack. Backs:
 *   - the Supabase Realtime "JWT auth" hook (server-side authorize
 *     callback), which calls `POST /api/v1/realtime/authorize-topic`
 *     before allowing a `subscribe` for a private channel; and
 *   - any custom WebSocket gateway we add later, which can call the same
 *     method in-process before accepting a subscription.
 *
 * The check is intentionally minimal:
 *  1. Verify JWT signature/structure via the existing verifier.
 *  2. Reject expired tokens with a distinct `EXPIRED` reason so clients
 *     can refresh and reconnect (Requirement 14.4).
 *  3. Parse `requestedTopic` against `org:{organizationId}:user:{userId}`.
 *  4. Compare both topic segments to the JWT's claims; mismatch is
 *     `FORBIDDEN` (Requirement 14.3).
 *
 * Validates: Requirements 8.6, 14.1, 14.2, 14.3, 14.4.
 */
@Injectable()
export class RealtimeTopicAuthorizer {
  constructor(@Inject(SupabaseJwtVerifier) private readonly verifier: SupabaseJwtVerifier) {}

  async authorizeTopicSubscription(
    jwt: string,
    requestedTopic: string
  ): Promise<AuthorizationResult> {
    if (typeof jwt !== 'string' || jwt.length === 0) {
      return { ok: false, reason: 'UNAUTHENTICATED' };
    }

    if (typeof requestedTopic !== 'string' || requestedTopic.length === 0) {
      // Reject before verifying the JWT — there is nothing meaningful to
      // authorize against and we want a stable response shape.
      return { ok: false, reason: 'FORBIDDEN' };
    }

    const verification = await this.verifier.verifyTokenWithReason(jwt);

    if (!verification.ok) {
      return { ok: false, reason: verification.reason };
    }

    const claims = this.extractIdentityClaims(verification.payload);

    if (!claims) {
      return { ok: false, reason: 'UNAUTHENTICATED' };
    }

    const parsedTopic = this.parseTopic(requestedTopic);

    if (!parsedTopic) {
      return { ok: false, reason: 'FORBIDDEN' };
    }

    if (
      parsedTopic.organizationId !== claims.organizationId ||
      parsedTopic.userId !== claims.userId
    ) {
      return { ok: false, reason: 'FORBIDDEN' };
    }

    return {
      ok: true,
      userId: claims.userId,
      organizationId: claims.organizationId
    };
  }

  /**
   * Pull the user and active organization identifiers out of the Supabase
   * JWT payload. Supabase puts the user id in `sub`. The active
   * organization identifier is provided by GateSync via either:
   *   - a top-level `organization_id` claim set by our auth middleware, or
   *   - the `app_metadata.organization_id` slot used during invite/onboard.
   *
   * Both fall-throughs accept either snake_case or camelCase since
   * different parts of the platform produce both.
   */
  private extractIdentityClaims(
    payload: JwtPayload
  ): { userId: string; organizationId: string } | null {
    const userId = typeof payload.sub === 'string' && payload.sub.length > 0 ? payload.sub : null;

    if (!userId) {
      return null;
    }

    const organizationId =
      this.readStringClaim(payload, 'organization_id') ??
      this.readStringClaim(payload, 'organizationId') ??
      this.readStringClaim(payload.app_metadata, 'organization_id') ??
      this.readStringClaim(payload.app_metadata, 'organizationId') ??
      this.readStringClaim(payload.user_metadata, 'organization_id') ??
      this.readStringClaim(payload.user_metadata, 'organizationId');

    if (!organizationId) {
      return null;
    }

    return { userId, organizationId };
  }

  private readStringClaim(source: unknown, key: string): string | undefined {
    if (typeof source !== 'object' || source === null) {
      return undefined;
    }

    const value = (source as Record<string, unknown>)[key];

    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  private parseTopic(topic: string): { organizationId: string; userId: string } | null {
    const match = TOPIC_PATTERN.exec(topic);

    if (!match) {
      return null;
    }

    const [, organizationId, userId] = match;

    if (!organizationId || !userId) {
      return null;
    }

    return { organizationId, userId };
  }
}
