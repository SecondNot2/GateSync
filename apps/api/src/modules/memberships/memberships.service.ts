import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { MembershipRole, Prisma } from '@prisma/client';
import type { RequestUser } from '../auth/request-user';
import { PrismaService } from '../prisma/prisma.service';
import type { InviteMembershipDto } from './dto/invite-membership.dto';
import type { UpdateMembershipDto } from './dto/update-membership.dto';

const membershipInclude = {
  user: {
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      avatarUrl: true
    }
  }
} satisfies Prisma.MembershipInclude;

@Injectable()
export class MembershipsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  listMemberships(organizationId: string) {
    return this.prisma.membership.findMany({
      where: {
        organizationId,
        deletedAt: null
      },
      include: membershipInclude,
      orderBy: [
        {
          role: 'asc'
        },
        {
          createdAt: 'asc'
        }
      ]
    });
  }

  async createInvitePlaceholder(user: RequestUser, organizationId: string, dto: InviteMembershipDto) {
    await this.prisma.auditLog.create({
      data: {
        organizationId,
        actorUserId: user.id,
        action: 'membership.invite_placeholder',
        entityType: 'Membership',
        after: {
          email: dto.email.trim().toLowerCase(),
          role: dto.role,
          status: 'INVITED'
        }
      }
    });

    return {
      email: dto.email.trim().toLowerCase(),
      role: dto.role,
      status: 'INVITED',
      message: 'Invitation was recorded for audit. Supabase invite delivery will be connected in a later sprint.'
    };
  }

  async updateMembership(
    user: RequestUser,
    organizationId: string,
    membershipId: string,
    dto: UpdateMembershipDto
  ) {
    if (!dto.role && !dto.status) {
      throw new BadRequestException('At least one membership field must be provided.');
    }

    const actorMembership = this.getActorMembership(user, organizationId);
    const existingMembership = await this.prisma.membership.findFirst({
      where: {
        id: membershipId,
        organizationId,
        deletedAt: null
      },
      include: membershipInclude
    });

    if (!existingMembership) {
      throw new NotFoundException('Membership was not found in this organization.');
    }

    this.assertCanUpdateMembership(actorMembership.role, existingMembership.role, dto.role);

    if (existingMembership.userId === user.id && dto.status && dto.status !== 'ACTIVE') {
      throw new BadRequestException('You cannot deactivate your own membership.');
    }

    if (existingMembership.role === 'OWNER' && dto.role && dto.role !== 'OWNER') {
      await this.assertAnotherActiveOwnerExists(organizationId, membershipId);
    }

    const data: Prisma.MembershipUpdateInput = {};

    if (dto.role) {
      data.role = dto.role;
    }

    if (dto.status) {
      data.status = dto.status;
    }

    const updatedMembership = await this.prisma.$transaction(async (tx) => {
      const membership = await tx.membership.update({
        where: {
          id: membershipId
        },
        data,
        include: membershipInclude
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId: user.id,
          action: 'membership.update',
          entityType: 'Membership',
          entityId: membershipId,
          before: {
            role: existingMembership.role,
            status: existingMembership.status,
            userId: existingMembership.userId
          },
          after: {
            role: membership.role,
            status: membership.status,
            userId: membership.userId
          }
        }
      });

      return membership;
    });

    return updatedMembership;
  }

  private getActorMembership(user: RequestUser, organizationId: string) {
    const membership = user.memberships.find(
      (item) => item.organizationId === organizationId && item.status === 'ACTIVE'
    );

    if (!membership) {
      throw new ForbiddenException('You do not have access to this organization.');
    }

    return membership;
  }

  private assertCanUpdateMembership(
    actorRole: MembershipRole,
    currentTargetRole: MembershipRole,
    nextTargetRole?: MembershipRole
  ) {
    if (actorRole === 'OWNER') {
      return;
    }

    if (currentTargetRole === 'OWNER' || nextTargetRole === 'OWNER') {
      throw new ForbiddenException('Only an owner can update owner memberships.');
    }
  }

  private async assertAnotherActiveOwnerExists(organizationId: string, excludedMembershipId: string) {
    const ownerCount = await this.prisma.membership.count({
      where: {
        organizationId,
        role: 'OWNER',
        status: 'ACTIVE',
        deletedAt: null,
        NOT: {
          id: excludedMembershipId
        }
      }
    });

    if (ownerCount === 0) {
      throw new BadRequestException('Organization must keep at least one active owner.');
    }
  }
}
