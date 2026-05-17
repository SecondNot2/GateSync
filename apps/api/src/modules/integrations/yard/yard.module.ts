import { Module } from '@nestjs/common';

import { YardMapper } from './yard.mapper';

@Module({
  providers: [YardMapper],
  exports: [YardMapper]
})
export class YardModule {}
