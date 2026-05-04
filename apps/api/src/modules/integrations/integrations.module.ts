import { Module } from '@nestjs/common';
import { CuaKhauSoModule } from './cua-khau-so/cua-khau-so.module';

@Module({
  imports: [CuaKhauSoModule]
})
export class IntegrationsModule {}
