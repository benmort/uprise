import {
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";
import { PaginationDto } from "../../common/dto/pagination.dto";

export class CreateBlastDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  title!: string;

  @IsOptional()
  @IsString()
  audienceId?: string;

  @IsString()
  @MinLength(1)
  bodyTemplate!: string;
}

export class UpdateBlastDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  audienceId?: string;

  @IsOptional()
  @IsString()
  bodyTemplate?: string;
}

export class ProofBlastDto {
  @IsOptional()
  sampleRecipients?: Array<Record<string, unknown>>;

  @IsOptional()
  @IsString()
  proofNumber?: string;
}

export class ScheduleBlastDto {
  @IsDateString()
  scheduledFor!: string;
}

export class ListBlastsDto extends PaginationDto {}
