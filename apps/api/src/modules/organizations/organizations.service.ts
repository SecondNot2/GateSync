import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Membership, Organization, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestUser } from '../auth/request-user';
import type { CreateOrganizationDto } from './dto/create-organization.dto';

type CurrentUserMembership = Pick<Membership, 'id' | 'organizationId' | 'role' | 'status'>;
type OrganizationResponse = Organization & {
  currentUserMembership: CurrentUserMembership;
};

@Injectable()
export class OrganizationsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listForUser(user: RequestUser): Promise<OrganizationResponse[]> {
    const organizations = await this.prisma.organization.findMany({
      where: {
        deletedAt: null,
        memberships: {
          some: {
            userId: user.id,
            deletedAt: null
          }
        }
      },
      include: {
        memberships: {
          where: {
            userId: user.id,
            deletedAt: null
          },
          select: {
            id: true,
            organizationId: true,
            role: true,
            status: true
          },
          take: 1
        }
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    return organizations.map((organization) => this.toOrganizationResponse(organization));
  }

  async create(user: RequestUser, dto: CreateOrganizationDto): Promise<OrganizationResponse> {
    return this.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: this.toCreateData(dto)
      });
      const membership = await tx.membership.create({
        data: {
          organizationId: organization.id,
          userId: user.id,
          role: 'OWNER',
          status: 'ACTIVE'
        },
        select: {
          id: true,
          organizationId: true,
          role: true,
          status: true
        }
      });

      await tx.auditLog.create({
        data: {
          organizationId: organization.id,
          actorUserId: user.id,
          action: 'organization.create',
          entityType: 'Organization',
          entityId: organization.id,
          after: {
            name: organization.name,
            type: organization.type,
            taxCode: organization.taxCode,
            email: organization.email,
            phone: organization.phone,
            address: organization.address
          }
        }
      });

      return {
        ...organization,
        currentUserMembership: membership
      };
    });
  }

  async getById(user: RequestUser, organizationId: string): Promise<OrganizationResponse> {
    const organization = await this.prisma.organization.findFirst({
      where: {
        id: organizationId,
        deletedAt: null
      },
      include: {
        memberships: {
          where: {
            userId: user.id,
            deletedAt: null
          },
          select: {
            id: true,
            organizationId: true,
            role: true,
            status: true
          },
          take: 1
        }
      }
    });

    if (!organization) {
      throw new NotFoundException('Organization was not found.');
    }

    return this.toOrganizationResponse(organization);
  }

  private toCreateData(dto: CreateOrganizationDto): Prisma.OrganizationCreateInput {
    const data: Prisma.OrganizationCreateInput = {
      name: dto.name,
      type: dto.type ?? 'LOGISTICS_COMPANY'
    };

    if (dto.taxCode) {
      data.taxCode = dto.taxCode;
    }

    if (dto.phone) {
      data.phone = dto.phone;
    }

    if (dto.email) {
      data.email = dto.email;
    }

    if (dto.address) {
      data.address = dto.address;
    }

    return data;
  }

  private toOrganizationResponse(
    organization: Organization & {
      memberships: CurrentUserMembership[];
    }
  ): OrganizationResponse {
    const currentUserMembership = organization.memberships[0];

    if (!currentUserMembership) {
      throw new NotFoundException('Organization was not found.');
    }

    const { memberships: _memberships, ...organizationData } = organization;

    return {
      ...organizationData,
      currentUserMembership
    };
  }
}
