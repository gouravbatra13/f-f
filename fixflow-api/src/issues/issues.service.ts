import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { redactSensitiveText } from '../common/sensitive-data-redactor.js';
import { AuthenticatedUser } from '../auth/auth.types.js';
import { OrganizationMember } from '../organizations/organization-member.entity.js';
import { OrganizationRole } from '../organizations/organization-role.enum.js';
import { Project } from '../projects/project.entity.js';
import { AssignIssueDto } from './dto/assign-issue.dto.js';
import { CreateIssueCommentDto } from './dto/create-issue-comment.dto.js';
import { ListIssuesDto, IssueSortField } from './dto/list-issues.dto.js';
import { UpdateIssueStatusDto } from './dto/update-issue-status.dto.js';
import { ErrorEvent } from './error-event.entity.js';
import { IssueActivityLog } from './issue-activity-log.entity.js';
import { IssueComment } from './issue-comment.entity.js';
import { Issue } from './issue.entity.js';

interface LockedIssue {
  id: string;
  projectId: string;
  organizationId: string;
  assigneeUserId: string | null;
  status: string;
  role: OrganizationRole;
}

@Injectable()
export class IssuesService {
  constructor(
    @InjectRepository(Issue)
    private readonly issues: Repository<Issue>,
    @InjectRepository(ErrorEvent)
    private readonly events: Repository<ErrorEvent>,
    @InjectRepository(IssueComment)
    private readonly comments: Repository<IssueComment>,
    @InjectRepository(IssueActivityLog)
    private readonly activity: Repository<IssueActivityLog>,
    @InjectRepository(Project)
    private readonly projects: Repository<Project>,
    private readonly dataSource: DataSource,
  ) {}

  async list(userId: string, filters: ListIssuesDto) {
    if (filters.projectId || filters.organizationId) {
      const projectAccess = await this.projects
        .createQueryBuilder('project')
        .innerJoin(
          OrganizationMember,
          'membership',
          'membership.organizationId = project.organizationId AND membership.userId = :userId',
          { userId },
        )
        .where(
          '(:projectId IS NULL OR project.id = :projectId) AND (:organizationId IS NULL OR project.organizationId = :organizationId)',
          {
            projectId: filters.projectId ?? null,
            organizationId: filters.organizationId ?? null,
          },
        )
        .getOne();
      if (!projectAccess) throw new NotFoundException('Project not found');
    }

    const query = this.issues
      .createQueryBuilder('issue')
      .innerJoin(Project, 'project', 'project.id = issue.projectId')
      .innerJoin(
        OrganizationMember,
        'membership',
        'membership.organizationId = project.organizationId',
      )
      .where('membership.userId = :userId', { userId });

    if (filters.projectId) {
      query.andWhere('issue.projectId = :projectId', {
        projectId: filters.projectId,
      });
    }
    if (filters.organizationId) {
      query.andWhere('project.organizationId = :organizationId', {
        organizationId: filters.organizationId,
      });
    }
    if (filters.status) query.andWhere('issue.status = :status', filters);
    if (filters.severity) query.andWhere('issue.severity = :severity', filters);
    if (filters.environment) {
      query.andWhere(
        'JSON_CONTAINS(issue.environments, JSON_QUOTE(:environment)) = 1',
        { environment: filters.environment },
      );
    }
    if (filters.search) {
      const textSearch = filters.search
        .replace(/[+\-><()~*"@]/g, ' ')
        .trim();
      const fingerprintSearch = filters.search.replace(/[!%_]/g, '!$&');
      if (textSearch) {
        query.andWhere(
          '(MATCH(issue.title) AGAINST (:textSearch IN BOOLEAN MODE) OR issue.fingerprint LIKE :fingerprintSearch ESCAPE \'!\')',
          {
            textSearch,
            fingerprintSearch: `${fingerprintSearch}%`,
          },
        );
      } else {
        query.andWhere(
          "issue.fingerprint LIKE :fingerprintSearch ESCAPE '!'",
          { fingerprintSearch: `${fingerprintSearch}%` },
        );
      }
    }

    const sortColumns: Record<IssueSortField, string> = {
      [IssueSortField.LAST_SEEN]: 'issue.lastSeenAt',
      [IssueSortField.FIRST_SEEN]: 'issue.firstSeenAt',
      [IssueSortField.EVENT_COUNT]: 'issue.eventCount',
      [IssueSortField.SEVERITY]: 'issue.severity',
    };
    const order = filters.order?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const [issues, total] = await query
      .orderBy(sortColumns[filters.sort] ?? sortColumns[IssueSortField.LAST_SEEN], order)
      .addOrderBy('issue.id', 'DESC')
      .skip((filters.page - 1) * filters.limit)
      .take(filters.limit)
      .getManyAndCount();

    return {
      data: issues,
      pagination: {
        page: filters.page,
        limit: filters.limit,
        total,
        totalPages: Math.ceil(total / filters.limit),
      },
    };
  }

  async getById(issueId: string, userId: string) {
    const issue = await this.findIssueForMember(issueId, userId);
    const [events, comments, activity] = await Promise.all([
      this.events.find({
        where: { issueId },
        order: { occurredAt: 'DESC' },
        take: 50,
      }),
      this.comments.find({
        where: { issueId },
        order: { createdAt: 'DESC' },
        take: 50,
      }),
      this.activity.find({
        where: { issueId },
        order: { createdAt: 'DESC' },
        take: 50,
      }),
    ]);

    return {
      ...issue,
      events: events.map((event) => ({
        id: event.id,
        errorMessage: event.errorMessage,
        stackTrace: event.stackTrace,
        severity: event.severity,
        environment: event.environment,
        release: event.release,
        endpoint: event.endpoint,
        occurredAt: event.occurredAt,
        metadata: event.metadata,
      })),
      comments,
      activity,
    };
  }

  async assign(
    issueId: string,
    user: AuthenticatedUser,
    dto: AssignIssueDto,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const issue = await this.lockIssueForMember(manager, issueId, user.id);
      this.assertCanManageIssue(issue.role);
      if (
        dto.assigneeUserId &&
        !(await manager.findOne(OrganizationMember, {
          where: {
            organizationId: issue.organizationId,
            userId: dto.assigneeUserId,
          },
          lock: { mode: 'pessimistic_write' },
        }))
      ) {
        throw new BadRequestException(
          'Assignee must be a member of the issue organization',
        );
      }
      if (issue.assigneeUserId === dto.assigneeUserId) {
        return manager.findOneOrFail(Issue, { where: { id: issueId } });
      }

      await manager.update(
        Issue,
        { id: issueId },
        { assigneeUserId: dto.assigneeUserId },
      );
      await this.writeActivity(manager, issueId, user.id, 'assignment_changed', {
        from: issue.assigneeUserId,
        to: dto.assigneeUserId,
      });
      return manager.findOneOrFail(Issue, { where: { id: issueId } });
    });
  }

