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
  volunteerId!: string;

  @IsOptional()
  @IsString()
  lockedUntil?: string;
}

export class ReleaseTurfDto {
  @IsString()
  volunteerId!: string;
}

/** Organiser reassigns a turf to a different volunteer (release current + assign new). */
export class ReassignTurfDto {
  @IsString()
  volunteerId!: string;
}

/** Organiser actions a computed QA flag. `resolved: false` clears a prior resolution. */
export class ResolveQaFlagDto {
  @IsString()
  doorKnockId!: string;

  @IsIn(["NO_GPS", "FAST_CADENCE"])
  kind!: "NO_GPS" | "FAST_CADENCE";

  @IsOptional()
  @IsBoolean()
  resolved?: boolean;

  @IsOptional()
  @IsIn(["RESOLVED", "DISMISSED"])
  state?: "RESOLVED" | "DISMISSED";

  @IsOptional()
  @IsString()
  note?: string;
}

export class CreateVolunteerDto {
  @IsString()
  displayName!: string;

  @IsString()
  email!: string;

  @IsString()
  password!: string;

  @IsOptional()
  @IsIn(["ORGANISER", "VOLUNTEER"])
  role?: "ORGANISER" | "VOLUNTEER";
}

export class RecordDoorKnockDto {
  @IsString()
  contactId!: string;

  @IsString()
  volunteerId!: string;

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
  volunteerId!: string;

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

export class TurfAreaDto {
  @IsIn(["mb", "sa1", "sa2", "sa3", "sa4"])
  layer!: "mb" | "sa1" | "sa2" | "sa3" | "sa4";

  @IsString()
  code!: string;
}

export class CreateTurfFromAreasDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  campaignId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TurfAreaDto)
  areas!: TurfAreaDto[];

  // Free-drawn polygons unioned in alongside the selected areas.
  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  polygons?: Record<string, unknown>[];

  @IsOptional()
  @IsIn(["existing", "none", "hybrid"])
  universe?: "existing" | "none" | "hybrid";
}

export class TurfDivisionDto {
  // "ste" = a whole state/territory (derived geo.state layer).
  @IsIn(["ced", "sed", "lga", "ste"])
  type!: "ced" | "sed" | "lga" | "ste";

  @IsString()
  code!: string;
}

/** Cut one turf from a stacked "my turf" basket: any mix of divisions, areas,
 *  drawn polygons and individually-picked G-NAF doors. */
export class CreateTurfFromSourcesDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  campaignId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TurfDivisionDto)
  divisions?: TurfDivisionDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TurfAreaDto)
  areas?: TurfAreaDto[];

  // Free-drawn polygons unioned in alongside the areas/divisions.
  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  polygons?: Record<string, unknown>[];

  // Individually-picked door PIDs — buffered into the boundary server-side.
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  gnafPids?: string[];

  @IsOptional()
  @IsIn(["existing", "none", "hybrid"])
  universe?: "existing" | "none" | "hybrid";
}

// ── Volunteer self-serve turf ────────────────────────────────────────
export class ClaimAreaDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TurfAreaDto)
  areas!: TurfAreaDto[];
}

export class ClaimDrawDto {
  @IsObject()
  polygon!: Record<string, unknown>;
}

export class ClaimTurfDto {
  @IsString()
  turfId!: string;
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

export class UpdateShiftDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  startsAt?: string;

  @IsOptional()
  @IsString()
  endsAt?: string;
}

export class UpdateWalkListDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn(["STATIC", "DYNAMIC"])
  listType?: "STATIC" | "DYNAMIC";
}

export class UpdateVolunteerDto {
  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsIn(["ORGANISER", "VOLUNTEER"])
  role?: "ORGANISER" | "VOLUNTEER";

  @IsOptional()
  @IsString()
  password?: string;
}
