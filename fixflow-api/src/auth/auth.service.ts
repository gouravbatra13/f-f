import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  DataSource,
  EntityManager,
  IsNull,
  MoreThan,
  QueryFailedError,
  Repository,
} from 'typeorm';
import type { LoginDto } from './dto/login.dto.js';
import type { RegisterDto } from './dto/register.dto.js';
import { User } from '../users/user.entity.js';
import { UserRole } from '../users/user-role.enum.js';
import type { AuthResult, AuthenticatedUser } from './auth.types.js';
import { AccessTokenService } from './access-token.service.js';
import { RefreshSession } from './refresh-session.entity.js';
import type { AuthConfig } from '../config/auth.config.js';
import { ConfigService } from '@nestjs/config';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  private readonly config: AuthConfig;
  private readonly dummyPasswordHash = bcrypt.hash(
    randomBytes(32).toString('hex'),
    BCRYPT_ROUNDS,
  );

  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(RefreshSession)
    private readonly refreshSessions: Repository<RefreshSession>,
    private readonly dataSource: DataSource,
    private readonly accessTokens: AccessTokenService,
    configService: ConfigService,
  ) {
    this.config = configService.getOrThrow<AuthConfig>('auth');
  }

  async register(dto: RegisterDto): Promise<AuthResult> {
    this.assertPasswordByteLength(dto.password);
    const user = new User();
    user.id = randomUUID();
    user.email = dto.email.trim().toLowerCase();
    user.name = dto.name.trim();
    user.passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    user.role = UserRole.DEVELOPER;
    user.authVersion = 0;

    try {
      return await this.dataSource.transaction(async (manager) => {
        const savedUser = await manager.save(User, user);
        return this.issueAuthResult(manager, savedUser);
      });
    } catch (error) {
      if (this.isDuplicateEmailError(error)) {
        throw new ConflictException(
          'An account with this email already exists',
        );
      }

      throw error;
    }
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    this.assertPasswordByteLength(dto.password);
    const email = dto.email.trim().toLowerCase();
    const user = await this.users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email })
      .getOne();

    const passwordHash = user?.passwordHash ?? (await this.dummyPasswordHash);
    const passwordMatches = await bcrypt.compare(dto.password, passwordHash);
    if (!user || !passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.issueAuthResult(this.dataSource.manager, user);
  }

  async refresh(rawToken: string): Promise<AuthResult> {
    const oldTokenHash = this.hashToken(rawToken);
    const existing = await this.refreshSessions.findOne({
      where: { tokenHash: oldTokenHash },
      select: { id: true, userId: true, familyId: true },
    });
    if (!existing) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let result: AuthResult | undefined;
    let tokenWasReused = false;
    try {
      const user = await queryRunner.manager.findOne(User, {
        where: { id: existing.userId },
        lock: { mode: 'pessimistic_write' },
      });
      const session = await queryRunner.manager.findOne(RefreshSession, {
        where: { id: existing.id, tokenHash: oldTokenHash },
        lock: { mode: 'pessimistic_write' },
      });

      if (!user || !session) {
        await queryRunner.commitTransaction();
        throw new UnauthorizedException('Invalid or expired refresh token');
      }

      const now = new Date();
      if (session.revokedAt) {
        if (session.replacedBySessionId) {
          await queryRunner.manager.update(
            RefreshSession,
            { familyId: session.familyId, revokedAt: IsNull() },
            { revokedAt: now },
          );
          tokenWasReused = true;
        }
      } else if (session.expiresAt <= now) {
        session.revokedAt = now;
        await queryRunner.manager.save(RefreshSession, session);
      } else {
        const replacementToken = randomBytes(32).toString('base64url');
        const replacement = this.createSession(
          user.id,
          session.familyId,
          replacementToken,
        );
        await queryRunner.manager.save(RefreshSession, replacement);
        session.revokedAt = now;
        session.replacedBySessionId = replacement.id;
        await queryRunner.manager.save(RefreshSession, session);
        result = this.toAuthResult(user, replacementToken, session.familyId);
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      throw error;
    } finally {
      await queryRunner.release();
    }

    if (tokenWasReused) {
      throw new UnauthorizedException(
        'Refresh token reuse detected; this session family has been revoked',
      );
    }
    if (!result) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    return result;
  }

  async logout(userId: string): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const user = await queryRunner.manager.findOne(User, {
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (user) {
        user.authVersion += 1;
        await queryRunner.manager.save(User, user);
        await queryRunner.manager.update(
          RefreshSession,
          { userId, revokedAt: IsNull() },
          { revokedAt: new Date() },
        );
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  toPublicUser(user: User): AuthenticatedUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };
  }

  hasActiveSessionFamily(familyId: string): Promise<boolean> {
    return this.refreshSessions.exists({
      where: {
        familyId,
        revokedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
    });
  }

  private async issueAuthResult(
    manager: EntityManager,
    user: User,
  ): Promise<AuthResult> {
    const refreshToken = randomBytes(32).toString('base64url');
    const familyId = randomUUID();
    const session = this.createSession(user.id, familyId, refreshToken);
    await manager.save(RefreshSession, session);
    return this.toAuthResult(user, refreshToken, familyId);
  }

  private createSession(
    userId: string,
    familyId: string,
    token: string,
  ): RefreshSession {
    const session = new RefreshSession();
    session.id = randomUUID();
    session.tokenHash = this.hashToken(token);
    session.userId = userId;
    session.familyId = familyId;
    session.expiresAt = new Date(
      Date.now() + this.config.refreshTokenTtlSeconds * 1000,
    );
    session.revokedAt = null;
    session.replacedBySessionId = null;
    return session;
  }

  private toAuthResult(
    user: User,
    refreshToken: string,
    familyId: string,
  ): AuthResult {
    return {
      accessToken: this.accessTokens.sign(user.id, user.authVersion, familyId),
      refreshToken,
      expiresIn: this.accessTokens.expiresIn,
      user: this.toPublicUser(user),
    };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private assertPasswordByteLength(password: string): void {
    if (Buffer.byteLength(password, 'utf8') > 72) {
      throw new BadRequestException('Password exceeds the supported length');
    }
  }

  private isDuplicateEmailError(error: unknown): boolean {
    return (
      error instanceof QueryFailedError &&
      'code' in error.driverError &&
      error.driverError.code === 'ER_DUP_ENTRY'
    );
  }
}