  async updateStatus(
    issueId: string,
    user: AuthenticatedUser,
    dto: UpdateIssueStatusDto,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const issue = await this.lockIssueForMember(manager, issueId, user.id);
      this.assertCanManageIssue(issue.role);
      if (issue.status === dto.status) {
        return manager.findOneOrFail(Issue, { where: { id: issueId } });
      }

      await manager.update(
        Issue,
        { id: issueId },
        {
          status: dto.status,
          resolvedAt: dto.status === 'resolved' ? new Date() : null,
        },
      );
      await this.writeActivity(manager, issueId, user.id, 'status_changed', {
        from: issue.status,
        to: dto.status,
      });
      return manager.findOneOrFail(Issue, { where: { id: issueId } });
    });
  }

  async addComment(
    issueId: string,
    user: AuthenticatedUser,
    dto: CreateIssueCommentDto,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const issue = await this.lockIssueForMember(manager, issueId, user.id);
      this.assertCanManageIssue(issue.role);
      const comment = new IssueComment();
      comment.id = randomUUID();
      comment.issueId = issueId;
      comment.authorUserId = user.id;
      comment.body = redactSensitiveText(dto.body).slice(0, 4000);
      await manager.save(IssueComment, comment);
      await this.writeActivity(manager, issueId, user.id, 'comment_added', {
        commentId: comment.id,
      });
      return comment;
    });
  }

  private async findIssueForMember(
    issueId: string,
    userId: string,
  ): Promise<Issue> {
    const issue = await this.issues
      .createQueryBuilder('issue')
      .innerJoin(Project, 'project', 'project.id = issue.projectId')
      .innerJoin(
        OrganizationMember,
        'membership',
        'membership.organizationId = project.organizationId AND membership.userId = :userId',
        { userId },
      )
      .where('issue.id = :issueId', { issueId })
      .getOne();
    if (!issue) throw new NotFoundException('Issue not found');
    return issue;
  }

  private async lockIssueForMember(
    manager: EntityManager,
    issueId: string,
    userId: string,
  ): Promise<LockedIssue> {
    const rows = (await manager.query(
      `
        SELECT issue.id, issue.project_id AS projectId,
               project.organization_id AS organizationId,
               issue.assignee_user_id AS assigneeUserId, issue.status,
               membership.role AS role
        FROM issues issue
        INNER JOIN projects project ON project.id = issue.project_id
        INNER JOIN organization_members membership
          ON membership.organization_id = project.organization_id
        WHERE issue.id = ? AND membership.user_id = ?
        FOR UPDATE
      `,
      [issueId, userId],
    )) as LockedIssue[];
    if (!rows[0]) throw new NotFoundException('Issue not found');
    return rows[0];
  }

  private assertCanManageIssue(role: OrganizationRole): void {
    if (role === OrganizationRole.VIEWER) {
      throw new ForbiddenException('Viewers cannot modify issues');
    }
  }

  private async writeActivity(
    manager: EntityManager,
    issueId: string,
    actorUserId: string,
    action: string,
    details: Record<string, unknown>,
  ): Promise<void> {
    const entry = new IssueActivityLog();
    entry.id = randomUUID();
    entry.issueId = issueId;
    entry.actorUserId = actorUserId;
    entry.action = action;
    entry.details = details;
    await manager.save(IssueActivityLog, entry);
  }
}
