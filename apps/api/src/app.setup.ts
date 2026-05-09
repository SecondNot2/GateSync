import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function setupApp(app: INestApplication) {
  const configService = app.get(ConfigService);
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');

  app.setGlobalPrefix('api/v1');
  
  const webOrigin = configService.get<string>('WEB_ORIGIN', 'http://localhost:3000');
  const allowedOrigins = webOrigin.split(',').map(o => o.trim());
  
  // Allow the specific Vercel origin to support testing production frontend with local API
  if (!allowedOrigins.includes('https://gatesync-202.vercel.app')) {
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
  
  return app;
}
