import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import {
  DataSource,
  EntityManager,
  IsNull,
  Repository,
} from 'typeorm';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { redactSensitiveText } from '../common/sensitive-data-redactor.js';
import { OrganizationMember } from '../organizations/organization-member.entity.js';
import { OrganizationRole } from '../organizations/organization-role.enum.js';
import { Project } from '../projects/project.entity.js';
import { CreateIncidentDto } from './dto/create-incident.dto.js';
import { LinkIssueDto } from './dto/link-issue.dto.js';
import {
  IncidentSortField,
  ListIncidentsDto,
} from './dto/list-incidents.dto.js';
import { ListTimelineDto } from './dto/list-timeline.dto.js';
import { UpdateIncidentDto } from './dto/update-incident.dto.js';
import { IncidentIssue } from './incident-issue.entity.js';
import { Incident } from './incident.entity.js';
import { IncidentSeverity } from './incident-severity.enum.js';
import { IncidentStatus } from './incident-status.enum.js';
import { IncidentTimeline } from './incident-timeline.entity.js';

interface IncidentLockRow {
  id: string;
  organizationId: string;
  projectId: string | null;
  ownerUserId: string | null;
  role: OrganizationRole;
}

interface IssueProjectRow {
  id: string;
  projectId: string;
}

@Injectable()
export class IncidentsService {
  constructor(
    @InjectRepository(Incident)
    private readonly incidents: Repository<Incident>,
    @InjectRepository(IncidentTimeline)
    private readonly timeline: Repository<IncidentTimeline>,
    private readonly dataSource: DataSource,
  ) {}

  async create(
    organizationId: string,
    user: AuthenticatedUser,
    dto: CreateIncidentDto,
  ) {
    return this.dataSource.transaction(async (manager) => {
      await this.lockOrganizationForMember(manager, organizationId, user.id);
      if (dto.projectId) {
        await this.requireProjectInOrganization(
          manager,
          organizationId,
          dto.projectId,
        );
      }
      if (dto.ownerUserId) {
        await this.requireOrganizationMember(
          manager,
          organizationId,
          dto.ownerUserId,
        );
      }

      const incident = new Incident();
      incident.id = randomUUID();
      incident.organizationId = organizationId;
      incident.projectId = dto.projectId ?? null;
      incident.title = this.sanitizeRequiredText(dto.title, 255);
      incident.description = this.sanitizeOptionalText(dto.description, 10000);
      incident.severity = dto.severity ?? IncidentSeverity.SEV3;
      incident.status = IncidentStatus.OPEN;
      incident.ownerUserId = dto.ownerUserId ?? null;
      incident.resolutionNotes = null;
      incident.resolvedAt = null;
      incident.deletedAt = null;
      await manager.save(Incident, incident);
      await this.writeTimeline(manager, incident.id, user.id, 'incident_created', {
        severity: incident.severity,
        projectId: incident.projectId,
        ownerUserId: incident.ownerUserId,
      });
      if (incident.ownerUserId) {
        await this.writeTimeline(
          manager,
          incident.id,
          user.id,
          'owner_assigned',
          { from: null, to: incident.ownerUserId },
        );
      }
      return incident;
    });
  }

  async list(
    organizationId: string,
    userId: string,
    filters: ListIncidentsDto,
  ) {
    await this.requireOrganizationMemberRead(organizationId, userId);
    const query = this.incidents
      .createQueryBuilder('incident')
      .where('incident.organizationId = :organizationId', { organizationId })
      .andWhere('incident.deletedAt IS NULL');

    if (filters.projectId) {
      query.andWhere('incident.projectId = :projectId', {
        projectId: filters.projectId,
      });
    }
    if (filters.status) query.andWhere('incident.status = :status', filters);
    if (filters.severity) {
      query.andWhere('incident.severity = :severity', filters);
    }
    if (filters.search?.trim()) {
      query.andWhere(
        '(incident.title LIKE :search ESCAPE \'!\' OR incident.description LIKE :search ESCAPE \'!\')',
        { search: `%${escapeLike(filters.search.trim())}%` },
      );
    }

    const sortColumns: Record<IncidentSortField, string> = {
      [IncidentSortField.CREATED_AT]: 'incident.createdAt',
      [IncidentSortField.UPDATED_AT]: 'incident.updatedAt',
      [IncidentSortField.SEVERITY]: 'incident.severity',
    };
    const order = filters.order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const [data, total] = await query
      .orderBy(sortColumns[filters.sort], order)
      .addOrderBy('incident.id', 'DESC')
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

  async getById(organizationId: string, incidentId: string, userId: string) {
    const incident = await this.findIncidentForMember(
      organizationId,
      incidentId,
      userId,
    );
    const linkedIssues = (await this.dataSource.query(
      `
        SELECT issue.id, issue.project_id AS projectId, issue.title,
               issue.status, issue.severity, issue.event_count AS eventCount,
               issue.first_seen_at AS firstSeenAt, issue.last_seen_at AS lastSeenAt
        FROM incident_issues link
        INNER JOIN issues issue ON issue.id = link.issue_id
        WHERE link.incident_id = ?
        ORDER BY link.created_at ASC, link.issue_id ASC
      `,
      [incidentId],
    )) as Record<string, unknown>[];

    return { ...incident, linkedIssues };
  }

  async listTimeline(
    organizationId: string,
    incidentId: string,
    userId: string,
    pagination: ListTimelineDto,
  ) {
    await this.findIncidentForMember(organizationId, incidentId, userId);
    const [data, total] = await this.timeline.findAndCount({
      where: { incidentId },
      order: { createdAt: 'ASC', id: 'ASC' },
      skip: (pagination.page - 1) * pagination.limit,
      take: pagination.limit,
    });
    return {
      data,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages: Math.ceil(total / pagination.limit),
      },
    };
  }

