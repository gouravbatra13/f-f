import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager, IsNull, Repository } from 'typeorm';
import { redactSensitiveText, sanitizeMetadata } from '../common/sensitive-data-redactor.js';
import { OrganizationRole } from '../organizations/organization-role.enum.js';
import { CreateDeploymentDto } from './dto/create-deployment.dto.js';
import { DeploymentImpactDto } from './dto/deployment-impact.dto.js';
import { ListDeploymentsDto } from './dto/list-deployments.dto.js';
import { UpdateDeploymentDto } from './dto/update-deployment.dto.js';
import { compareErrorRates } from './compare-error-rates.js';
import { Deployment } from './deployment.entity.js';
import { DeploymentStatus } from './deployment-status.enum.js';

interface ProjectRoleRow {
  id: string;
  role: OrganizationRole;
}

interface ComparisonAggregate {
  beforeCount: number | string | null;
  afterCount: number | string | null;
  beforeIssueCount: number | string | null;
  afterIssueCount: number | string | null;
  beforeCritical: number | string | null;
  beforeError: number | string | null;
  beforeWarning: number | string | null;
  beforeInfo: number | string | null;
  afterCritical: number | string | null;
  afterError: number | string | null;
  afterWarning: number | string | null;
  afterInfo: number | string | null;
  newFingerprintCount: number | string | null;
}

interface FingerprintFinding {
  fingerprint: string;
  title: string;
  severity: string;
  firstSeenAt: Date;
  eventCount: number | string;
}

@Injectable()
export class DeploymentsService {
  constructor(
    @InjectRepository(Deployment)
    private readonly deployments: Repository<Deployment>,
    private readonly dataSource: DataSource,
  ) {}

  async create(
    projectId: string,
    userId: string,
    dto: CreateDeploymentDto,
  ) {
    return this.dataSource.transaction(async (manager) => {
      await this.lockProjectForMember(manager, projectId, userId);
      const deployment = new Deployment();
      deployment.id = randomUUID();
      deployment.projectId = projectId;
      deployment.environment = dto.environment;
      deployment.release = this.sanitizeRequiredText(dto.release, 150);
      deployment.status = dto.status ?? DeploymentStatus.PENDING;
      deployment.deployedAt = dto.deployedAt
        ? new Date(dto.deployedAt)
        : new Date();
      deployment.commitHash = dto.commitHash?.toLowerCase() ?? null;
      deployment.metadata = sanitizeMetadata(dto.metadata ?? undefined);
      deployment.deletedAt = null;
      await manager.save(Deployment, deployment);
      return deployment;
    });
  }

  async list(
    projectId: string,
    userId: string,
    filters: ListDeploymentsDto,
  ) {
    await this.requireProjectMember(projectId, userId);
    const query = this.deployments
      .createQueryBuilder('deployment')
      .where('deployment.projectId = :projectId', { projectId })
      .andWhere('deployment.deletedAt IS NULL');

    if (filters.environment) {
      query.andWhere('deployment.environment = :environment', filters);
    }
    if (filters.status) query.andWhere('deployment.status = :status', filters);
    if (filters.search?.trim()) {
      query.andWhere(
        'deployment.release LIKE :search ESCAPE \'!\'',
        { search: `%${escapeLike(filters.search.trim())}%` },
      );
    }

    const [data, total] = await query
      .orderBy('deployment.deployedAt', 'DESC')
      .addOrderBy('deployment.id', 'DESC')
      .skip((filters.page - 1) * filters.limit)
      .take(filters.limit)
      .getManyAndCount();

    return {
      data,
      pagination: {
        page: filters.page,
        limit: filters.limit,
        total,
        totalPages: Math.ceil(total / filters.limit),
      },
    };
  }

  async getById(projectId: string, deploymentId: string, userId: string) {
    await this.requireProjectMember(projectId, userId);
    return this.findDeployment(projectId, deploymentId);
  }

