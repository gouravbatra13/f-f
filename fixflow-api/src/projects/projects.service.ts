import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { IsNull, QueryFailedError, Repository } from 'typeorm';
import { OrganizationMember } from '../organizations/organization-member.entity.js';
import { Organization } from '../organizations/organization.entity.js';
import { OrganizationRole } from '../organizations/organization-role.enum.js';
import { CreateProjectDto } from './dto/create-project.dto.js';
import { UpdateProjectDto } from './dto/update-project.dto.js';
import { Project } from './project.entity.js';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project)
    private readonly projects: Repository<Project>,
    @InjectRepository(OrganizationMember)
    private readonly members: Repository<OrganizationMember>,
    @InjectRepository(Organization)
    private readonly organizations: Repository<Organization>,
  ) {}

  async create(organizationId: string, userId: string, dto: CreateProjectDto) {
    await this.requireOrganizationRole(organizationId, userId, [
      OrganizationRole.OWNER,
      OrganizationRole.ADMIN,
      OrganizationRole.MANAGER,
    ]);
    const project = new Project();
    project.id = randomUUID();
    project.organizationId = organizationId;
    project.name = dto.name;
    project.identifier = `prj_${randomUUID().replaceAll('-', '').slice(0, 20)}`;
    project.description = dto.description ?? null;
    project.archivedAt = null;

    try {
      await this.projects.save(project);
    } catch (error) {
      if (this.isDuplicateEntry(error)) {
        throw new ConflictException('A project with this name already exists');
      }
      throw error;
    }

    return this.toProject(project);
  }

  async list(organizationId: string, userId: string) {
    await this.requireOrganizationRole(organizationId, userId, Object.values(OrganizationRole));
    const projects = await this.projects.find({
      where: { organizationId, archivedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
    return projects.map((project) => this.toProject(project));
  }

  async getById(projectId: string, userId: string) {
    const project = await this.findProjectForMember(projectId, userId);
    return this.toProject(project);
  }

  async update(projectId: string, userId: string, dto: UpdateProjectDto) {
    const project = await this.findProjectForMember(projectId, userId);
    await this.requireOrganizationRole(project.organizationId, userId, [
      OrganizationRole.OWNER,
      OrganizationRole.ADMIN,
      OrganizationRole.MANAGER,
    ]);
    if (dto.name !== undefined) project.name = dto.name;
    if (dto.description !== undefined) project.description = dto.description;

    try {
      await this.projects.save(project);
    } catch (error) {
      if (this.isDuplicateEntry(error)) {
        throw new ConflictException('A project with this name already exists');
      }
      throw error;
    }
    return this.toProject(project);
  }

  async archive(projectId: string, userId: string): Promise<void> {
    const project = await this.findProjectForMember(projectId, userId);
    await this.requireOrganizationRole(project.organizationId, userId, [
      OrganizationRole.OWNER,
      OrganizationRole.ADMIN,
      OrganizationRole.MANAGER,
    ]);
    project.archivedAt = new Date();
    await this.projects.save(project);
  }

  private async findProjectForMember(
    projectId: string,
    userId: string,
  ): Promise<Project> {
    const project = await this.projects.findOne({
      where: { id: projectId, archivedAt: IsNull() },
    });
    if (!project) throw new NotFoundException('Project not found');
    await this.requireOrganizationRole(
      project.organizationId,
      userId,
      Object.values(OrganizationRole),
    );
    return project;
  }

  private async requireOrganizationRole(
    organizationId: string,
    userId: string,
    roles: OrganizationRole[],
  ): Promise<OrganizationRole> {
    const [organization, membership] = await Promise.all([
      this.organizations.findOne({
        where: { id: organizationId, deletedAt: IsNull() },
      }),
      this.members.findOne({ where: { organizationId, userId } }),
    ]);
    if (!organization || !membership) {
      throw new NotFoundException('Project or organization not found');
    }
    if (!roles.includes(membership.role)) {
      throw new ForbiddenException('You do not have permission for this project action');
    }
    return membership.role;
  }

  private toProject(project: Project) {
    return {
      id: project.id,
      organizationId: project.organizationId,
      name: project.name,
      identifier: project.identifier,
      description: project.description,
      archivedAt: project.archivedAt,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };
  }

  private isDuplicateEntry(error: unknown): boolean {
    return (
      error instanceof QueryFailedError &&
      'code' in error.driverError &&
      error.driverError.code === 'ER_DUP_ENTRY'
    );
  }
}
