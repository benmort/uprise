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

  @IsOptional()
  @IsIn(["SMS", "WHATSAPP", "ALL"])
  channel?: "SMS" | "WHATSAPP" | "ALL";

  @IsOptional()
  @IsIn(["STATIC", "WHATSAPP_OPTED_IN"])
  kind?: "STATIC" | "WHATSAPP_OPTED_IN";
}

export class ListAudiencesDto extends PaginationDto {
  @IsOptional()
  @IsIn(["ACTIVE", "ARCHIVED"])
  status?: "ACTIVE" | "ARCHIVED";

  @IsOptional()
  @IsIn(["MANUAL", "CSV", "ACTION_NETWORK", "INTERNAL"])
  source?: "MANUAL" | "CSV" | "ACTION_NETWORK" | "INTERNAL";

  @IsOptional()
  @IsIn(["SMS", "WHATSAPP", "ALL"])
  channel?: "SMS" | "WHATSAPP" | "ALL";
}

export class AudienceContactsDto extends PaginationDto {
  @IsOptional()
  @IsString()
  query?: string;
}
