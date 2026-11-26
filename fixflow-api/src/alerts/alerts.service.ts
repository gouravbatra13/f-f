import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager, IsNull, Repository } from 'typeorm';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { redactSensitiveText } from '../common/sensitive-data-redactor.js';
import { OrganizationMember } from '../organizations/organization-member.entity.js';
import { OrganizationRole } from '../organizations/organization-role.enum.js';
import { Project } from '../projects/project.entity.js';
import { IssueSeverity } from '../issues/issue-severity.enum.js';
import { Issue } from '../issues/issue.entity.js';
import { Notification } from '../notifications/notification.entity.js';
import { AlertRule } from './alert-rule.entity.js';
import { AlertRuleType } from './alert-rule-type.enum.js';
import { CreateAlertRuleDto } from './dto/create-alert-rule.dto.js';
import { UpdateAlertRuleDto } from './dto/update-alert-rule.dto.js';

interface RuleLockRow {
  id: string;
  role: OrganizationRole;
}

interface CountRow {
  count: number | string;
}

@Injectable()
export class AlertsService {
  constructor(
    @InjectRepository(AlertRule)
    private readonly rules: Repository<AlertRule>,
    private readonly dataSource: DataSource,
  ) {}

  async list(organizationId: string, userId: string) {
    await this.requireOrganizationMember(organizationId, userId);
    return this.rules.find({
      where: { organizationId, deletedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
  }

  async create(
    organizationId: string,
    user: AuthenticatedUser,
    dto: CreateAlertRuleDto,
  ) {
    return this.dataSource.transaction(async (manager) => {
      await this.lockOrganizationForManager(organizationId, user.id, manager);
      const projectId = dto.projectId ?? null;
      if (projectId) {
        await this.requireProjectInOrganization(
          manager,
          organizationId,
          projectId,
        );
      }
      this.assertRuleConfiguration(
        dto.type,
        dto.thresholdCount ?? null,
        dto.windowMinutes ?? null,
      );

      const rule = new AlertRule();
      rule.id = randomUUID();
      rule.organizationId = organizationId;
      rule.projectId = projectId;
      rule.createdByUserId = user.id;
      rule.name = this.sanitizeName(dto.name);
      rule.type = dto.type;
      rule.environment = dto.environment ?? null;
      rule.thresholdCount =
        dto.type === AlertRuleType.ERROR_SPIKE ? dto.thresholdCount! : null;
      rule.windowMinutes =
        dto.type === AlertRuleType.ERROR_SPIKE ? dto.windowMinutes! : null;
      rule.cooldownMinutes = dto.cooldownMinutes ?? 15;
      rule.isEnabled = dto.isEnabled ?? true;
      rule.lastTriggeredAt = null;
      rule.deletedAt = null;
      return manager.save(AlertRule, rule);
    });
  }

  async update(
    organizationId: string,
    ruleId: string,
    userId: string,
    dto: UpdateAlertRuleDto,
  ) {
    if (!Object.values(dto).some((value) => value !== undefined)) {
      throw new BadRequestException('At least one field must be provided');
    }
    return this.dataSource.transaction(async (manager) => {
      await this.lockRuleForManager(manager, organizationId, ruleId, userId);
      const rule = await manager.findOne(AlertRule, {
        where: { id: ruleId, organizationId, deletedAt: IsNull() },
        lock: { mode: 'pessimistic_write' },
      });
      if (!rule) throw new NotFoundException('Alert rule not found');

      if (dto.projectId !== undefined) {
        const projectId = dto.projectId ?? null;
        if (projectId) {
          await this.requireProjectInOrganization(
            manager,
            organizationId,
            projectId,
          );
        }
        rule.projectId = projectId;
      }
      if (dto.name !== undefined) rule.name = this.sanitizeName(dto.name);
      if (dto.environment !== undefined) {
        rule.environment = dto.environment ?? null;
      }
      if (dto.thresholdCount !== undefined) {
        rule.thresholdCount = dto.thresholdCount ?? null;
      }
      if (dto.windowMinutes !== undefined) {
        rule.windowMinutes = dto.windowMinutes ?? null;
      }
      if (dto.cooldownMinutes !== undefined) {
        rule.cooldownMinutes = dto.cooldownMinutes;
      }
      if (dto.isEnabled !== undefined) rule.isEnabled = dto.isEnabled;
      this.assertRuleConfiguration(
        rule.type,
        rule.thresholdCount,
        rule.windowMinutes,
      );
      if (rule.type === AlertRuleType.CRITICAL_ERROR) {
        rule.thresholdCount = null;
        rule.windowMinutes = null;
      }
      return manager.save(AlertRule, rule);
    });
  }

  async archive(organizationId: string, ruleId: string, userId: string) {
    return this.dataSource.transaction(async (manager) => {
      await this.lockRuleForManager(manager, organizationId, ruleId, userId);
      await manager.update(
        AlertRule,
        { id: ruleId, organizationId, deletedAt: IsNull() },
        { deletedAt: new Date(), isEnabled: false },
      );
      return { archived: true };
    });
  }

  async evaluateInTransaction(
    manager: EntityManager,
    input: {
      projectId: string;
      issueId: string;
      eventId: string;
      severity: IssueSeverity;
      environment: string | null;
    },
  ): Promise<number> {
    const project = await manager.findOne(Project, {
      where: { id: input.projectId, archivedAt: IsNull() },
    });
    if (!project) throw new NotFoundException('Project not found');

    const rules = await manager
      .createQueryBuilder(AlertRule, 'rule')
      .where('rule.organizationId = :organizationId', {
        organizationId: project.organizationId,
      })
      .andWhere('(rule.projectId IS NULL OR rule.projectId = :projectId)', {
        projectId: input.projectId,
      })
      .andWhere('rule.isEnabled = :enabled', { enabled: true })
      .andWhere('rule.deletedAt IS NULL')
      .setLock('pessimistic_write')
      .getMany();
    if (!rules.length) return 0;

    const issue = await manager.findOne(Issue, {
      where: { id: input.issueId, projectId: input.projectId },
    });
    if (!issue) throw new NotFoundException('Issue not found');

    const now = new Date();
    let notificationCount = 0;
    for (const rule of rules) {
      const eventEnvironment = input.environment?.toLowerCase() ?? null;
      if (rule.environment && rule.environment !== eventEnvironment) continue;

      let triggered = false;
      let eventCount = 1;
      if (rule.type === AlertRuleType.CRITICAL_ERROR) {
        triggered = input.severity === IssueSeverity.CRITICAL;
      } else {
        const environmentFilter = rule.environment
          ? 'AND LOWER(environment) = ?'
          : '';
        const parameters: unknown[] = [
          input.projectId,
          -(rule.windowMinutes ?? 1),
        ];
        if (rule.environment) parameters.push(rule.environment);
        const countRows = (await manager.query(
          `
            SELECT COUNT(*) AS count
            FROM error_events
            WHERE project_id = ?
              AND created_at >= TIMESTAMPADD(MINUTE, ?, CURRENT_TIMESTAMP(6))
              ${environmentFilter}
          `,
          parameters,
        )) as CountRow[];
        eventCount = Number(countRows[0]?.count ?? 0);
        triggered = eventCount >= (rule.thresholdCount ?? Number.MAX_SAFE_INTEGER);
      }

      if (!triggered) continue;
      if (
        rule.lastTriggeredAt &&
        now.getTime() - new Date(rule.lastTriggeredAt).getTime() <
          rule.cooldownMinutes * 60_000
      ) {
        continue;
      }

      rule.lastTriggeredAt = now;
      await manager.save(AlertRule, rule);
      const members = await manager.find(OrganizationMember, {
        where: { organizationId: rule.organizationId },
      });
      const title =
        rule.type === AlertRuleType.CRITICAL_ERROR
          ? `Critical error: ${issue.title}`
          : `Error spike: ${rule.name}`;
      const message =
        rule.type === AlertRuleType.CRITICAL_ERROR
          ? `A critical error was reported in ${eventEnvironment ?? 'an unspecified environment'}.`
          : `${eventCount} errors were reported within ${rule.windowMinutes} minute(s).`;
      const notifications = members.map((member) => {
        const notification = new Notification();
        notification.id = randomUUID();
        notification.organizationId = rule.organizationId;
        notification.userId = member.userId;
        notification.projectId = input.projectId;
        notification.alertRuleId = rule.id;
        notification.errorEventId = input.eventId;
        notification.issueId = input.issueId;
        notification.title = title.slice(0, 120);
        notification.message = message.slice(0, 1000);
        notification.mockEmailStatus = 'simulated';
        notification.readAt = null;
        return notification;
      });
      if (notifications.length) {
        await manager.save(Notification, notifications);
        notificationCount += notifications.length;
      }
    }
    return notificationCount;
  }

  private async requireOrganizationMember(
    organizationId: string,
    userId: string,
  ): Promise<void> {
    const rows = (await this.dataSource.query(
      `
        SELECT membership.id
        FROM organization_members membership
        INNER JOIN organizations organization
          ON organization.id = membership.organization_id
        WHERE membership.organization_id = ? AND membership.user_id = ?
          AND organization.deleted_at IS NULL
        LIMIT 1
      `,
      [organizationId, userId],
    )) as { id: string }[];
    if (!rows[0]) throw new NotFoundException('Organization not found');
  }

  private async lockOrganizationForManager(
    organizationId: string,
    userId: string,
    manager: EntityManager,
  ): Promise<void> {
    const rows = (await manager.query(
      `
        SELECT membership.role AS role
        FROM organizations organization
        INNER JOIN organization_members membership
          ON membership.organization_id = organization.id
        WHERE organization.id = ? AND organization.deleted_at IS NULL
          AND membership.user_id = ?
        FOR UPDATE
      `,
      [organizationId, userId],
    )) as { role: OrganizationRole }[];
    if (!rows[0]) throw new NotFoundException('Organization not found');
    this.assertCanManageRules(rows[0].role);
  }

  private async lockRuleForManager(
    manager: EntityManager,
    organizationId: string,
    ruleId: string,
    userId: string,
  ): Promise<RuleLockRow> {
    const rows = (await manager.query(
      `
        SELECT rule.id, membership.role AS role
        FROM alert_rules rule
        INNER JOIN organizations organization
          ON organization.id = rule.organization_id
        INNER JOIN organization_members membership
          ON membership.organization_id = rule.organization_id
        WHERE rule.id = ? AND rule.organization_id = ?
          AND rule.deleted_at IS NULL AND organization.deleted_at IS NULL
          AND membership.user_id = ?
        FOR UPDATE
      `,
      [ruleId, organizationId, userId],
    )) as RuleLockRow[];
    if (!rows[0]) throw new NotFoundException('Alert rule not found');
    this.assertCanManageRules(rows[0].role);
    return rows[0];
  }

  private async requireProjectInOrganization(
    manager: EntityManager,
    organizationId: string,
    projectId: string,
  ): Promise<void> {
    const project = await manager.findOne(Project, {
      where: { id: projectId, organizationId, archivedAt: IsNull() },
    });
    if (!project) throw new NotFoundException('Project not found');
  }

  private assertCanManageRules(role: OrganizationRole): void {
    if (
      ![
        OrganizationRole.OWNER,
        OrganizationRole.ADMIN,
        OrganizationRole.MANAGER,
      ].includes(role)
    ) {
      throw new ForbiddenException(
        'Only organization owners, admins, and managers can manage alert rules',
      );
    }
  }

  private assertRuleConfiguration(
    type: AlertRuleType,
    thresholdCount: number | null,
    windowMinutes: number | null,
  ): void {
    if (
      type === AlertRuleType.ERROR_SPIKE &&
      (!thresholdCount || !windowMinutes)
    ) {
      throw new BadRequestException(
        'Error spike rules require thresholdCount and windowMinutes',
      );
    }
    if (
      type === AlertRuleType.CRITICAL_ERROR &&
      (thresholdCount !== null || windowMinutes !== null)
    ) {
      throw new BadRequestException(
        'Critical error rules do not accept spike thresholds',
      );
    }
  }

  private sanitizeName(value: string): string {
    const name = redactSensitiveText(value.trim()).slice(0, 120);
    if (!name) throw new BadRequestException('Alert rule name cannot be empty');
    return name;
  }
}
