import { Transform } from "class-transformer";
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";

function toIntOr(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export class PaginationDto {
  @IsOptional()
  @Transform(({ value }) => toIntOr(value, 25))
  @IsInt()
  @Min(1)
  @Max(200)
  limit = 25;

  @IsOptional()
  @Transform(({ value }) => toIntOr(value, 0))
  @IsInt()
  @Min(0)
  offset = 0;
}

export class SearchDto extends PaginationDto {
  @IsOptional()
  @IsString()
  query?: string;
}
