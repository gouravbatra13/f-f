import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { DataSource, IsNull, Repository } from 'typeorm';
import { OrganizationMember } from '../organizations/organization-member.entity.js';
import { OrganizationRole } from '../organizations/organization-role.enum.js';
import { Project } from '../projects/project.entity.js';
import { CreateApiKeyDto } from '../projects/dto/create-api-key.dto.js';
import { ProjectApiKey } from '../projects/project-api-key.entity.js';

interface ApiKeyValidation {
  projectId: string;
  apiKeyId: string;
}

@Injectable()
export class ProjectApiKeysService {
  private readonly lastUsedWrites = new Map<string, number>();

  constructor(
    @InjectRepository(ProjectApiKey)
    private readonly apiKeys: Repository<ProjectApiKey>,
    @InjectRepository(Project)
    private readonly projects: Repository<Project>,
    @InjectRepository(OrganizationMember)
    private readonly members: Repository<OrganizationMember>,
    private readonly dataSource: DataSource,
  ) {}

  async create(
    projectId: string,
    userId: string,
    dto: CreateApiKeyDto,
  ) {
    const project = await this.getAuthorizedProject(projectId, userId, true);
    const rawKey = this.generateKey();
    const apiKey = this.newApiKey(project.id, userId, dto.name, rawKey);
    await this.dataSource.transaction((manager) =>
      manager.save(ProjectApiKey, apiKey),
    );
    return {
      ...this.toPublicKey(apiKey),
      key: rawKey,
      warning: 'Copy this key now; it will not be shown again.',
    };
  }

  async list(projectId: string, userId: string) {
    await this.getAuthorizedProject(projectId, userId, false);
    const keys = await this.apiKeys.find({
      where: { projectId },
      order: { createdAt: 'DESC' },
    });
    return keys.map((apiKey) => this.toPublicKey(apiKey));
  }

  async revoke(projectId: string, apiKeyId: string, userId: string) {
    await this.getAuthorizedProject(projectId, userId, true);
    const apiKey = await this.apiKeys.findOne({
      where: { id: apiKeyId, projectId, revokedAt: IsNull() },
    });
    if (!apiKey) throw new NotFoundException('API key not found');
    apiKey.revokedAt = new Date();
    await this.dataSource.transaction((manager) =>
      manager.save(ProjectApiKey, apiKey),
    );
    return this.toPublicKey(apiKey);
  }

  async rotate(
    projectId: string,
    apiKeyId: string,
    userId: string,
  ) {
    await this.getAuthorizedProject(projectId, userId, true);
    const newRawKey = this.generateKey();
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    let replacement: ProjectApiKey | undefined;
    try {
      const current = await queryRunner.manager.findOne(ProjectApiKey, {
        where: { id: apiKeyId, projectId, revokedAt: IsNull() },
        lock: { mode: 'pessimistic_write' },
      });
      if (!current) throw new NotFoundException('API key not found');
      current.revokedAt = new Date();
      replacement = this.newApiKey(
        projectId,
        userId,
        current.name,
        newRawKey,
      );
      await queryRunner.manager.save(ProjectApiKey, current);
      await queryRunner.manager.save(ProjectApiKey, replacement);
      await queryRunner.commitTransaction();
    } catch (error) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      throw error;
    } finally {
      await queryRunner.release();
    }

    if (!replacement) {
      throw new Error('API key rotation did not create a replacement key');
    }
    return {
      ...this.toPublicKey(replacement),
      key: newRawKey,
      warning: 'Copy this key now; it will not be shown again.',
    };
  }

  async validate(rawKey: string): Promise<ApiKeyValidation> {
    if (!/^ffk_live_[A-Za-z0-9_-]{40,}$/.test(rawKey)) {
      throw new UnauthorizedException('Invalid project API key');
    }
    const apiKey = await this.apiKeys
      .createQueryBuilder('apiKey')
      .innerJoin(
        Project,
        'project',
        'project.id = apiKey.projectId AND project.archivedAt IS NULL',
      )
      .select('apiKey.id', 'apiKeyId')
      .addSelect('apiKey.projectId', 'projectId')
      .where('apiKey.keyHash = :keyHash', { keyHash: this.hashKey(rawKey) })
      .andWhere('apiKey.revokedAt IS NULL')
      .getRawOne<{ apiKeyId: string; projectId: string }>();
    if (!apiKey) {
      throw new UnauthorizedException('Invalid project API key');
    }

    await this.updateLastUsed(apiKey.apiKeyId);
    return { projectId: apiKey.projectId, apiKeyId: apiKey.apiKeyId };
  }

  private async updateLastUsed(apiKeyId: string): Promise<void> {
    const now = Date.now();
    const lastWrite = this.lastUsedWrites.get(apiKeyId);
    if (lastWrite !== undefined && now - lastWrite < 60_000) return;

    const result = await this.apiKeys.update(
      { id: apiKeyId, revokedAt: IsNull() },
      { lastUsedAt: new Date(now) },
    );
    if (!result.affected) {
      throw new UnauthorizedException('Invalid project API key');
    }

    this.lastUsedWrites.delete(apiKeyId);
    this.lastUsedWrites.set(apiKeyId, now);
    if (this.lastUsedWrites.size > 10_000) {
      for (const [id, writtenAt] of this.lastUsedWrites) {
        if (now - writtenAt >= 60_000) this.lastUsedWrites.delete(id);
      }
      while (this.lastUsedWrites.size > 10_000) {
        const oldestId = this.lastUsedWrites.keys().next().value;
        if (!oldestId) break;
        this.lastUsedWrites.delete(oldestId);
      }
    }
  }

  private async getAuthorizedProject(
    projectId: string,
    userId: string,
    canManageKeys: boolean,
  ): Promise<Project> {
    const project = await this.projects.findOne({
      where: { id: projectId, archivedAt: IsNull() },
    });
    if (!project) throw new NotFoundException('Project not found');
    const membership = await this.members.findOne({
      where: { organizationId: project.organizationId, userId },
    });
    if (!membership) throw new NotFoundException('Project not found');
    const allowed = canManageKeys
      ? [
          OrganizationRole.OWNER,
          OrganizationRole.ADMIN,
          OrganizationRole.MANAGER,
        ]
      : Object.values(OrganizationRole);
    if (!allowed.includes(membership.role)) {
      throw new ForbiddenException('You do not have permission to manage project API keys');
    }
    return project;
  }

  private newApiKey(
    projectId: string,
    userId: string,
    name: string,
    rawKey: string,
  ): ProjectApiKey {
    const apiKey = new ProjectApiKey();
    apiKey.id = randomUUID();
    apiKey.projectId = projectId;
    apiKey.createdByUserId = userId;
    apiKey.name = name;
    apiKey.keyPrefix = rawKey.slice(0, 16);
    apiKey.keyHash = this.hashKey(rawKey);
    apiKey.lastUsedAt = null;
    apiKey.revokedAt = null;
    return apiKey;
  }

  private generateKey(): string {
    return `ffk_live_${randomBytes(32).toString('base64url')}`;
  }

  private hashKey(key: string): string {
    return createHash('sha256').update(key).digest('hex');
  }

  private toPublicKey(apiKey: ProjectApiKey) {
    return {
      id: apiKey.id,
      projectId: apiKey.projectId,
      name: apiKey.name,
      keyPrefix: apiKey.keyPrefix,
      lastUsedAt: apiKey.lastUsedAt,
      revokedAt: apiKey.revokedAt,
      createdAt: apiKey.createdAt,
    };
  }
}
