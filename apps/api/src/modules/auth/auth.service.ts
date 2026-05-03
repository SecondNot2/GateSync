import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { JwtPayload } from 'jsonwebtoken';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestUser } from './request-user';

@Injectable()
export class AuthService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async resolveRequestUser(payload: JwtPayload): Promise<RequestUser> {
    const supabaseUserId = payload.sub;

    if (!supabaseUserId) {
      throw new UnauthorizedException('Invalid Supabase token subject.');
    }

    const email = typeof payload.email === 'string' ? payload.email : undefined;
    const fullName = this.resolveFullName(payload);
    const createData: Prisma.UserCreateInput = {
      supabaseUserId
    };
    const updateData: Prisma.UserUpdateInput = {};

    if (email) {
      createData.email = email;
      updateData.email = email;
    }

    if (fullName) {
      createData.fullName = fullName;
      updateData.fullName = fullName;
    }

    const user = await this.prisma.user.upsert({
      where: {
        supabaseUserId
      },
      create: createData,
      update: updateData,
      include: {
        memberships: {
          where: {
            deletedAt: null
          },
          select: {
            id: true,
            organizationId: true,
            role: true,
            status: true
          }
        }
      }
    });

    const requestUser: RequestUser = {
      id: user.id,
      supabaseUserId: user.supabaseUserId,
      claims: payload as Record<string, unknown>,
      memberships: user.memberships
    };

    if (user.email) {
      requestUser.email = user.email;
    }

    if (user.fullName) {
      requestUser.fullName = user.fullName;
    }

    if (user.phone) {
      requestUser.phone = user.phone;
    }

    if (typeof payload.role === 'string') {
      requestUser.role = payload.role;
    }

    return requestUser;
  }

  private resolveFullName(payload: JwtPayload): string | undefined {
    const metadata = payload.user_metadata;

    if (typeof metadata !== 'object' || metadata === null) {
      return undefined;
    }

    const values = metadata as Record<string, unknown>;
    const fullName = values.full_name ?? values.name;

    return typeof fullName === 'string' && fullName.trim().length > 0 ? fullName.trim() : undefined;
  }
}
