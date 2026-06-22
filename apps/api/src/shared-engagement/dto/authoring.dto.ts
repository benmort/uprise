import { IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString } from "class-validator";
import { EngagementChannel, QuestionType, SupportLevel } from "@yarns/db";

// ── Surveys ────────────────────────────────────────────────────────────────
export class SurveyOptionDto {
  @IsString() value!: string;
  @IsString() label!: string;
  @IsOptional() @IsInt() orderIndex?: number;
  @IsOptional() @IsString() dispositionCode?: string;
  @IsOptional() @IsEnum(SupportLevel) supportLevel?: SupportLevel;
  @IsOptional() @IsString() cannedReplyText?: string;
}

export class SurveyQuestionDto {
  @IsString() prompt!: string;
  @IsEnum(QuestionType) type!: QuestionType;
  @IsOptional() @IsInt() orderIndex?: number;
  @IsOptional() @IsBoolean() required?: boolean;
  @IsOptional() @IsInt() scaleMin?: number;
  @IsOptional() @IsInt() scaleMax?: number;
  @IsOptional() @IsArray() options?: SurveyOptionDto[];
}

export class CreateSurveyDto {
  @IsString() name!: string;
  @IsOptional() @IsArray() questions?: SurveyQuestionDto[];
}

export class UpdateSurveyDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsArray() questions?: SurveyQuestionDto[];
}

// ── Scripts ────────────────────────────────────────────────────────────────
export class ScriptStepDto {
  @IsString() bodyText!: string;
  @IsOptional() @IsString() outcomeKey?: string;
  @IsOptional() @IsInt() orderIndex?: number;
}

export class CreateScriptDto {
  @IsString() name!: string;
  @IsOptional() @IsEnum(EngagementChannel) channel?: EngagementChannel;
  @IsOptional() @IsArray() steps?: ScriptStepDto[];
}

export class UpdateScriptDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsEnum(EngagementChannel) channel?: EngagementChannel;
  @IsOptional() @IsArray() steps?: ScriptStepDto[];
}
