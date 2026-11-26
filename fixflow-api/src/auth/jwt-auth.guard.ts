import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AccessTokenService } from './access-token.service.js';
import { AuthService } from './auth.service.js';
import { UsersService } from '../users/users.service.js';
import type { AuthenticatedUser } from './auth.types.js';
import type { Request } from 'express';

type AuthenticatedRequest = Request & { user?: AuthenticatedUser };

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly accessTokens: AccessTokenService,
    private readonly users: UsersService,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Bearer access token is required');
    }

    const token = authorization.slice('Bearer '.length).trim();
    if (!token) {
      throw new UnauthorizedException('Bearer access token is required');
    }

    const claims = this.accessTokens.verify(token);
    const user = await this.users.findById(claims.sub);
    if (
      !user ||
      user.authVersion !== claims.av ||
      !(await this.auth.hasActiveSessionFamily(claims.sid))
    ) {
      throw new UnauthorizedException('Invalid or revoked access token');
    }

    request.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };
    return true;
  }
}
