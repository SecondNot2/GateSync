import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('health')
@Controller('health')
export class AppController {
  @Get()
  getHealth() {
    return {
      service: 'gatesync-api',
      status: 'ok',
      timestamp: new Date().toISOString()
    };
  }
}
