import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const port = configService.get<number>('API_PORT', 4000);
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');

  app.setGlobalPrefix('api/v1');
  const webOrigin = configService.get<string>('WEB_ORIGIN', 'http://localhost:3000');
  const allowedOrigins = webOrigin.split(',').map(o => o.trim());
  
  // Always allow the specific Vercel origin for production
  if (nodeEnv === 'production' && !allowedOrigins.includes('https://gatesync-202.vercel.app')) {
    allowedOrigins.push('https://gatesync-202.vercel.app');
  }

  app.enableCors({
    origin: allowedOrigins,
    credentials: true
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true
    })
  );

  if (nodeEnv !== 'production') {
    const documentConfig = new DocumentBuilder()
      .setTitle('GateSync API')
      .setDescription('REST API for GateSync border logistics operations')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, documentConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  await app.listen(port);
}

void bootstrap();
