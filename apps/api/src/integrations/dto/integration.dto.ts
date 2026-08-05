import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

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
