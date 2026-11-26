import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class KnowledgeSearchDto {
  @IsUUID()
  organizationId!: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsString()
  @MaxLength(2000)
  query!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  similarityThreshold?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsInt()
  @Min(1)
  @Max(10)
  limit?: number;
}