  async update(
    projectId: string,
    deploymentId: string,
    userId: string,
    dto: UpdateDeploymentDto,
  ) {
    if (!Object.values(dto).some((value) => value !== undefined)) {
      throw new BadRequestException('At least one field must be provided');
    }
    return this.dataSource.transaction(async (manager) => {
      await this.lockProjectForMember(manager, projectId, userId);
      const deployment = await manager.findOne(Deployment, {
        where: { id: deploymentId, projectId, deletedAt: IsNull() },
        lock: { mode: 'pessimistic_write' },
      });
      if (!deployment) throw new NotFoundException('Deployment not found');
      if (dto.environment !== undefined) {
        deployment.environment = dto.environment;
      }
      if (dto.release !== undefined) {
        deployment.release = this.sanitizeRequiredText(dto.release, 150);
      }
      if (dto.status !== undefined) deployment.status = dto.status;
      if (dto.deployedAt !== undefined) {
        deployment.deployedAt = new Date(dto.deployedAt);
      }
      if (dto.commitHash !== undefined) {
        deployment.commitHash = dto.commitHash?.toLowerCase() ?? null;
      }
      if (dto.metadata !== undefined) {
        deployment.metadata = sanitizeMetadata(dto.metadata ?? undefined);
      }
      return manager.save(Deployment, deployment);
    });
  }

  async archive(projectId: string, deploymentId: string, userId: string) {
    return this.dataSource.transaction(async (manager) => {
      await this.lockProjectForMember(manager, projectId, userId);
      const deployment = await manager.findOne(Deployment, {
        where: { id: deploymentId, projectId, deletedAt: IsNull() },
        lock: { mode: 'pessimistic_write' },
      });
      if (!deployment) throw new NotFoundException('Deployment not found');
      deployment.deletedAt = new Date();
      await manager.save(Deployment, deployment);
      return { archived: true };
    });
  }

