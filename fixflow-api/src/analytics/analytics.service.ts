import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { OrganizationMember } from '../organizations/organization-member.entity.js';
import { DashboardFiltersDto } from './dto/dashboard-filters.dto.js';

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class AnalyticsService {
  constructor(private readonly dataSource: DataSource) {}

  async dashboard(
    organizationId: string,
    userId: string,
    filters: DashboardFiltersDto,
  ) {
    await this.requireOrganizationMember(organizationId, userId);
    if (filters.projectId) {
      await this.requireProjectMember(
        organizationId,
        filters.projectId,
        userId,
      );
    }

    const now = new Date();
    const from = filters.from
      ? new Date(filters.from)
      : new Date(now.getTime() - DAY_MS);
    const to = filters.to ? new Date(filters.to) : now;
    if (
      Number.isNaN(from.getTime()) ||
      Number.isNaN(to.getTime()) ||
      from >= to
    ) {
      throw new BadRequestException('The from date must be earlier than to');
    }
    if (to.getTime() - from.getTime() > 90 * DAY_MS) {
      throw new BadRequestException('Dashboard date range cannot exceed 90 days');
    }

    const projectFilter = filters.projectId
      ? 'AND project.id = ?'
      : 'AND project.archived_at IS NULL';
    const eventEnvironment = filters.environment
      ? 'AND LOWER(event.environment) = ?'
      : '';
    const eventParameters = [
      organizationId,
      ...(filters.projectId ? [filters.projectId] : []),
      from,
      to,
      ...(filters.environment ? [filters.environment] : []),
    ];
    const activityProjectFilter = filters.projectId
      ? 'AND (incident.project_id IS NULL OR incident.project_id = ?)'
      : '';
    const incidentProjectParameters = filters.projectId
      ? [filters.projectId]
      : [];
    const incidentBucket = to.getTime() - from.getTime() > 2 * DAY_MS
      ? 'DATE(incident.created_at)'
      : "DATE_FORMAT(incident.created_at, '%Y-%m-%d %H:00:00')";
    const resolutionEnvironmentFilter = filters.environment
      ? `AND EXISTS (
          SELECT 1
          FROM error_events filtered_event
          WHERE filtered_event.issue_id = issue.id
            AND LOWER(filtered_event.environment) = ?
        )`
      : '';
    const resolutionParameters = [
      organizationId,
      ...(filters.projectId ? [filters.projectId] : []),
      from,
      to,
      ...(filters.environment ? [filters.environment] : []),
    ];
    const deploymentEnvironment = filters.environment
      ? 'AND deployment.environment = ?'
      : '';
    const deploymentParameters = [
      organizationId,
      ...(filters.projectId ? [filters.projectId] : []),
      from,
      to,
      ...(filters.environment ? [filters.environment.toUpperCase()] : []),
    ];
    const bucket = to.getTime() - from.getTime() > 2 * DAY_MS
      ? 'DATE(event.occurred_at)'
      : "DATE_FORMAT(event.occurred_at, '%Y-%m-%d %H:00:00')";

    const [
      eventMetrics,
      issueMetrics,
      incidentMetrics,
      resolutionMetrics,
      incidentTrend,
      errorActivity,
      errorDistribution,
      topEndpoints,
      frequentIssues,
      recentEvents,
      recentIncidentActivity,
      recentDeployments,
    ] = await Promise.all([
      this.dataSource.query(
        `
          SELECT COUNT(*) AS totalErrorEvents,
                 COUNT(DISTINCT NULLIF(event.endpoint, '')) AS affectedEndpoints
          FROM error_events event
          INNER JOIN projects project ON project.id = event.project_id
          WHERE project.organization_id = ? ${projectFilter}
            AND event.occurred_at >= ? AND event.occurred_at <= ?
            ${eventEnvironment}
        `,
        eventParameters,
      ),
      this.dataSource.query(
        `
          SELECT
            COUNT(DISTINCT CASE WHEN issue.status = 'open' THEN issue.id END) AS unresolvedIssues,
            COUNT(DISTINCT CASE WHEN issue.status = 'resolved' THEN issue.id END) AS resolvedIssues,
            COUNT(DISTINCT CASE
              WHEN issue.severity = 'critical' AND issue.status = 'open'
              THEN issue.id
            END) AS criticalIssues
          FROM issues issue
          INNER JOIN projects project ON project.id = issue.project_id
          INNER JOIN error_events event ON event.issue_id = issue.id
          WHERE project.organization_id = ? ${projectFilter}
            AND event.occurred_at >= ? AND event.occurred_at <= ?
            ${eventEnvironment}
        `,
        eventParameters,
      ),
      this.dataSource.query(
        `
          SELECT
            COUNT(CASE WHEN incident.status <> 'RESOLVED' THEN 1 END) AS openIncidents,
            COUNT(CASE
              WHEN incident.severity = 'SEV1'
                AND incident.status <> 'RESOLVED'
              THEN 1
            END) AS criticalIncidents
          FROM incidents incident
          WHERE incident.organization_id = ? AND incident.deleted_at IS NULL
            ${filters.projectId ? 'AND (incident.project_id IS NULL OR incident.project_id = ?)' : ''}
        `,
        [organizationId, ...incidentProjectParameters],
      ),
      this.dataSource.query(
        `
          SELECT
            AVG(TIMESTAMPDIFF(MINUTE, issue.first_seen_at, issue.resolved_at))
              AS averageMinutes,
            COUNT(*) AS resolvedIssueCount
          FROM issues issue
          INNER JOIN projects project ON project.id = issue.project_id
          WHERE project.organization_id = ? ${projectFilter}
            AND issue.resolved_at IS NOT NULL
            AND issue.resolved_at >= ? AND issue.resolved_at <= ?
            ${resolutionEnvironmentFilter}
        `,
        resolutionParameters,
      ),
      this.dataSource.query(
        `
          SELECT ${incidentBucket} AS bucket,
                 COUNT(*) AS incidentCount,
                 SUM(CASE WHEN incident.status = 'RESOLVED' THEN 1 ELSE 0 END)
                   AS resolvedCount
          FROM incidents incident
          WHERE incident.organization_id = ?
            AND incident.deleted_at IS NULL
            AND incident.created_at >= ? AND incident.created_at <= ?
            ${activityProjectFilter}
          GROUP BY bucket
          ORDER BY bucket ASC
        `,
        [
          organizationId,
          from,
          to,
          ...incidentProjectParameters,
        ],
      ),
      this.dataSource.query(
        `
          SELECT ${bucket} AS bucket, COUNT(*) AS eventCount
          FROM error_events event
          INNER JOIN projects project ON project.id = event.project_id
          WHERE project.organization_id = ? ${projectFilter}
            AND event.occurred_at >= ? AND event.occurred_at <= ?
            ${eventEnvironment}
          GROUP BY bucket
          ORDER BY bucket ASC
        `,
        eventParameters,
      ),
      this.dataSource.query(
        `
          SELECT event.severity, COUNT(*) AS eventCount
          FROM error_events event
          INNER JOIN projects project ON project.id = event.project_id
          WHERE project.organization_id = ? ${projectFilter}
            AND event.occurred_at >= ? AND event.occurred_at <= ?
            ${eventEnvironment}
          GROUP BY event.severity
          ORDER BY eventCount DESC
        `,
        eventParameters,
      ),
      this.dataSource.query(
        `
          SELECT event.endpoint, COUNT(*) AS eventCount
          FROM error_events event
          INNER JOIN projects project ON project.id = event.project_id
          WHERE project.organization_id = ? ${projectFilter}
            AND event.occurred_at >= ? AND event.occurred_at <= ?
            ${eventEnvironment}
            AND event.endpoint IS NOT NULL AND event.endpoint <> ''
          GROUP BY event.endpoint
          ORDER BY eventCount DESC, event.endpoint ASC
          LIMIT 10
        `,
        eventParameters,
      ),
      this.dataSource.query(
        `
          SELECT issue.id, issue.project_id AS projectId, issue.title,
                 issue.status, issue.severity,
                 COUNT(event.id) AS eventCount,
                 MAX(event.occurred_at) AS lastSeenAt
          FROM issues issue
          INNER JOIN projects project ON project.id = issue.project_id
          INNER JOIN error_events event ON event.issue_id = issue.id
          WHERE project.organization_id = ? ${projectFilter}
            AND event.occurred_at >= ? AND event.occurred_at <= ?
            ${eventEnvironment}
          GROUP BY issue.id, issue.project_id, issue.title,
                   issue.status, issue.severity
          ORDER BY eventCount DESC, lastSeenAt DESC
          LIMIT 10
        `,
        eventParameters,
      ),
      this.dataSource.query(
        `
          SELECT event.id, event.issue_id AS issueId,
                 event.project_id AS projectId, issue.title AS issueTitle,
                 event.error_message AS errorMessage, event.severity,
                 event.environment, event.release, event.endpoint,
                 event.occurred_at AS occurredAt
          FROM error_events event
          INNER JOIN projects project ON project.id = event.project_id
          INNER JOIN issues issue ON issue.id = event.issue_id
          WHERE project.organization_id = ? ${projectFilter}
            AND event.occurred_at >= ? AND event.occurred_at <= ?
            ${eventEnvironment}
          ORDER BY event.occurred_at DESC, event.id DESC
          LIMIT 10
        `,
        eventParameters,
      ),
      this.dataSource.query(
        `
          SELECT timeline.id, timeline.incident_id AS incidentId,
                 incident.title AS incidentTitle,
                 incident.project_id AS projectId,
                 timeline.actor_user_id AS actorUserId,
                 timeline.action, timeline.details,
                 timeline.created_at AS createdAt
          FROM incident_timeline timeline
          INNER JOIN incidents incident ON incident.id = timeline.incident_id
          WHERE incident.organization_id = ?
            AND incident.deleted_at IS NULL
            AND timeline.created_at >= ? AND timeline.created_at <= ?
            ${activityProjectFilter}
          ORDER BY timeline.created_at DESC, timeline.id DESC
          LIMIT 10
        `,
        [
          organizationId,
          from,
          to,
          ...incidentProjectParameters,
        ],
      ),
      this.dataSource.query(
        `
          SELECT deployment.id, deployment.project_id AS projectId,
                 deployment.environment, deployment.release,
                 deployment.status, deployment.deployed_at AS deployedAt,
                 deployment.commit_hash AS commitHash
          FROM deployments deployment
          INNER JOIN projects project ON project.id = deployment.project_id
          WHERE project.organization_id = ? ${projectFilter}
            AND deployment.deleted_at IS NULL
            AND deployment.deployed_at >= ? AND deployment.deployed_at <= ?
            ${deploymentEnvironment}
          ORDER BY deployment.deployed_at DESC, deployment.id DESC
          LIMIT 5
        `,
        deploymentParameters,
      ),
    ]);

    const events = eventMetrics[0] as {
      totalErrorEvents: number | string | null;
      affectedEndpoints: number | string | null;
    };
    const issues = issueMetrics[0] as {
      unresolvedIssues: number | string | null;
      resolvedIssues: number | string | null;
      criticalIssues: number | string | null;
    };
    const incidents = incidentMetrics[0] as {
      openIncidents: number | string | null;
      criticalIncidents: number | string | null;
    };
    const resolution = resolutionMetrics[0] as {
      averageMinutes: number | string | null;
      resolvedIssueCount: number | string | null;
    };

    return {
      filters: {
        organizationId,
        projectId: filters.projectId ?? null,
        environment: filters.environment ?? null,
        from,
        to,
      },
      metrics: {
        totalErrorEvents: numberValue(events.totalErrorEvents),
        unresolvedIssues: numberValue(issues.unresolvedIssues),
        resolvedIssues: numberValue(issues.resolvedIssues),
        criticalIssues: numberValue(issues.criticalIssues),
        openIncidents: numberValue(incidents.openIncidents),
        criticalIncidents: numberValue(incidents.criticalIncidents),
        affectedEndpoints: numberValue(events.affectedEndpoints),
      },
      resolutionTime: {
        averageMinutes:
          resolution.averageMinutes === null
            ? null
            : Number(Number(resolution.averageMinutes).toFixed(2)),
        resolvedIssueCount: numberValue(resolution.resolvedIssueCount),
      },
      incidentTrend: incidentTrend.map(
        (row: {
          bucket: string;
          incidentCount: number | string;
          resolvedCount: number | string;
        }) => ({
          bucket: row.bucket,
          incidentCount: numberValue(row.incidentCount),
          resolvedCount: numberValue(row.resolvedCount),
        }),
      ),
      errorActivity: errorActivity.map(
        (row: { bucket: string; eventCount: number | string }) => ({
          bucket: row.bucket,
          eventCount: numberValue(row.eventCount),
        }),
      ),
      errorDistribution: errorDistribution.map(
        (row: { severity: string; eventCount: number | string }) => ({
          severity: row.severity,
          eventCount: numberValue(row.eventCount),
        }),
      ),
      topEndpoints: topEndpoints.map(
        (row: { endpoint: string; eventCount: number | string }) => ({
          endpoint: row.endpoint,
          eventCount: numberValue(row.eventCount),
        }),
      ),
      mostFrequentIssues: frequentIssues.map(
        (row: Record<string, unknown> & { eventCount: number | string }) => ({
          ...row,
          eventCount: numberValue(row.eventCount),
        }),
      ),
      recentErrorEvents: recentEvents,
      recentIncidentActivity,
      recentDeployments,
    };
  }

  private async requireOrganizationMember(
    organizationId: string,
    userId: string,
  ): Promise<void> {
    const member = await this.dataSource
      .getRepository(OrganizationMember)
      .createQueryBuilder('membership')
      .innerJoin(
        'organizations',
        'organization',
        'organization.id = membership.organizationId AND organization.deleted_at IS NULL',
      )
      .where('membership.organizationId = :organizationId', { organizationId })
      .andWhere('membership.userId = :userId', { userId })
      .getOne();
    if (!member) throw new NotFoundException('Organization not found');
  }

  private async requireProjectMember(
    organizationId: string,
    projectId: string,
    userId: string,
  ): Promise<void> {
    const rows = (await this.dataSource.query(
      `
        SELECT project.id
        FROM projects project
        INNER JOIN organization_members membership
          ON membership.organization_id = project.organization_id
        INNER JOIN organizations organization
          ON organization.id = project.organization_id
        WHERE project.id = ? AND project.organization_id = ?
          AND project.archived_at IS NULL
          AND organization.deleted_at IS NULL
          AND membership.user_id = ?
        LIMIT 1
      `,
      [projectId, organizationId, userId],
    )) as { id: string }[];
    if (!rows[0]) throw new NotFoundException('Project not found');
  }
}

function numberValue(value: number | string | null | undefined): number {
  return Number(value ?? 0);
}
