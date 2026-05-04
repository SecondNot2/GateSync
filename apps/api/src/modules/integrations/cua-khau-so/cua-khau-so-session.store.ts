import { Injectable } from '@nestjs/common';
import type { CuaKhauSoSession, CuaKhauSoSessionSummary } from './cua-khau-so.types';

const sessionTtlMs = 50 * 60 * 1000;

@Injectable()
export class CuaKhauSoSessionStore {
  private readonly sessions = new Map<string, CuaKhauSoSession>();

  save(organizationId: string, userId: string, session: Omit<CuaKhauSoSession, 'expiresAt'>) {
    const storedSession: CuaKhauSoSession = {
      ...session,
      expiresAt: new Date(Date.now() + sessionTtlMs)
    };

    this.sessions.set(this.createKey(organizationId, userId), storedSession);
    return this.toSummary(storedSession);
  }

  get(organizationId: string, userId: string): CuaKhauSoSession | undefined {
    const key = this.createKey(organizationId, userId);
    const session = this.sessions.get(key);

    if (!session) {
      return undefined;
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      this.sessions.delete(key);
      return undefined;
    }

    return session;
  }

  touch(organizationId: string, userId: string, session: CuaKhauSoSession) {
    session.expiresAt = new Date(Date.now() + sessionTtlMs);
    this.sessions.set(this.createKey(organizationId, userId), session);
    return this.toSummary(session);
  }

  clear(organizationId: string, userId: string) {
    this.sessions.delete(this.createKey(organizationId, userId));
  }

  getSummary(organizationId: string, userId: string): CuaKhauSoSessionSummary {
    const session = this.get(organizationId, userId);

    if (!session) {
      return {
        authenticated: false
      };
    }

    return this.toSummary(session);
  }

  private toSummary(session: CuaKhauSoSession): CuaKhauSoSessionSummary {
    return {
      authenticated: true,
      username: session.username,
      expiresAt: session.expiresAt.toISOString()
    };
  }

  private createKey(organizationId: string, userId: string) {
    return `${organizationId}:${userId}`;
  }
}
