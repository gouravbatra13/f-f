import { IsUUID, ValidateIf } from 'class-validator';

export class AssignIssueDto {
  @ValidateIf((_object, value) => value !== null)
  @IsUUID()
  assigneeUserId!: string | null;
}
