import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { AssignIssueDto } from './dto/assign-issue.dto.js';
import { CreateIssueCommentDto } from './dto/create-issue-comment.dto.js';
import { ListIssuesDto } from './dto/list-issues.dto.js';
import { UpdateIssueStatusDto } from './dto/update-issue-status.dto.js';
import { IssuesService } from './issues.service.js';

@Controller('issues')
@UseGuards(JwtAuthGuard)
export class IssuesController {
  constructor(private readonly issues: IssuesService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() filters: ListIssuesDto,
  ) {
    return this.issues.list(user.id, filters);
  }

  @Get(':issueId')
  get(
    @Param('issueId') issueId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.issues.getById(issueId, user.id);
  }

  @Patch(':issueId/assignment')
  assign(
    @Param('issueId') issueId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AssignIssueDto,
  ) {
    return this.issues.assign(issueId, user, dto);
  }

  @Patch(':issueId/status')
  updateStatus(
    @Param('issueId') issueId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateIssueStatusDto,
  ) {
    return this.issues.updateStatus(issueId, user, dto);
  }

  @Post(':issueId/comments')
  addComment(
    @Param('issueId') issueId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateIssueCommentDto,
  ) {
    return this.issues.addComment(issueId, user, dto);
  }
}
