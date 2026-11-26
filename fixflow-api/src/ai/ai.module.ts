import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { UsersModule } from '../users/users.module.js';
import { AiController } from './ai.controller.js';
import { AiAnalysisWorker } from './ai-analysis.worker.js';
import { AiInvestigation } from './ai-investigation.entity.js';
import { AI_ANALYSIS_QUEUE } from './ai-job.types.js';
import { AiJobQueueService } from './ai-job-queue.service.js';
import { AiService } from './ai.service.js';

const queueEnabled = process.env.QUEUE_ENABLED === 'true';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    ...(queueEnabled
      ? [BullModule.registerQueue({ name: AI_ANALYSIS_QUEUE })]
      : []),
    TypeOrmModule.forFeature([AiInvestigation]),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 30 }]),
  ],
  controllers: [AiController],
  providers: [
    AiService,
    AiJobQueueService,
    JwtAuthGuard,
    ...(queueEnabled ? [AiAnalysisWorker] : []),
  ],
  exports: [AiJobQueueService],
})
export class AiModule {}