  async update(
    organizationId: string,
    incidentId: string,
    user: AuthenticatedUser,
    dto: UpdateIncidentDto,
  ) {
    if (!Object.values(dto).some((value) => value !== undefined)) {
      throw new BadRequestException('At least one field must be provided');
    }
    return this.dataSource.transaction(async (manager) => {
      const locked = await this.lockIncidentForMember(
        manager,
        organizationId,
        incidentId,
        user.id,
      );
      this.assertCanModify(locked.role);
      const incident = await manager.findOneOrFail(Incident, {
        where: { id: incidentId, organizationId, deletedAt: IsNull() },
        lock: { mode: 'pessimistic_write' },
      });
      const updatedFields: string[] = [];

      if (dto.title !== undefined) {
        const title = this.sanitizeRequiredText(dto.title, 255);
        if (incident.title !== title) {
          incident.title = title;
          updatedFields.push('title');
        }
      }
      if (dto.description !== undefined) {
        const description = this.sanitizeOptionalText(dto.description, 10000);
        if (incident.description !== description) {
          incident.description = description;
          updatedFields.push('description');
        }
      }
      if (dto.severity !== undefined && incident.severity !== dto.severity) {
        const previous = incident.severity;
        incident.severity = dto.severity;
        await this.writeTimeline(
          manager,
          incidentId,
          user.id,
          'severity_changed',
          { from: previous, to: dto.severity },
        );
      }
      if (dto.status !== undefined && incident.status !== dto.status) {
        const previous = incident.status;
        incident.status = dto.status;
        incident.resolvedAt =
          dto.status === IncidentStatus.RESOLVED ? new Date() : null;
        await this.writeTimeline(
          manager,
          incidentId,
          user.id,
          'status_changed',
          { from: previous, to: dto.status },
        );
      }
      if (dto.ownerUserId !== undefined) {
        const ownerUserId = dto.ownerUserId ?? null;
        if (ownerUserId) {
          await this.requireOrganizationMember(
            manager,
            organizationId,
            ownerUserId,
          );
        }
        if (incident.ownerUserId !== ownerUserId) {
          const previous = incident.ownerUserId;
          incident.ownerUserId = ownerUserId;
          await this.writeTimeline(
            manager,
            incidentId,
            user.id,
            'owner_assigned',
            { from: previous, to: ownerUserId },
          );
        }
      }
      if (dto.resolutionNotes !== undefined) {
        const notes = this.sanitizeOptionalText(dto.resolutionNotes, 10000);
        if (incident.resolutionNotes !== notes) {
          incident.resolutionNotes = notes;
          await this.writeTimeline(
            manager,
            incidentId,
            user.id,
            'resolution_notes_updated',
            { updated: true },
          );
        }
      }
      if (updatedFields.length) {
        await this.writeTimeline(
          manager,
          incidentId,
          user.id,
          'details_updated',
          { fields: updatedFields },
        );
      }

      return manager.save(Incident, incident);
    });
  }

