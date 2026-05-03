import type { Request } from 'express';
import type { MembershipRole, MembershipStatus } from '@prisma/client';

export type RequestMembership = {
  id: string;
  organizationId: string;
  role: MembershipRole;
  status: MembershipStatus;
};

export type RequestUser = {
  id: string;
  supabaseUserId: string;
  email?: string;
  fullName?: string;
  phone?: string;
  role?: string;
  claims: Record<string, unknown>;
  memberships: RequestMembership[];
};

export type AuthenticatedRequest = Request & {
  user: RequestUser;
  organizationMembership?: RequestMembership;
};
