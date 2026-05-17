import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthService } from './auth.service';
import { MeController } from './me.controller';
import { OrganizationMembershipGuard } from './organization-membership.guard';
import { OrganizationPermissionsGuard } from './organization-permissions.guard';
import { OrganizationRolesGuard } from './organization-roles.guard';
import { PermissionsService } from './permissions.service';
import { SupabaseJwtGuard } from './supabase-jwt.guard';
import { SupabaseJwtVerifier } from './supabase-jwt.verifier';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [MeController],
  providers: [
    AuthService,
    SupabaseJwtVerifier,
    SupabaseJwtGuard,
    PermissionsService,
    OrganizationMembershipGuard,
    OrganizationPermissionsGuard,
    OrganizationRolesGuard
  ],
  exports: [
    AuthService,
    SupabaseJwtVerifier,
    SupabaseJwtGuard,
    PermissionsService,
    OrganizationMembershipGuard,
    OrganizationPermissionsGuard,
    OrganizationRolesGuard
  ]
})
export class AuthModule {}
