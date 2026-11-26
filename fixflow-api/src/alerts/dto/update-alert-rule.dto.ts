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

export class UpdateAlertRuleDto {
  @IsOptional()
  @IsUUID()
  projectId?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsEnum(AlertEnvironment)
  environment?: AlertEnvironment | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  thresholdCount?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  windowMinutes?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1440)
  cooldownMinutes?: number;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}
