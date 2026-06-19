import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

export class SurveyAnswerDto {
  @IsString()
  questionId!: string;

  @IsOptional()
  @IsString()
  optionId?: string;

  @IsOptional()
  @IsString()
  valueText?: string;
}

export class CreateTurfDto {
  @IsString()
  name!: string;

  @IsObject()
  geometry!: Record<string, unknown>; // GeoJSON Polygon / MultiPolygon

  @IsOptional()
  @IsString()
  campaignId?: string;
}

export class CreateWalkListDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  turfId?: string;

  @IsOptional()
  @IsString()
  campaignId?: string;

  @IsArray()
  @IsString({ each: true })
  contactIds!: string[];

  @IsOptional()
  @IsIn(["STATIC", "DYNAMIC"])
  listType?: "STATIC" | "DYNAMIC";
}

export class UpdateTurfDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsObject()
  geometry?: Record<string, unknown>; // GeoJSON Polygon / MultiPolygon
}

export class AssignTurfDto {
  @IsString()
  turfId!: string;

  @IsString()
  canvasserId!: string;

  @IsOptional()
  @IsString()
  lockedUntil?: string;
}

export class ReleaseTurfDto {
  @IsString()
  canvasserId!: string;
}

export class CreateCanvasserDto {
  @IsString()
  displayName!: string;

  @IsString()
  email!: string;

  @IsString()
  password!: string;

  @IsOptional()
  @IsIn(["ORGANISER", "CANVASSER"])
  role?: "ORGANISER" | "CANVASSER";
}

export class RecordDoorKnockDto {
  @IsString()
  contactId!: string;

  @IsString()
  canvasserId!: string;

  @IsString()
  localId!: string;

  @IsOptional()
  @IsString()
  dispositionCode?: string;

  @IsOptional()
  @IsNumber()
  lat?: number;

  @IsOptional()
  @IsNumber()
  lng?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  clientCapturedAt?: string;

  @IsOptional()
  @IsString()
  walkListItemId?: string;

  @IsOptional()
  @IsString()
  photoUrl?: string;

  @IsOptional()
  @IsBoolean()
  safetyFlag?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SurveyAnswerDto)
  surveyAnswers?: SurveyAnswerDto[];
}

export class CreateDoorContactDto {
  @IsString()
  canvasserId!: string;

  @IsString()
  turfId!: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  phoneE164?: string;

  @IsOptional()
  @IsNumber()
  lat?: number;

  @IsOptional()
  @IsNumber()
  lng?: number;
}

export class CreateTurfFromDivisionDto {
  @IsIn(["ced", "sed", "lga"])
  type!: "ced" | "sed" | "lga";

  @IsString()
  code!: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  campaignId?: string;

  @IsOptional()
  @IsIn(["existing", "none", "hybrid"])
  universe?: "existing" | "none" | "hybrid";
}

export class LoadUniverseDto {
  @IsIn(["existing", "none", "hybrid"])
  universe!: "existing" | "none" | "hybrid";

  @IsOptional()
  @IsNumber()
  limit?: number;
}

export class CreateShiftDto {
  @IsString()
  campaignId!: string;

  @IsString()
  name!: string;

  @IsString()
  startsAt!: string;

  @IsString()
  endsAt!: string;

  @IsOptional()
  @IsString()
  location?: string;
}
