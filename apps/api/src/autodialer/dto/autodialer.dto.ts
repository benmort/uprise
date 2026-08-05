import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { PaginationDto } from "../../common/dto/pagination.dto";

export const DIALER_JURISDICTIONS = [
  "FEDERAL",
  "VIC",
  "NSW",
  "QLD",
  "SA",
  "WA",
  "TAS",
  "ACT",
  "NT",
] as const;
export type DialerJurisdiction = (typeof DIALER_JURISDICTIONS)[number];

/** Which chamber's member electoral targeting routes to. */
export const DIALER_OFFICE_TARGETS = ["electorate", "upper"] as const;

const DIALER_STATUSES = ["DRAFT", "ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED"] as const;

/** Behaviour filter values for the list view — the boolean matrix, named. */
export const DIALER_BEHAVIOURS = ["broadcast", "survey", "transfer", "electoral"] as const;
export type DialerBehaviour = (typeof DIALER_BEHAVIOURS)[number];

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

const DIALER_ANSWER_TYPES = ["SMS", "SET_LANGUAGE", "REDIRECT", "SWITCHBOARD"] as const;
const SUPPORT_LEVELS = [
  "STRONG_SUPPORT",
  "LEAN_SUPPORT",
  "UNDECIDED",
  "LEAN_OPPOSE",
  "STRONG_OPPOSE",
] as const;

export class CreateDialerCampaignDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsBoolean()
  outboundOnly?: boolean;

  @IsOptional()
  @IsBoolean()
  survey?: boolean;

  @IsOptional()
  @IsBoolean()
  electoralTarget?: boolean;

  @IsOptional()
  @IsBoolean()
  transparentTargetTransfer?: boolean;
}

/** An admin-pinned member: id-only civic ref + display snapshot. The id is
 *  re-validated and the office number re-resolved server-side at call time. */
export class PinnedPoliticianDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  id!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  party?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  electorate?: string | null;
}

export class UpdateDialerCampaignDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsBoolean()
  outboundOnly?: boolean;

  @IsOptional()
  @IsBoolean()
  publicVisible?: boolean;

  @IsOptional()
  @IsBoolean()
  survey?: boolean;

  @IsOptional()
  @IsBoolean()
  electoralTarget?: boolean;

  @IsOptional()
  @IsBoolean()
  transparentTargetTransfer?: boolean;

  @IsOptional()
  @IsString()
  audienceId?: string | null;

  @IsOptional()
  @Matches(HH_MM, { message: "dailyStart must be HH:MM (24h)" })
  dailyStart?: string;

  @IsOptional()
  @Matches(HH_MM, { message: "dailyFinish must be HH:MM (24h)" })
  dailyFinish?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(240)
  dialerPeriodMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(24 * 30)
  noCallWindowHours?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxCallAttempts?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  batchSize?: number;

  @IsOptional()
  @IsString()
  fromNumberId?: string | null;

  /** { name?, audio?: fileId | {lang: fileId} } — validated shape-lightly; the
   *  IVR resolves ids and falls back to <Say> of `name`. */
  @IsOptional()
  intro?: Record<string, unknown> | null;

  @IsOptional()
  outro?: Record<string, unknown> | null;

  @IsOptional()
  optOut?: Record<string, unknown> | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetNumbers?: string[] | null;

  /** Admin-pinned member snapshots: [{id, name, party?, electorate?}] (≤ 20). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => PinnedPoliticianDto)
  targetPoliticians?: PinnedPoliticianDto[] | null;

  @IsOptional()
  @IsBoolean()
  callerChoosesTarget?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  partyTargets?: string[] | null;

  @IsOptional()
  @IsIn(DIALER_JURISDICTIONS)
  jurisdiction?: DialerJurisdiction | null;

  @IsOptional()
  @IsIn(DIALER_OFFICE_TARGETS)
  officeTarget?: (typeof DIALER_OFFICE_TARGETS)[number] | null;

  @IsOptional()
  @IsBoolean()
  amdEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  recordingEnabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(12)
  defaultLanguage?: string;
}

export class QuestionGraphAnswerDto {
  @Matches(/^[0-9]$/, { message: "digit must be 0–9 (the * key is reserved for opt-out)" })
  digit!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  value!: string;

  /** Another question key, "outro", or null (hang up). */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  nextKey?: string | null;

  @IsOptional()
  @IsIn(DIALER_ANSWER_TYPES)
  type?: (typeof DIALER_ANSWER_TYPES)[number] | null;

  @IsOptional()
  @IsString()
  @MaxLength(640)
  content?: string | null;

  @IsOptional()
  @IsBoolean()
  transfer?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  dispositionCode?: string | null;

  @IsOptional()
  @IsIn(SUPPORT_LEVELS)
  supportLevel?: (typeof SUPPORT_LEVELS)[number] | null;
}

export class QuestionGraphNodeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  key!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  name!: string;

  @IsOptional()
  @IsIn(["STANDARD", "SWITCHBOARD"])
  type?: "STANDARD" | "SWITCHBOARD";

  @IsOptional()
  audioPrompt?: unknown;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionGraphAnswerDto)
  answers!: QuestionGraphAnswerDto[];
}

export class AuthoringQuestionDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  key?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  question!: string;

  @IsArray()
  @IsString({ each: true })
  options!: string[];

  @IsOptional()
  audioPrompt?: unknown;
}

/**
 * Full-graph put. Send EITHER `questions` (the full graph) OR `authoring` (the
 * simplified linear format, expanded server-side with sequential nextKey
 * defaults — the source transformSurveyQuestions semantics).
 */
export class UpsertQuestionGraphDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionGraphNodeDto)
  questions?: QuestionGraphNodeDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AuthoringQuestionDto)
  authoring?: AuthoringQuestionDto[];
}

/** Monitor recent-dials paging — plain pagination, newest first server-side. */
export class ListDialerAttemptsQueryDto extends PaginationDto {}

export class ListDialerCampaignsQueryDto extends PaginationDto {
  @IsOptional()
  @IsIn(DIALER_STATUSES)
  status?: (typeof DIALER_STATUSES)[number];

  @IsOptional()
  @IsIn(DIALER_BEHAVIOURS)
  behaviour?: DialerBehaviour;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
}
