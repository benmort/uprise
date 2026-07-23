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

  /** Canvass campaign this blast belongs to (id-only) — SMS campaigns with blasts are text banks. */
  @IsOptional()
  @IsString()
  campaignId?: string;

  /** P2P text bank: volunteers press-send each initial message; the cron never auto-batches it. */
  @IsOptional()
  @IsIn([true, false])
  p2p?: boolean;
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

  @IsOptional()
  @IsString()
  campaignId?: string;

  @IsOptional()
  @IsIn([true, false])
  p2p?: boolean;
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

export class ListBlastsDto extends PaginationDto {
  /** Restrict to one canvass campaign's blasts (the text-bank view). */
  @IsOptional()
  @IsString()
  campaignId?: string;
}
