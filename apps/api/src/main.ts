import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/errors';
import { config } from './config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  app.use(helmet());
  app.use(cookieParser());
  app.useGlobalFilters(new AllExceptionsFilter());
  // The web app calls the API on the same origin (Vite proxy in dev, Vercel rewrite in production);
  // CORS is only opened for APP_URL as a fallback.
  app.enableCors({
    origin: config.appUrl,
    credentials: true,
    exposedHeaders: ['x-user-role', 'x-user-id'],
  });
  app.enableShutdownHooks();
  await app.listen(config.port);
  Logger.log(`API ready on http://localhost:${config.port}/api/v1`, 'Bootstrap');
}

bootstrap();
