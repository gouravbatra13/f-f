import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AiModule } from '../ai/ai.module.js';
import { HttpMetricsInterceptor } from './http-metrics.interceptor.js';
import { MetricsController } from './metrics.controller.js';
import { MetricsService } from './metrics.service.js';

@Module({
  imports: [AiModule],
  controllers: [MetricsController],
  providers: [
    MetricsService,
    HttpMetricsInterceptor,
    { provide: APP_INTERCEPTOR, useExisting: HttpMetricsInterceptor },
  ],
  exports: [MetricsService],
})
export class MonitoringModule {}
