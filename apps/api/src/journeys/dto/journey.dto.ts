import { IsArray, IsEnum, IsInt, IsObject, IsOptional, IsString, Min } from "class-validator";
import { JourneyRungType, JourneyStatus, JourneyTriggerType } from "@uprise/db";

export class JourneyRungDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  rungIndex?: number;

  @IsEnum(JourneyRungType)
  type!: JourneyRungType;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

export class CreateJourneyDto {
  @IsString()
  name!: string;

  @IsEnum(JourneyTriggerType)
  triggerType!: JourneyTriggerType;

  @IsOptional()
  @IsObject()
  triggerConfig?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(0)
  reentryCooldownMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxActivePerContact?: number;

  @IsOptional()
  @IsArray()
  rungs?: JourneyRungDto[];
}

export class UpdateJourneyStatusDto {
  @IsEnum(JourneyStatus)
  status!: JourneyStatus;
}

export class UpdateJourneyDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(JourneyTriggerType)
  triggerType?: JourneyTriggerType;

  @IsOptional()
  @IsObject()
  triggerConfig?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(0)
  reentryCooldownMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxActivePerContact?: number;

  // When provided, replaces the journey's rungs transactionally.
  @IsOptional()
  @IsArray()
  rungs?: JourneyRungDto[];
}

export class DryRunJourneyDto {
  // Optional sample contact to evaluate condition rungs against. When omitted,
  // conditions are reported as not-evaluated and the path stops at the first one.
  @IsOptional()
  @IsString()
  contactId?: string;

  // Sample trigger payload (e.g. disposition code, survey answer) used to show
  // whether the journey's trigger config would match.
  @IsOptional()
  @IsObject()
  trigger?: Record<string, unknown>;
}
