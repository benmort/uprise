import { IsArray, IsBoolean, IsEnum, IsObject, IsOptional, IsString } from "class-validator";
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
}

/** Set a campaign's boundary from a union of divisions / ASGS areas / drawn polygons. */
export class SetBoundaryDto {
  @IsArray()
  sources!: BoundarySource[];
}
