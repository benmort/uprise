import { Transform } from "class-transformer";
import { IsEnum, IsISO8601, IsOptional, IsString, MaxLength } from "class-validator";
import { CallStatus } from "@uprise/db";
import { PaginationDto } from "../../common/dto/pagination.dto";

/**
 * Filters for the transactional-calls listing (`GET /calls`). `status` accepts a
 * comma-separated list (`?status=COMPLETED,FAILED`); `from`/`to` bound createdAt;
 * `search` matches the to/from number. Pagination (limit/offset) is inherited.
 */
export class ListCallsDto extends PaginationDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.split(",").filter(Boolean) : value))
  @IsEnum(CallStatus, { each: true })
  status?: CallStatus[];

  @IsOptional()
  @IsString()
  @MaxLength(64)
  contactId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  search?: string;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}

export class InitiateCallDto {
  @IsString()
  @MaxLength(20)
  toNumber!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  fromNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  contactId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8192)
  twiml?: string;
}
