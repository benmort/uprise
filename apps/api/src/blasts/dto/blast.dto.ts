import {
  IsDateString,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";
import { PaginationDto } from "../../common/dto/pagination.dto";

const CHANNELS = ["SMS", "WHATSAPP"] as const;

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

  @IsOptional()
  @IsIn(CHANNELS)
  channel?: (typeof CHANNELS)[number];

  /** WhatsApp: approved Content template SID (HX...). */
  @IsOptional()
  @IsString()
  contentSid?: string;

  /** WhatsApp: template slot -> personalization key, e.g. { "1": "first_name" }. */
  @IsOptional()
  @IsObject()
  contentVariableMap?: Record<string, string>;

  /** Chosen provisioned number (TelephonyPhoneNumber id); resolved at send time. */
  @IsOptional()
  @IsString()
  fromNumberId?: string;
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

  @IsOptional()
  @IsIn(CHANNELS)
  channel?: (typeof CHANNELS)[number];

  @IsOptional()
  @IsString()
  contentSid?: string;

  @IsOptional()
  @IsObject()
  contentVariableMap?: Record<string, string>;

  @IsOptional()
  @IsString()
  fromNumberId?: string;
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