  async linkIssue(
    organizationId: string,
    incidentId: string,
    user: AuthenticatedUser,
    dto: LinkIssueDto,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const incident = await this.lockIncidentForMember(
        manager,
        organizationId,
        incidentId,
        user.id,
      );
      this.assertCanModify(incident.role);
      const issue = (await manager.query(
        `
          SELECT issue.id, issue.project_id AS projectId
          FROM issues issue
          INNER JOIN projects project ON project.id = issue.project_id
          WHERE issue.id = ? AND project.organization_id = ?
          FOR UPDATE
        `,
        [dto.issueId, organizationId],
      )) as IssueProjectRow[];
      if (!issue[0]) throw new NotFoundException('Issue not found');
      if (incident.projectId && issue[0].projectId !== incident.projectId) {
        throw new BadRequestException(
          'Issue must belong to the incident project',
        );
      }

      const existing = await manager.findOne(IncidentIssue, {
        where: { incidentId, issueId: dto.issueId },
      });
      if (existing) return { incidentId, issueId: dto.issueId, linked: false };

      const link = new IncidentIssue();
      link.incidentId = incidentId;
      link.issueId = dto.issueId;
      link.linkedByUserId = user.id;
      await manager.insert(IncidentIssue, link);
      await this.writeTimeline(
        manager,
        incidentId,
        user.id,
        'issue_linked',
        { issueId: dto.issueId },
      );
      return { incidentId, issueId: dto.issueId, linked: true };
    });
  }

  async unlinkIssue(
    organizationId: string,
    incidentId: string,
    issueId: string,
    user: AuthenticatedUser,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const incident = await this.lockIncidentForMember(
        manager,
        organizationId,
        incidentId,
        user.id,
      );
      this.assertCanModify(incident.role);
      const result = await manager.delete(IncidentIssue, {
        incidentId,
        issueId,
      });
      if (result.affected) {
        await this.writeTimeline(
          manager,
          incidentId,
          user.id,
          'issue_unlinked',
          { issueId },
        );
      }
      return { incidentId, issueId, unlinked: Boolean(result.affected) };
    });
  }

  async archive(
    organizationId: string,
    incidentId: string,
    user: AuthenticatedUser,
  ) {
    return this.dataSource.transaction(async (manager) => {
      await this.lockIncidentForMember(
        manager,
        organizationId,
        incidentId,
        user.id,
      );
      await manager.update(
        Incident,
        { id: incidentId, organizationId, deletedAt: IsNull() },
        { deletedAt: new Date() },
      );
      await this.writeTimeline(
        manager,
        incidentId,
        user.id,
        'incident_archived',
        null,
      );
      return { archived: true };
    });
  }

  private async findIncidentForMember(
    organizationId: string,
    incidentId: string,
    userId: string,
  ): Promise<Incident> {
    const incident = await this.incidents
      .createQueryBuilder('incident')
      .innerJoin(
        'organizations',
        'organization',
        'organization.id = incident.organizationId AND organization.deletedAt IS NULL',
      )
      .innerJoin(
        OrganizationMember,
        'membership',
        'membership.organizationId = incident.organizationId AND membership.userId = :userId',
        { userId },
      )
      .where('incident.id = :incidentId', { incidentId })
      .andWhere('incident.organizationId = :organizationId', { organizationId })
      .andWhere('incident.deletedAt IS NULL')
      .getOne();
    if (!incident) throw new NotFoundException('Incident not found');
    return incident;
  }

  private async requireOrganizationMemberRead(
    organizationId: string,
    userId: string,
  ): Promise<void> {
    const membership = await this.dataSource
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
    if (!membership) throw new NotFoundException('Organization not found');
  }

  private async lockOrganizationForMember(
    manager: EntityManager,
    organizationId: string,
    userId: string,
  ): Promise<OrganizationRole> {
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
    this.assertCanModify(rows[0].role);
    return rows[0].role;
  }

  private async lockIncidentForMember(
    manager: EntityManager,
    organizationId: string,
    incidentId: string,
    userId: string,
  ): Promise<IncidentLockRow> {
    const rows = (await manager.query(
      `
        SELECT incident.id, incident.organization_id AS organizationId,
               incident.project_id AS projectId,
               incident.owner_user_id AS ownerUserId,
               membership.role AS role
        FROM incidents incident
        INNER JOIN organizations organization
          ON organization.id = incident.organization_id
        INNER JOIN organization_members membership
          ON membership.organization_id = incident.organization_id
        WHERE incident.id = ? AND incident.organization_id = ?
          AND incident.deleted_at IS NULL AND organization.deleted_at IS NULL
          AND membership.user_id = ?
        FOR UPDATE
      `,
      [incidentId, organizationId, userId],
    )) as IncidentLockRow[];
    if (!rows[0]) throw new NotFoundException('Incident not found');
    this.assertCanModify(rows[0].role);
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

  private async requireOrganizationMember(
    manager: EntityManager,
    organizationId: string,
    userId: string,
  ): Promise<void> {
    const membership = await manager.findOne(OrganizationMember, {
      where: { organizationId, userId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!membership) {
      throw new BadRequestException(
        'Incident owner must be a member of its organization',
      );
    }
  }

  private assertCanModify(role: OrganizationRole): void {
    if (role === OrganizationRole.VIEWER) {
      throw new ForbiddenException('Viewers cannot modify incidents');
    }
  }

  private async writeTimeline(
    manager: EntityManager,
    incidentId: string,
    actorUserId: string,
    action: string,
    details: Record<string, unknown> | null,
  ): Promise<void> {
    const entry = new IncidentTimeline();
    entry.id = randomUUID();
    entry.incidentId = incidentId;
    entry.actorUserId = actorUserId;
    entry.action = action;
    entry.details = details;
    await manager.save(IncidentTimeline, entry);
  }

  private sanitizeRequiredText(value: string, maxLength: number): string {
    const sanitized = redactSensitiveText(value.trim()).slice(0, maxLength);
    if (!sanitized) throw new BadRequestException('Text value cannot be empty');
    return sanitized;
  }

  private sanitizeOptionalText(
    value: string | null | undefined,
    maxLength: number,
  ): string | null {
    if (value == null) return null;
    return redactSensitiveText(value.trim()).slice(0, maxLength) || null;
  }
}

function escapeLike(value: string): string {
  return value.replace(/[!%_]/g, '!$&');
}
