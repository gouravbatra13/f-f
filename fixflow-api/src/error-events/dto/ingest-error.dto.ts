import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { IssueSeverity } from '../../issues/issue-severity.enum.js';

export class IngestErrorDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  message!: string;

  @IsOptional()
  @IsString()
  @MaxLength(16000)
  stackTrace?: string;

  @IsEnum(IssueSeverity)
  severity!: IssueSeverity;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  environment?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  release?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  endpoint?: string;

  @IsOptional()
  @IsDateString()
  timestamp?: string;

  @IsOptional()
  @IsObject()
  @Type(() => Object)
  metadata?: Record<string, unknown>;
}
