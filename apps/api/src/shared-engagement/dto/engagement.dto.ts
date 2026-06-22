import { IsBoolean, IsEnum, IsInt, IsOptional, IsString } from "class-validator";
import { CannedVisibility, EngagementChannel, SupportLevel } from "@yarns/db";

export class RecordDispositionDto {
  @IsString()
  contactId!: string;

  @IsString()
  code!: string;

  @IsEnum(EngagementChannel)
  channel!: EngagementChannel;

  @IsOptional()
  @IsString()
  campaignId?: string;

  @IsOptional()
  @IsString()
  blastId?: string;

  @IsOptional()
  @IsString()
  scriptStepId?: string;

  @IsOptional()
  @IsEnum(SupportLevel)
  supportLevel?: SupportLevel;

  @IsOptional()
  @IsString()
  recordedById?: string;
}

export class RecordSurveyAnswerDto {
  @IsString()
  contactId!: string;

  @IsString()
  questionId!: string;

  @IsOptional()
  @IsString()
  optionId?: string;

  @IsOptional()
  @IsString()
  valueText?: string;

  @IsEnum(EngagementChannel)
  channel!: EngagementChannel;

  @IsOptional()
  @IsString()
  campaignId?: string;

  @IsOptional()
  @IsString()
  blastId?: string;

  @IsOptional()
  @IsString()
  recordedById?: string;
}

export class CreateCannedResponseDto {
  @IsString()
  title!: string;

  @IsString()
  body!: string;

  @IsOptional()
  @IsEnum(EngagementChannel)
  channel?: EngagementChannel;

  @IsOptional()
  @IsEnum(CannedVisibility)
  visibility?: CannedVisibility;

  @IsOptional()
  @IsString()
  ownerId?: string;

  @IsOptional()
  @IsString()
  dispositionCode?: string;

  @IsOptional()
  @IsString()
  surveyOptionId?: string;
}

export class CreateDispositionDefDto {
  @IsString()
  code!: string;

  @IsString()
  label!: string;

  @IsOptional()
  @IsEnum(EngagementChannel)
  channel?: EngagementChannel;

  @IsOptional()
  @IsInt()
  orderIndex?: number;
}

export class UpdateDispositionDefDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsEnum(EngagementChannel)
  channel?: EngagementChannel;

  @IsOptional()
  @IsInt()
  orderIndex?: number;
}

export class UpdateCannedResponseDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsEnum(EngagementChannel)
  channel?: EngagementChannel;

  @IsOptional()
  @IsEnum(CannedVisibility)
  visibility?: CannedVisibility;

  @IsOptional()
  @IsString()
  ownerId?: string;

  @IsOptional()
  @IsString()
  dispositionCode?: string;
}

export class UseCannedResponseDto {
  @IsString()
  cannedResponseId!: string;

  @IsString()
  contactId!: string;

  @IsOptional()
  @IsEnum(EngagementChannel)
  channel?: EngagementChannel;
}
