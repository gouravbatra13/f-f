import { IsUUID } from 'class-validator';

export class LinkIssueDto {
  @IsUUID()
  issueId!: string;
}
