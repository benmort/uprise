import { IsEnum, IsObject, IsOptional, IsString } from "class-validator";
import { CanvassCampaignStatus } from "../../../src/generated/prisma";

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
}
