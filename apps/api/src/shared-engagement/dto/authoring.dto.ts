import { IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString } from "class-validator";
import { EngagementChannel, QuestionType, SupportLevel } from "@uprise/db";

// ── Surveys ────────────────────────────────────────────────────────────────
export class SurveyOptionDto {
  @IsString() value!: string;
  @IsString() label!: string;
  @IsOptional() @IsInt() orderIndex?: number;
  @IsOptional() @IsString() dispositionCode?: string;
  @IsOptional() @IsEnum(SupportLevel) supportLevel?: SupportLevel;
  @IsOptional() @IsString() cannedReplyText?: string;
  // Branching: jump to this question key, or end the survey.
  @IsOptional() @IsString() nextQuestionKey?: string;
  @IsOptional() @IsBoolean() isTerminal?: boolean;
}

export class SurveyQuestionDto {
  // Stable key for branch edges (client-assigned; generated when absent).
  @IsOptional() @IsString() key?: string;
  @IsString() prompt!: string;
  @IsEnum(QuestionType) type!: QuestionType;
  @IsOptional() @IsInt() orderIndex?: number;
  @IsOptional() @IsBoolean() required?: boolean;
  @IsOptional() @IsInt() scaleMin?: number;
  @IsOptional() @IsInt() scaleMax?: number;
  @IsOptional() @IsString() defaultNextQuestionKey?: string;
  @IsOptional() @IsArray() options?: SurveyOptionDto[];
}

export class CreateSurveyDto {
  @IsString() name!: string;
  @IsOptional() @IsString() entryQuestionKey?: string;
  @IsOptional() @IsBoolean() opensAfterDisposition?: boolean;
  @IsOptional() @IsArray() questions?: SurveyQuestionDto[];
}

export class UpdateSurveyDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() entryQuestionKey?: string;
  @IsOptional() @IsBoolean() opensAfterDisposition?: boolean;
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
