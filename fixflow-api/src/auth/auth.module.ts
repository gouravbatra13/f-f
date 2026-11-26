import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { UsersModule } from '../users/users.module.js';
import { User } from '../users/user.entity.js';
import { RefreshSession } from './refresh-session.entity.js';
import { AccessTokenService } from './access-token.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { RolesGuard } from './roles.guard.js';

@Module({
  imports: [
    UsersModule,
    TypeOrmModule.forFeature([User, RefreshSession]),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
  ],
  controllers: [AuthController],
  providers: [AccessTokenService, AuthService, JwtAuthGuard, RolesGuard],
  exports: [AccessTokenService, AuthService, RolesGuard],
})
export class AuthModule {}
