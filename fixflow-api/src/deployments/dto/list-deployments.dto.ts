import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { DeploymentEnvironment } from '../deployment-environment.enum.js';
import { DeploymentStatus } from '../deployment-status.enum.js';

export class ListDeploymentsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  search?: string;

  @IsOptional()
  @IsEnum(DeploymentEnvironment)
  environment?: DeploymentEnvironment;

  @IsOptional()
  @IsEnum(DeploymentStatus)
  status?: DeploymentStatus;
}