  async compareImpact(
    projectId: string,
    deploymentId: string,
    userId: string,
    options: DeploymentImpactDto,
  ) {
    await this.requireProjectMember(projectId, userId);
    const deployment = await this.findDeployment(projectId, deploymentId);
    const windowMs = options.windowMinutes * 60_000;
    const deploymentAt = new Date(deployment.deployedAt);
    const beforeStart = new Date(deploymentAt.getTime() - windowMs);
    const expectedAfterEnd = new Date(deploymentAt.getTime() + windowMs);
    const now = new Date();
    const afterWindowStatus =
      now < deploymentAt
        ? 'not_started'
        : now < expectedAfterEnd
          ? 'in_progress'
          : 'complete';
    const observedAfterEnd =
      now < deploymentAt
        ? deploymentAt
        : now < expectedAfterEnd
          ? now
          : expectedAfterEnd;
    const afterDurationMinutes = Math.max(
      0,
      (observedAfterEnd.getTime() - deploymentAt.getTime()) / 60_000,
    );
    const environment = deployment.environment.toLowerCase();
    const [aggregateRows, newFindings, recurringFindings] = await Promise.all([
      this.dataSource.query(
        `
          SELECT
            COUNT(CASE WHEN e.occurred_at >= ? AND e.occurred_at < ? THEN 1 END) AS beforeCount,
            COUNT(CASE WHEN e.occurred_at >= ? AND e.occurred_at < ? THEN 1 END) AS afterCount,
            COUNT(DISTINCT CASE WHEN e.occurred_at >= ? AND e.occurred_at < ? THEN e.issue_id END) AS beforeIssueCount,
            COUNT(DISTINCT CASE WHEN e.occurred_at >= ? AND e.occurred_at < ? THEN e.issue_id END) AS afterIssueCount,
            SUM(CASE WHEN e.occurred_at >= ? AND e.occurred_at < ? AND e.severity = 'critical' THEN 1 ELSE 0 END) AS beforeCritical,
            SUM(CASE WHEN e.occurred_at >= ? AND e.occurred_at < ? AND e.severity = 'error' THEN 1 ELSE 0 END) AS beforeError,
            SUM(CASE WHEN e.occurred_at >= ? AND e.occurred_at < ? AND e.severity = 'warning' THEN 1 ELSE 0 END) AS beforeWarning,
            SUM(CASE WHEN e.occurred_at >= ? AND e.occurred_at < ? AND e.severity = 'info' THEN 1 ELSE 0 END) AS beforeInfo,
            SUM(CASE WHEN e.occurred_at >= ? AND e.occurred_at < ? AND e.severity = 'critical' THEN 1 ELSE 0 END) AS afterCritical,
            SUM(CASE WHEN e.occurred_at >= ? AND e.occurred_at < ? AND e.severity = 'error' THEN 1 ELSE 0 END) AS afterError,
            SUM(CASE WHEN e.occurred_at >= ? AND e.occurred_at < ? AND e.severity = 'warning' THEN 1 ELSE 0 END) AS afterWarning,
            SUM(CASE WHEN e.occurred_at >= ? AND e.occurred_at < ? AND e.severity = 'info' THEN 1 ELSE 0 END) AS afterInfo,
            COUNT(DISTINCT CASE
              WHEN e.occurred_at >= ? AND e.occurred_at < ?
                AND issue.first_seen_at >= ? AND issue.first_seen_at < ?
              THEN issue.fingerprint
            END) AS newFingerprintCount
          FROM error_events e
          INNER JOIN issues issue ON issue.id = e.issue_id
          WHERE e.project_id = ? AND LOWER(e.environment) = ?
            AND e.occurred_at >= ? AND e.occurred_at < ?
        `,
        [
          beforeStart, deploymentAt,
          deploymentAt, observedAfterEnd,
          beforeStart, deploymentAt,
          deploymentAt, observedAfterEnd,
          beforeStart, deploymentAt,
          beforeStart, deploymentAt,
          beforeStart, deploymentAt,
          beforeStart, deploymentAt,
          deploymentAt, observedAfterEnd,
          deploymentAt, observedAfterEnd,
          deploymentAt, observedAfterEnd,
          deploymentAt, observedAfterEnd,
          deploymentAt, observedAfterEnd,
          deploymentAt, observedAfterEnd,
          projectId,
          environment,
          beforeStart,
          observedAfterEnd,
        ],
      ),
      this.findFingerprintFindings(
        projectId,
        environment,
        deploymentAt,
        observedAfterEnd,
        true,
      ),
      this.findFingerprintFindings(
        projectId,
        environment,
        deploymentAt,
        observedAfterEnd,
        false,
      ),
    ]);

    const row = (aggregateRows as ComparisonAggregate[])[0];
    const beforeCount = numberValue(row?.beforeCount);
    const afterCount = numberValue(row?.afterCount);
    const comparison = compareErrorRates(
      beforeCount,
      afterCount,
      options.windowMinutes,
      afterDurationMinutes,
    );

    return {
      deployment,
      environment: deployment.environment,
      windowMinutes: options.windowMinutes,
      afterWindowStatus,
      before: {
        from: beforeStart,
        to: deploymentAt,
        eventCount: beforeCount,
        issueCount: numberValue(row?.beforeIssueCount),
        severityDistribution: {
          critical: numberValue(row?.beforeCritical),
          error: numberValue(row?.beforeError),
          warning: numberValue(row?.beforeWarning),
          info: numberValue(row?.beforeInfo),
        },
        eventsPerMinute: comparison.beforeRatePerMinute,
      },
      after: {
        from: deploymentAt,
        to: observedAfterEnd,
        expectedTo: expectedAfterEnd,
        observedMinutes: Number(afterDurationMinutes.toFixed(2)),
        eventCount: afterCount,
        issueCount: numberValue(row?.afterIssueCount),
        severityDistribution: {
          critical: numberValue(row?.afterCritical),
          error: numberValue(row?.afterError),
          warning: numberValue(row?.afterWarning),
          info: numberValue(row?.afterInfo),
        },
        eventsPerMinute: comparison.afterRatePerMinute,
      },
      countChange: comparison.countChange,
      percentageChange: comparison.percentageChange,
      percentageChangeBasis: 'events_per_minute',
      newFingerprintCount: numberValue(row?.newFingerprintCount),
      newlyIntroducedFingerprints: newFindings.map(toFinding),
      recurringFingerprints: recurringFindings.map(toFinding),
      findingsTruncated:
        numberValue(row?.newFingerprintCount) > newFindings.length ||
        numberValue(row?.afterIssueCount) -
          numberValue(row?.newFingerprintCount) >
          recurringFindings.length,
      possibleRegression: comparison.possibleRegression,
      interpretation: comparison.possibleRegression
        ? 'The observed post-deployment error rate is higher. This is a possible correlation, not evidence that the deployment caused the errors.'
        : afterDurationMinutes === 0
          ? 'No post-deployment observation window is available yet.'
          : 'No higher post-deployment error rate was observed in this window; this does not prove the deployment had no impact.',
    };
  }

