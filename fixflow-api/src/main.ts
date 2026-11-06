import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module.js';
import { ApiExceptionFilter } from './common/filters/api-exception.filter.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  app.setGlobalPrefix(configService.getOrThrow<string>('apiPrefix'));
  app.enableCors({
    origin: configService.getOrThrow<string>('webOrigin'),
    credentials: true,
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
  await app.listen(port);

  console.log(
    `FixFlow API is running at http://localhost:${port}/${configService.getOrThrow<string>('apiPrefix')}`,
  );
}

void bootstrap();