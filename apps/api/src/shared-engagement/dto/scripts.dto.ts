import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { EngagementChannel } from "@yarns/db";

export class ScriptStepInputDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsString()
  parentStepId?: string | null;

  @IsOptional()
  @IsString()
  outcomeKey?: string | null;

  @IsString()
  bodyText!: string;

  @IsOptional()
  @IsInt()
  orderIndex?: number;
}

export class CreateScriptDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsEnum(EngagementChannel)
  channel?: EngagementChannel;

  @IsOptional()
  @IsString()
  campaignId?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScriptStepInputDto)
  steps?: ScriptStepInputDto[];
}

export class UpdateScriptDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(EngagementChannel)
  channel?: EngagementChannel;

  @IsOptional()
  @IsString()
  campaignId?: string | null;

  @IsOptional()
  @IsBoolean()
  isArchived?: boolean;

  // When provided, the step tree is replaced wholesale with this set.
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScriptStepInputDto)
  steps?: ScriptStepInputDto[];
}
