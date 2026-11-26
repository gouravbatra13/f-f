import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { HealthModule } from './health/health.module.js';
import { AuthModule } from './auth/auth.module.js';
import { OrganizationsModule } from './organizations/organizations.module.js';
import { ProjectsModule } from './projects/projects.module.js';
import { ApiKeysModule } from './api-keys/api-keys.module.js';
import { ErrorEventsModule } from './error-events/error-events.module.js';
import { IssuesModule } from './issues/issues.module.js';
import { IncidentsModule } from './incidents/incidents.module.js';
import { DeploymentsModule } from './deployments/deployments.module.js';
import { AlertsModule } from './alerts/alerts.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { AnalyticsModule } from './analytics/analytics.module.js';
import { AiModule } from './ai/ai.module.js';
import { MonitoringModule } from './monitoring/monitoring.module.js';
import configuration from './config/configuration.js';
import { createNestTypeOrmOptions } from './database/typeorm-options.js';
import type { DatabaseConfig } from './config/database.config.js';
import type { QueueConfig } from './config/queue.config.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    ...(process.env.QUEUE_ENABLED === 'true'
      ? [
          BullModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (configService: ConfigService) => {
              const queue =
                configService.getOrThrow<QueueConfig>('queue');
              return {
                connection: {
                  host: queue.host,
                  port: queue.port,
                  db: queue.database,
                  maxRetriesPerRequest: null,
                  ...(queue.password ? { password: queue.password } : {}),
                },
              };
            },
          }),
        ]
      : []),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        createNestTypeOrmOptions(
          configService.getOrThrow<DatabaseConfig>('database'),
        ),
    }),
    HealthModule,
    MonitoringModule,
    AuthModule,
    OrganizationsModule,
    ProjectsModule,
    ApiKeysModule,
    ErrorEventsModule,
    IssuesModule,
    IncidentsModule,
    DeploymentsModule,
    AlertsModule,
    NotificationsModule,
    AnalyticsModule,
    AiModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
