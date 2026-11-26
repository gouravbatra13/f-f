import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { AlertsService } from './alerts.service.js';
import { CreateAlertRuleDto } from './dto/create-alert-rule.dto.js';
import { UpdateAlertRuleDto } from './dto/update-alert-rule.dto.js';

@Controller('organizations/:organizationId/alert-rules')
@UseGuards(JwtAuthGuard)
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Get()
  list(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.alerts.list(organizationId, user.id);
  }

  @Post()
  create(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAlertRuleDto,
  ) {
    return this.alerts.create(organizationId, user, dto);
  }

  @Patch(':ruleId')
  update(
    @Param('organizationId') organizationId: string,
    @Param('ruleId') ruleId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateAlertRuleDto,
  ) {
    return this.alerts.update(organizationId, ruleId, user.id, dto);
  }

  @Delete(':ruleId')
  archive(
    @Param('organizationId') organizationId: string,
    @Param('ruleId') ruleId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.alerts.archive(organizationId, ruleId, user.id);
  }
}
