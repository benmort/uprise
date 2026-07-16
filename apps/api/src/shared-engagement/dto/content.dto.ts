import { IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString } from "class-validator";
import { ContentObjectType, ContentSlot, ContentType } from "@uprise/db";

// ── Content bindings ─────────────────────────────────────────────────────────
export class CreateContentBindingDto {
  @IsEnum(ContentType) contentType!: ContentType;
  @IsString() contentId!: string;
  @IsEnum(ContentObjectType) objectType!: ContentObjectType;
  @IsString() objectId!: string;
  @IsOptional() @IsEnum(ContentSlot) slot?: ContentSlot;
  @IsOptional() @IsInt() orderIndex?: number;
}

// ── Disposition / canned sets ────────────────────────────────────────────────
export class SetItemDto {
  @IsString() id!: string; // dispositionDefId or cannedResponseId
  @IsOptional() @IsInt() orderIndex?: number;
}

export class CreateDispositionSetDto {
  @IsString() name!: string;
  @IsOptional() @IsArray() items?: SetItemDto[];
}

export class UpdateDispositionSetDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsBoolean() isArchived?: boolean;
  @IsOptional() @IsArray() items?: SetItemDto[];
}

export class CreateCannedSetDto {
  @IsString() name!: string;
  @IsOptional() @IsArray() items?: SetItemDto[];
}

export class UpdateCannedSetDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsBoolean() isArchived?: boolean;
  @IsOptional() @IsArray() items?: SetItemDto[];
}
