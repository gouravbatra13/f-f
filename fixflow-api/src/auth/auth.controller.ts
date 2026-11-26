import {
  Body,
  Controller,
  Get,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { AuthConfig } from '../config/auth.config.js';
import { AuthService } from './auth.service.js';
import type { AuthenticatedUser, AuthResult } from './auth.types.js';
import { CurrentUser } from './current-user.decorator.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { Roles } from './roles.decorator.js';
import { RolesGuard } from './roles.guard.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { UserRole } from '../users/user-role.enum.js';

const REFRESH_COOKIE_NAME = 'fixflow_refresh';

@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  private readonly authConfig: AuthConfig;
  private readonly cookiePath: string;
  private readonly webOrigin: string;

  constructor(
    private readonly authService: AuthService,
    configService: ConfigService,
  ) {
    this.authConfig = configService.getOrThrow<AuthConfig>('auth');
    this.cookiePath = `/${configService.getOrThrow<string>('apiPrefix')}/auth`;
    this.webOrigin = configService.getOrThrow<string>('webOrigin');
  }

  @Post('register')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async register(
    @Body() dto: RegisterDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.assertTrustedOrigin(request);
    const result = await this.authService.register(dto);
    this.setRefreshCookie(response, result);
    return this.toResponse(result);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.assertTrustedOrigin(request);
    const result = await this.authService.login(dto);
    this.setRefreshCookie(response, result);
    return this.toResponse(result);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.assertTrustedOrigin(request);
    const token = request.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
    if (!token) {
      throw new UnauthorizedException('Refresh token is required');
    }

    try {
      const result = await this.authService.refresh(token);
      this.setRefreshCookie(response, result);
      return this.toResponse(result);
    } catch (error) {
      this.clearRefreshCookie(response);
      throw error;
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    this.assertTrustedOrigin(request);
    await this.authService.logout(user.id);
    this.clearRefreshCookie(response);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getProfile(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }

  @Get('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  getAdminProfile(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }

  private toResponse(result: AuthResult) {
    return {
      accessToken: result.accessToken,
      tokenType: 'Bearer',
      expiresIn: result.expiresIn,
      user: result.user,
    };
  }

  private setRefreshCookie(response: Response, result: AuthResult): void {
    response.cookie(REFRESH_COOKIE_NAME, result.refreshToken, {
      httpOnly: true,
      secure: this.authConfig.cookieSecure,
      sameSite: 'lax',
      path: this.cookiePath,
      maxAge: this.authConfig.refreshTokenTtlSeconds * 1000,
    });
  }

  private clearRefreshCookie(response: Response): void {
    response.clearCookie(REFRESH_COOKIE_NAME, {
      httpOnly: true,
      secure: this.authConfig.cookieSecure,
      sameSite: 'lax',
      path: this.cookiePath,
    });
  }

  private assertTrustedOrigin(request: Request): void {
    const origin = request.get('origin');
    if (origin && origin !== this.webOrigin) {
      throw new ForbiddenException('Request origin is not allowed');
    }
  }
}
