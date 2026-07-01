import { IsBoolean, IsEnum, IsObject, IsOptional, IsString } from "class-validator";
import { CanvassCampaignStatus } from "@uprise/db";

export class CreateCampaignDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsEnum(CanvassCampaignStatus)
  status?: CanvassCampaignStatus;

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
}

export class UpdateCampaignDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(CanvassCampaignStatus)
  status?: CanvassCampaignStatus;

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
}
