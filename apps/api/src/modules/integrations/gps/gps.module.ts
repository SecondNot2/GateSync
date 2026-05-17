import { Module } from '@nestjs/common';

import { GpsMapper } from './gps.mapper';

@Module({
  providers: [GpsMapper],
  exports: [GpsMapper]
})
export class GpsModule {}
