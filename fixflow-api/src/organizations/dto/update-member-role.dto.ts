import { IsEnum } from 'class-validator';
import { OrganizationRole } from '../organization-role.enum.js';

export class UpdateMemberRoleDto {
  @IsEnum(OrganizationRole)
  role!: OrganizationRole;
}
