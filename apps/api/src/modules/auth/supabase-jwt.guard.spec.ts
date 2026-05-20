import assert from 'node:assert/strict';
import test from 'node:test';
import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { AuthService } from './auth.service';
import { SupabaseJwtGuard } from './supabase-jwt.guard';
import type { SupabaseJwtVerifier } from './supabase-jwt.verifier';

function createContext(headers: Record<string, string | undefined>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers
      })
    })
  } as ExecutionContext;
}

test('blocks anonymous requests without a bearer token', async () => {
  const guard = new SupabaseJwtGuard({} as SupabaseJwtVerifier, {} as AuthService);

  await assert.rejects(async () => guard.canActivate(createContext({})), UnauthorizedException);
});
