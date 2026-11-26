import { ConsoleLogger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { ApiExceptionFilter } from './common/filters/api-exception.filter.js';
import { bodyParserErrorHandler } from './common/middleware/body-parser-error.handler.js';
import { correlationLoggingMiddleware } from './common/middleware/correlation-logging.middleware.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
    logger: new ConsoleLogger({ json: true }),
  });
  const configService = app.get(ConfigService);

  app.use(correlationLoggingMiddleware);
  app.use(helmet());
  app.use(cookieParser());
  app.use(express.json({ limit: '64kb' }));
  app.use(express.urlencoded({ extended: true, limit: '64kb' }));
  app.use(bodyParserErrorHandler);
  app.setGlobalPrefix(configService.getOrThrow<string>('apiPrefix'));
  app.enableCors({
    origin: configService.getOrThrow<string>('webOrigin'),
    credentials: true,
    exposedHeaders: ['X-Request-ID'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());

  const port = configService.getOrThrow<number>('port');
  app.enableShutdownHooks(['SIGINT', 'SIGTERM']);
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
