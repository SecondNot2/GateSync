import { Global, Module } from '@nestjs/common';
import { IntegrationSyncQueueService } from './integration-sync-queue.service';

@Global()
@Module({
  providers: [IntegrationSyncQueueService],
  exports: [IntegrationSyncQueueService]
})
export class IntegrationSyncQueueModule {}
