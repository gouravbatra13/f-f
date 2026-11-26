import { IsEnum } from 'class-validator';
import { IssueStatus } from '../issue-status.enum.js';

export class UpdateIssueStatusDto {
  @IsEnum(IssueStatus)
  status!: IssueStatus;
}
