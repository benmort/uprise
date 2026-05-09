import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { PaginationDto } from "../../common/dto/pagination.dto";

export class CreateAudienceDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsIn(["MANUAL", "CSV", "ACTION_NETWORK", "INTERNAL"])
  source?: "MANUAL" | "CSV" | "ACTION_NETWORK" | "INTERNAL";
}

export class ListAudiencesDto extends PaginationDto {
  @IsOptional()
  @IsIn(["ACTIVE", "ARCHIVED"])
  status?: "ACTIVE" | "ARCHIVED";

  @IsOptional()
  @IsIn(["MANUAL", "CSV", "ACTION_NETWORK", "INTERNAL"])
  source?: "MANUAL" | "CSV" | "ACTION_NETWORK" | "INTERNAL";
}

export class AudienceContactsDto extends PaginationDto {
  @IsOptional()
  @IsString()
  query?: string;
}
