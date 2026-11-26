import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import {
  redactSensitiveText,
  sanitizeEndpoint,
  sanitizeMetadata,
} from '../common/sensitive-data-redactor.js';
import { ErrorEvent } from '../issues/error-event.entity.js';
import { createErrorFingerprint } from '../issues/error-fingerprint.js';
import { Issue } from '../issues/issue.entity.js';
import { IngestErrorDto } from './dto/ingest-error.dto.js';
import { AlertsService } from '../alerts/alerts.service.js';

export interface IngestedError {
  projectId: string;
  apiKeyId: string;
  dto: IngestErrorDto;
}

@Injectable()
export class ErrorEventsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly alerts: AlertsService,
  ) {}

  async ingest({ projectId, apiKeyId, dto }: IngestedError) {
    const message = redactSensitiveText(dto.message).slice(0, 2000);
    const stackTrace = dto.stackTrace
      ? redactSensitiveText(dto.stackTrace).slice(0, 16000)
      : null;
    const environment = dto.environment
      ? redactSensitiveText(dto.environment.trim()).slice(0, 100) || null
      : null;
    const release = dto.release
      ? redactSensitiveText(dto.release.trim()).slice(0, 150) || null
      : null;
    const endpoint = sanitizeEndpoint(dto.endpoint);
    const metadata = sanitizeMetadata(dto.metadata);
    const occurredAt = dto.timestamp ? new Date(dto.timestamp) : new Date();
    const fingerprint = createErrorFingerprint(message, stackTrace ?? undefined);

    return this.dataSource.transaction(async (manager) => {
      await manager.query(
        `
          INSERT INTO issues (
            id, project_id, fingerprint, title, status, severity, event_count,
            first_seen_at, last_seen_at, environments, endpoints, releases,
            assignee_user_id, resolved_at, created_at, updated_at
          )
          VALUES (
            ?, ?, ?, ?, 'open', ?, 1, ?, ?,
            IF(? IS NULL, JSON_ARRAY(), JSON_ARRAY(?)),
            IF(? IS NULL, JSON_ARRAY(), JSON_ARRAY(?)),
            IF(? IS NULL, JSON_ARRAY(), JSON_ARRAY(?)),
            NULL, NULL, NOW(6), NOW(6)
          )
          ON DUPLICATE KEY UPDATE
            event_count = event_count + 1,
            first_seen_at = LEAST(first_seen_at, ?),
            last_seen_at = GREATEST(last_seen_at, ?),
            severity = CASE ? 
              WHEN 'critical' THEN 'critical'
              WHEN 'error' THEN IF(severity = 'critical', severity, 'error')
              WHEN 'warning' THEN IF(severity IN ('critical', 'error'), severity, 'warning')
              ELSE severity
            END,
            environments = IF(
              ? IS NULL OR JSON_CONTAINS(environments, JSON_QUOTE(?)),
              environments,
              JSON_ARRAY_APPEND(environments, '$', ?)
            ),
            endpoints = IF(
              ? IS NULL OR JSON_CONTAINS(endpoints, JSON_QUOTE(?)),
              endpoints,
              JSON_ARRAY_APPEND(endpoints, '$', ?)
            ),
            releases = IF(
              ? IS NULL OR JSON_CONTAINS(releases, JSON_QUOTE(?)),
              releases,
              JSON_ARRAY_APPEND(releases, '$', ?)
            ),
            updated_at = NOW(6)
        `,
        [
          randomUUID(),
          projectId,
          fingerprint,
          message.slice(0, 512),
          dto.severity,
          occurredAt,
          occurredAt,
          environment,
          environment,
          endpoint,
          endpoint,
          release,
          release,
          occurredAt,
          occurredAt,
          dto.severity,
          environment,
          environment,
          environment,
          endpoint,
          endpoint,
          endpoint,
          release,
          release,
          release,
        ],
      );

      const issue = await manager.findOne(Issue, {
        where: { projectId, fingerprint },
        lock: { mode: 'pessimistic_write' },
      });
      if (!issue) {
        throw new Error('Issue upsert completed without a matching issue row');
      }

      const event = new ErrorEvent();
      event.id = randomUUID();
      event.projectId = projectId;
      event.issueId = issue.id;
      event.apiKeyId = apiKeyId;
      event.errorMessage = message;
      event.stackTrace = stackTrace;
      event.severity = dto.severity;
      event.environment = environment;
      event.release = release;
      event.endpoint = endpoint;
      event.occurredAt = occurredAt;
      event.metadata = metadata;
      await manager.save(ErrorEvent, event);
      const triggeredNotifications = await this.alerts.evaluateInTransaction(
        manager,
        {
          projectId,
          issueId: issue.id,
          eventId: event.id,
          severity: dto.severity,
          environment,
        },
      );

      return {
        issueId: issue.id,
        eventId: event.id,
        fingerprint,
        eventCount: issue.eventCount,
        isNewIssue: issue.eventCount === 1,
        notificationsCreated: triggeredNotifications,
      };
    });
  }
}
