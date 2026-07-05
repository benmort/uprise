import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class UpsertIntegrationConnectionDto {
  @IsIn(["ACTION_NETWORK", "INTERNAL"])
  type!: "ACTION_NETWORK" | "INTERNAL";

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
}

/** Disconnect / reconnect a connection by flipping its status. */
export class UpdateConnectionStatusDto {
  @IsIn(["ACTIVE", "INACTIVE"])
  status!: "ACTIVE" | "INACTIVE";
}

export class TestIntegrationConnectionDto {
  @IsIn(["ACTION_NETWORK", "INTERNAL"])
  type!: "ACTION_NETWORK" | "INTERNAL";

  @IsOptional()
  @IsString()
  apiKey?: string;

  @IsOptional()
  @IsString()
  baseUrl?: string;
}

export class SearchIntegrationListsDto {
  @IsIn(["ACTION_NETWORK", "INTERNAL"])
  type!: "ACTION_NETWORK" | "INTERNAL";

  @IsOptional()
  @IsString()
  query?: string;
}

export class SampleIntegrationListDto {
  @IsIn(["ACTION_NETWORK", "INTERNAL"])
  type!: "ACTION_NETWORK" | "INTERNAL";

  @IsString()
  listId!: string;
}

export class SyncIntegrationListDto {
  @IsIn(["ACTION_NETWORK", "INTERNAL"])
  type!: "ACTION_NETWORK" | "INTERNAL";

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
}
