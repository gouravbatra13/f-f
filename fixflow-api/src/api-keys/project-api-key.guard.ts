import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { ProjectApiKeysService } from './project-api-keys.service.js';

type ApiKeyRequest = Request & { projectId?: string; projectApiKeyId?: string };

@Injectable()
export class ProjectApiKeyGuard implements CanActivate {
  constructor(private readonly apiKeys: ProjectApiKeysService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ApiKeyRequest>();
    const apiKey = request.header('x-api-key');
    if (!apiKey) {
      throw new UnauthorizedException('Project API key is required');
    }

    const validated = await this.apiKeys.validate(apiKey);
    request.projectId = validated.projectId;
    request.projectApiKeyId = validated.apiKeyId;
    return true;
  }
}
