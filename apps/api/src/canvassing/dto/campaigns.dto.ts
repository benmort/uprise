import { IsArray, IsBoolean, IsEnum, IsIn, IsInt, IsObject, IsOptional, IsString } from "class-validator";
import { CanvassCampaignStatus, EngagementChannel } from "@uprise/db";
import type { BoundarySource } from "../../geo/geo.service";

export class CreateCampaignDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsEnum(CanvassCampaignStatus)
  status?: CanvassCampaignStatus;

  /** Outreach medium — door-knock, SMS, or both. */
  @IsOptional()
  @IsEnum(EngagementChannel)
  channel?: EngagementChannel;

  @IsOptional()
  @IsString()
  surveyId?: string;

  @IsOptional()
  @IsString()
  scriptId?: string;

  @IsOptional()
  @IsObject()
  goals?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  openJoinEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  volunteerCanSelfClaimTurf?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  selfClaimModes?: string[];

  /** Organiser-set rank; lower = higher priority (1 = top). */
  @IsOptional()
  @IsInt()
  priority?: number;
}

export class UpdateCampaignDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(CanvassCampaignStatus)
  status?: CanvassCampaignStatus;

  @IsOptional()
  @IsEnum(EngagementChannel)
  channel?: EngagementChannel;

  @IsOptional()
  @IsString()
  surveyId?: string;

  @IsOptional()
  @IsString()
  scriptId?: string;

  @IsOptional()
  @IsObject()
  goals?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  openJoinEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  volunteerCanSelfClaimTurf?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  selfClaimModes?: string[];

  @IsOptional()
  @IsInt()
  priority?: number;
}

/** Set a campaign's boundary from a union of divisions / ASGS areas / drawn polygons. */
export class SetBoundaryDto {
  @IsArray()
  sources!: BoundarySource[];
}

/** Targeting heat-map configuration (validated shape of CanvassCampaign.heatConfig). */
export class HeatConfigDto {
  @IsOptional()
  @IsIn(["persuasion", "gotv", "coverage"])
  preset?: "persuasion" | "gotv" | "coverage";

  /** Partial factor-weight overrides { doors, persuadability, supporter, fit, efficiency, freshness }. */
  @IsOptional()
  @IsObject()
  weights?: Record<string, number>;

  /** { pollId, questionCode, responseLabel, geoKind? } — the poll signal to smear. */
  @IsOptional()
  @IsObject()
  pollRef?: { pollId: string; questionCode: string; responseLabel: string; geoKind?: string } | null;

  @IsOptional()
  @IsArray()
  alignedPartyCodes?: string[];

  @IsOptional()
  electionId?: string | null;

  /** { indicator, target?, span? } — the demographic fit lens. */
  @IsOptional()
  @IsObject()
  fitLens?: { indicator: string; target?: number; span?: number } | null;

  /** { indicator, target?, span? } — the community lens (defaults: CALD share, higher = hotter). */
  @IsOptional()
  @IsObject()
  communityLens?: { indicator: string; target?: number; span?: number } | null;
}

/** Boundary-editor targeting preview: score an ad-hoc union of sources, no campaign. */
export class HeatPreviewDto {
  @IsArray()
  sources!: BoundarySource[];

  @IsOptional()
  @IsObject()
  config?: HeatConfigDto;
}
