import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type { MembershipRole, Prisma } from '@prisma/client';
import type { RequestUser } from '../auth/request-user';
import { PrismaService } from '../prisma/prisma.service';
import type { AcceptMembershipInvitationDto } from './dto/accept-membership-invitation.dto';
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

const membershipInvitationSelect = {
  id: true,
  organizationId: true,
  email: true,
  role: true,
  status: true,
  expiresAt: true,
  createdAt: true,
  acceptedAt: true
} satisfies Prisma.MembershipInvitationSelect;

const invitationTtlMilliseconds = 14 * 24 * 60 * 60 * 1000;

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

  async createInvitation(user: RequestUser, organizationId: string, dto: InviteMembershipDto) {
    const actorMembership = this.getActorMembership(user, organizationId);

    if (actorMembership.role !== 'OWNER' && actorMembership.role !== 'ADMIN') {
      throw new ForbiddenException('Your role does not allow inviting organization members.');
    }

    const email = dto.email.trim().toLowerCase();
    const existingUser = await this.prisma.user.findUnique({
      where: {
        email
      },
      include: {
        memberships: {
          where: {
            organizationId,
            deletedAt: null
          },
          select: {
            status: true
          },
          take: 1
        }
      }
    });
    const existingMembership = existingUser?.memberships[0];

    if (existingMembership?.status === 'ACTIVE') {
      throw new BadRequestException('This user is already an active organization member.');
    }

    const inviteCode = this.createInvitationCode();
    const expiresAt = new Date(Date.now() + invitationTtlMilliseconds);
    const invitation = await this.prisma.$transaction(async (tx) => {
      const createdInvitation = await tx.membershipInvitation.create({
        data: {
          organizationId,
          email,
          role: dto.role,
          codeHash: this.hashInvitationCode(inviteCode),
          expiresAt,
          createdById: user.id
        },
        select: membershipInvitationSelect
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId: user.id,
          action: 'membership.invitation.create',
          entityType: 'MembershipInvitation',
          entityId: createdInvitation.id,
          after: {
            email,
            role: dto.role,
            status: createdInvitation.status,
            expiresAt: createdInvitation.expiresAt.toISOString()
          }
        }
      });

      return createdInvitation;
    });

    return {
      ...invitation,
      inviteCode,
      message: 'Invitation code was created. Share it only with the invited user.'
    };
  }

  async acceptInvitation(user: RequestUser, dto: AcceptMembershipInvitationDto) {
    const codeHash = this.hashInvitationCode(dto.code);
    const invitation = await this.prisma.membershipInvitation.findUnique({
      where: {
        codeHash
      },
      select: {
        ...membershipInvitationSelect,
        codeHash: true
      }
    });

    if (!invitation) {
      throw new NotFoundException('Membership invitation was not found.');
    }

    if (invitation.status !== 'PENDING') {
      throw new BadRequestException('Membership invitation is no longer active.');
    }

    const now = new Date();

    if (invitation.expiresAt <= now) {
      await this.prisma.membershipInvitation.update({
        where: {
          id: invitation.id
        },
        data: {
          status: 'EXPIRED'
        }
      });

      throw new BadRequestException('Membership invitation has expired.');
    }

    const userEmail = user.email?.trim().toLowerCase();

    if (!userEmail || userEmail !== invitation.email) {
      throw new ForbiddenException('This invitation is assigned to a different GateSync account.');
    }

    const membership = await this.prisma.$transaction(async (tx) => {
      const existingMembership = await tx.membership.findUnique({
        where: {
          organizationId_userId: {
            organizationId: invitation.organizationId,
            userId: user.id
          }
        },
        include: membershipInclude
      });
      const activeMembership =
        existingMembership?.status === 'ACTIVE' && existingMembership.deletedAt === null
          ? existingMembership
          : undefined;
      const acceptedMembership =
        activeMembership ??
        (existingMembership
          ? await tx.membership.update({
              where: {
                id: existingMembership.id
              },
              data: {
                role: invitation.role,
                status: 'ACTIVE',
                deletedAt: null,
                deletedById: null
              },
              include: membershipInclude
            })
          : await tx.membership.create({
              data: {
                organizationId: invitation.organizationId,
                userId: user.id,
                role: invitation.role,
                status: 'ACTIVE'
              },
              include: membershipInclude
            }));

      const invitationUpdate = await tx.membershipInvitation.updateMany({
        where: {
          id: invitation.id,
          status: 'PENDING'
        },
        data: {
          status: 'ACCEPTED',
          acceptedAt: now,
          acceptedById: user.id
        }
      });

      if (invitationUpdate.count !== 1) {
        throw new BadRequestException('Membership invitation is no longer active.');
      }

      await tx.auditLog.create({
        data: {
          organizationId: invitation.organizationId,
          actorUserId: user.id,
          action: 'membership.invitation.accept',
          entityType: 'MembershipInvitation',
          entityId: invitation.id,
          after: {
            email: invitation.email,
            role: acceptedMembership.role,
            status: 'ACCEPTED',
            membershipId: acceptedMembership.id,
            userId: user.id
          }
        }
      });

      return acceptedMembership;
    });

    return membership;
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

  private async assertAnotherActiveOwnerExists(
    organizationId: string,
    excludedMembershipId: string
  ) {
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

  private createInvitationCode() {
    const value = randomBytes(6).toString('hex').toUpperCase();

    return `GS-${value.slice(0, 4)}-${value.slice(4, 8)}-${value.slice(8, 12)}`;
  }

  private hashInvitationCode(code: string) {
    return createHash('sha256').update(this.normalizeInvitationCode(code)).digest('hex');
  }

  private normalizeInvitationCode(value: string) {
    const trimmedValue = value.trim();
    let code = trimmedValue;

    try {
      const url = new URL(trimmedValue);
      code =
        url.searchParams.get('inviteCode') ??
        url.searchParams.get('code') ??
        url.pathname.split('/').filter(Boolean).at(-1) ??
        trimmedValue;
    } catch {
      code = trimmedValue;
    }

    return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  }
}
