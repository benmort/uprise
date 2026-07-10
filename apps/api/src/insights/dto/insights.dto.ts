import { IsBoolean, IsIn, IsNumber, IsString } from "class-validator";

/** Toggle a poll's cross-tenant visibility. */
export class SetPollPublicDto {
  @IsBoolean()
  public!: boolean;
}

/** Resolve a poll threshold to geo codes for targeting (turf / segment). */
export class ResolveThresholdDto {
  @IsString()
  pollId!: string;

  @IsString()
  questionCode!: string;

  @IsString()
  response!: string;

  @IsIn([">", ">=", "<", "<=", "="])
  op!: ">" | ">=" | "<" | "<=" | "=";

  @IsNumber()
  value!: number;

  @IsString()
  geoKind!: string;
}
