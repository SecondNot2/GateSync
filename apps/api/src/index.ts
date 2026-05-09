import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from './app.module';
import { setupApp } from './app.setup';
import express from 'express';
import type { Request, Response } from 'express';

const server = express();

export const createServer = async (expressInstance: express.Express): Promise<INestApplication> => {
  const app = await NestFactory.create(
    AppModule,
    new ExpressAdapter(expressInstance),
  );
  setupApp(app);
  await app.init();
  return app;
};

let cachedApp: INestApplication;

export default async (req: Request, res: Response) => {
  if (!cachedApp) {
    cachedApp = await createServer(server);
  }
  server(req, res);
};
