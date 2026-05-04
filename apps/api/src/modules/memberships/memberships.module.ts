import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { MembershipsController } from './memberships.controller';
import { MembershipsService } from './memberships.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [MembershipsController],
  providers: [MembershipsService]
})
export class MembershipsModule {}
