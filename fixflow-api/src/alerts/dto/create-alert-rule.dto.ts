import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { AlertEnvironment } from '../alert-environment.enum.js';
import { AlertRuleType } from '../alert-rule-type.enum.js';

export class CreateAlertRuleDto {
  @IsOptional()
  @IsUUID()
  projectId?: string | null;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsEnum(AlertRuleType)
  type!: AlertRuleType;

  @IsOptional()
  @IsEnum(AlertEnvironment)
  environment?: AlertEnvironment | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  thresholdCount?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  windowMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1440)
  cooldownMinutes?: number;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}
