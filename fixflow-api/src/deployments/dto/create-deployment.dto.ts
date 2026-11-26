import {
  IsDateString,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { DeploymentEnvironment } from '../deployment-environment.enum.js';
import { DeploymentStatus } from '../deployment-status.enum.js';

export class CreateDeploymentDto {
  @IsEnum(DeploymentEnvironment)
  environment!: DeploymentEnvironment;

  @IsString()
  @MinLength(1)
  @MaxLength(150)
  release!: string;

  @IsOptional()
  @IsEnum(DeploymentStatus)
  status?: DeploymentStatus;

  @IsOptional()
  @IsDateString()
  deployedAt?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-fA-F0-9]{7,64}$/)
  commitHash?: string | null;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;
}
