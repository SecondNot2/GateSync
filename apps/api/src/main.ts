import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { setupApp } from './app.setup';

async function bootstrap() {
  console.log('🚀 GateSync API is starting...');
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  
  // Render cung cấp biến PORT, chúng ta nên ưu tiên dùng nó
  const port = configService.get<number>('PORT') || configService.get<number>('API_PORT') || 4000;

  setupApp(app);

  await app.listen(port);
  console.log(`✅ GateSync API is running on port ${port}`);
}

void bootstrap();
