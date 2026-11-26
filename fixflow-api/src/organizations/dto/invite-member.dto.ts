import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, MaxLength } from 'class-validator';
import { OrganizationRole } from '../organization-role.enum.js';

export class InviteMemberDto {
  @IsEmail()
  @MaxLength(255)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email!: string;

  @IsEnum(OrganizationRole)
  role!: OrganizationRole;
}