  private async findFingerprintFindings(
    projectId: string,
    environment: string,
    deploymentAt: Date,
    afterEnd: Date,
    introduced: boolean,
  ): Promise<FingerprintFinding[]> {
    if (afterEnd <= deploymentAt) return [];
    const firstSeenCondition = introduced
      ? 'issue.first_seen_at >= ? AND issue.first_seen_at < ?'
      : 'issue.first_seen_at < ?';
    const parameters = introduced
      ? [projectId, environment, deploymentAt, afterEnd, deploymentAt, afterEnd]
      : [projectId, environment, deploymentAt, afterEnd, deploymentAt];
    return this.dataSource.query(
      `
        SELECT issue.fingerprint, issue.title, issue.severity,
               issue.first_seen_at AS firstSeenAt,
               COUNT(*) AS eventCount
        FROM error_events event
        INNER JOIN issues issue ON issue.id = event.issue_id
        WHERE event.project_id = ? AND LOWER(event.environment) = ?
          AND event.occurred_at >= ? AND event.occurred_at < ?
          AND ${firstSeenCondition}
        GROUP BY issue.id, issue.fingerprint, issue.title,
                 issue.severity, issue.first_seen_at
        ORDER BY eventCount DESC, issue.fingerprint ASC
        LIMIT 50
      `,
      parameters,
    ) as Promise<FingerprintFinding[]>;
  }

  private async findDeployment(
    projectId: string,
    deploymentId: string,
  ): Promise<Deployment> {
    const deployment = await this.deployments.findOne({
      where: { id: deploymentId, projectId, deletedAt: IsNull() },
    });
    if (!deployment) throw new NotFoundException('Deployment not found');
    return deployment;
  }

  private async requireProjectMember(
    projectId: string,
    userId: string,
  ): Promise<void> {
    const rows = (await this.dataSource.query(
      `
        SELECT project.id
        FROM projects project
        INNER JOIN organizations organization
          ON organization.id = project.organization_id
        INNER JOIN organization_members membership
          ON membership.organization_id = project.organization_id
        WHERE project.id = ? AND project.archived_at IS NULL
          AND organization.deleted_at IS NULL AND membership.user_id = ?
        LIMIT 1
      `,
      [projectId, userId],
    )) as { id: string }[];
    if (!rows[0]) throw new NotFoundException('Project not found');
  }

  private async lockProjectForMember(
    manager: EntityManager,
    projectId: string,
    userId: string,
  ): Promise<OrganizationRole> {
    const rows = (await manager.query(
      `
        SELECT project.id, membership.role AS role
        FROM projects project
        INNER JOIN organizations organization
          ON organization.id = project.organization_id
        INNER JOIN organization_members membership
          ON membership.organization_id = project.organization_id
        WHERE project.id = ? AND project.archived_at IS NULL
          AND organization.deleted_at IS NULL AND membership.user_id = ?
        FOR UPDATE
      `,
      [projectId, userId],
    )) as ProjectRoleRow[];
    if (!rows[0]) throw new NotFoundException('Project not found');
    if (rows[0].role === OrganizationRole.VIEWER) {
      throw new ForbiddenException('Viewers cannot modify deployments');
    }
    return rows[0].role;
  }

  private sanitizeRequiredText(value: string, maxLength: number): string {
    const sanitized = redactSensitiveText(value.trim()).slice(0, maxLength);
    if (!sanitized) throw new BadRequestException('Release cannot be empty');
    return sanitized;
  }
}

function numberValue(value: number | string | null | undefined): number {
  return Number(value ?? 0);
}

function toFinding(finding: FingerprintFinding) {
  return {
    fingerprint: finding.fingerprint,
    title: finding.title,
    severity: finding.severity,
    firstSeenAt: finding.firstSeenAt,
    eventCount: numberValue(finding.eventCount),
  };
}

function escapeLike(value: string): string {
  return value.replace(/[!%_]/g, '!$&');
}
