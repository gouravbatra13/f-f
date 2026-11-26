import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { ApiKeysModule } from '../api-keys/api-keys.module.js';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ErrorEvent } from '../issues/error-event.entity.js';
import { Issue } from '../issues/issue.entity.js';
import { ErrorEventsController } from './error-events.controller.js';
import { ErrorEventsService } from './error-events.service.js';
import { AlertsModule } from '../alerts/alerts.module.js';

@Module({
  imports: [
    ApiKeysModule,
    AlertsModule,
    TypeOrmModule.forFeature([Issue, ErrorEvent]),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
  ],
  controllers: [ErrorEventsController],
  providers: [ErrorEventsService],
})
export class ErrorEventsModule {}
