import { IsIn, IsNumber, IsString } from "class-validator";

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
