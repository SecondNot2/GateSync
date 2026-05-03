import type { Request } from 'express';

export type RequestUser = {
  supabaseUserId: string;
  email?: string;
  role?: string;
  claims: Record<string, unknown>;
};

export type AuthenticatedRequest = Request & {
  user: RequestUser;
};
