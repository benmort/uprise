import { Type } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

export class UpsertIntegrationConnectionDto {
  @IsIn(["ACTION_NETWORK", "NATION_BUILDER", "INTERNAL"])
  type!: "ACTION_NETWORK" | "NATION_BUILDER" | "INTERNAL";

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsString()
  apiKey?: string;

  @IsOptional()
  @IsString()
  baseUrl?: string;

  /**
   * Provider-side group this credential belongs to (Action Network issues one API key
   * per group). Distinct groups are distinct connections; blank joins the "" upsert key.
   */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  group?: string;
}

/** Disconnect / reconnect a connection by flipping its status. */
export class UpdateConnectionStatusDto {
  @IsIn(["ACTIVE", "INACTIVE"])
  status!: "ACTIVE" | "INACTIVE";
}

/** Blank apiKey + a connectionId tests the stored credential; a supplied apiKey tests that. */
export class TestIntegrationConnectionDto {
  @IsIn(["ACTION_NETWORK", "NATION_BUILDER", "INTERNAL"])
  type!: "ACTION_NETWORK" | "NATION_BUILDER" | "INTERNAL";

  @IsOptional()
  @IsString()
  apiKey?: string;

  @IsOptional()
  @IsString()
  baseUrl?: string;

  @IsOptional()
  @IsString()
  connectionId?: string;
}

export class SearchIntegrationListsDto {
  @IsIn(["ACTION_NETWORK", "NATION_BUILDER", "INTERNAL"])
  type!: "ACTION_NETWORK" | "NATION_BUILDER" | "INTERNAL";

  @IsOptional()
  @IsString()
  query?: string;

  // Pin the exact connection to read through. Omitted ⇒ the tenant's own active
  // connection for `type`. There is no platform-wide fallback.
  @IsOptional()
  @IsString()
  connectionId?: string;

  // Browse the provider's lists (default) or its tags — NationBuilder organisers
  // mostly slice their nation by tag. Ignored by providers without tags.
  @IsOptional()
  @IsIn(["lists", "tags"])
  kind?: "lists" | "tags";
}

export class DataSyncPullSettingsDto {
  @IsOptional()
  @IsBoolean()
  importTags?: boolean;

  @IsOptional()
  @IsBoolean()
  autoRefreshEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(168)
  autoRefreshIntervalHours?: number;
}

export class DataSyncPushStreamsDto {
  @IsOptional()
  @IsBoolean()
  dispositions?: boolean;

  @IsOptional()
  @IsBoolean()
  surveyAnswers?: boolean;

  @IsOptional()
  @IsBoolean()
  tags?: boolean;

  @IsOptional()
  @IsBoolean()
  textReplies?: boolean;

  @IsOptional()
  @IsBoolean()
  rsvps?: boolean;
}

export class DataSyncPushSettingsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => DataSyncPushStreamsDto)
  streams?: DataSyncPushStreamsDto;

  @IsOptional()
  @IsBoolean()
  supportLevelsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  createMissingPeople?: boolean;

  @IsOptional()
  @IsString()
  tagPrefix?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  nbSenderId?: number | null;
}

/** PATCH /integrations/connections/:id/settings — partial; absent fields keep their
 *  stored value. `supportLevelRequiresConsent` is deliberately NOT accepted: the per-row
 *  consent gate on pushed support levels is not configurable off (APP 3). */
export class UpdateConnectionDataSyncDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => DataSyncPullSettingsDto)
  pull?: DataSyncPullSettingsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => DataSyncPushSettingsDto)
  push?: DataSyncPushSettingsDto;
}

export class SampleIntegrationListDto {
  @IsIn(["ACTION_NETWORK", "NATION_BUILDER", "INTERNAL"])
  type!: "ACTION_NETWORK" | "NATION_BUILDER" | "INTERNAL";

  @IsString()
  listId!: string;

  @IsOptional()
  @IsString()
  connectionId?: string;
}

export class SyncIntegrationListDto {
  @IsIn(["ACTION_NETWORK", "NATION_BUILDER", "INTERNAL"])
  type!: "ACTION_NETWORK" | "NATION_BUILDER" | "INTERNAL";

  @IsString()
  listId!: string;

  @IsString()
  audienceName!: string;

  @IsOptional()
  @IsString()
  listName?: string;

  @IsOptional()
  @IsString()
  query?: string;

  @IsOptional()
  @IsString()
  connectionId?: string;
}
