import { Transform, Type, type TransformFnParams } from "class-transformer";
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from "class-validator";

/** Trim a pasted string; anything else is left alone for the validator to reject. */
const trimmed = ({ value }: TransformFnParams) => (typeof value === "string" ? value.trim() : value);

export class ComplianceAddressDto {
  @IsString()
  @IsNotEmpty()
  street!: string;

  @IsString()
  @IsNotEmpty()
  city!: string;

  /** State, e.g. NSW. */
  @IsString()
  @IsNotEmpty()
  region!: string;

  @IsString()
  @IsNotEmpty()
  postalCode!: string;
}

export class ComplianceInputDto {
  @IsString()
  @IsNotEmpty()
  legalName!: string;

  @IsString()
  @IsNotEmpty()
  contactFirstName!: string;

  @IsString()
  @IsNotEmpty()
  contactLastName!: string;

  @IsEmail()
  email!: string;

  /** ABN/ACN. */
  @IsOptional()
  @IsString()
  businessNumber?: string;

  @IsObject()
  @ValidateNested()
  @Type(() => ComplianceAddressDto)
  address!: ComplianceAddressDto;
}

export class StartProvisioningRunDto {
  /** Optional for tenant self-serve (the server forces the caller's own tenant);
   *  super-admins may target any tenant explicitly. */
  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsOptional()
  @IsString()
  campaignId?: string;

  @IsIn(["SUBACCOUNT", "BYO"])
  mode!: "SUBACCOUNT" | "BYO";

  /** "mobile" (SMS, default) or "local" (voice caller-id capable). */
  @IsOptional()
  @IsIn(["mobile", "local"])
  numberType?: "mobile" | "local";

  /**
   * Also provision the complementary class when this run completes (default true) –
   * an organisation needs both a mobile to text and a local to call. Send false to
   * request this class only.
   */
  @IsOptional()
  @IsBoolean()
  chainComplementary?: boolean;

  @IsOptional()
  @IsString()
  byoAccountSid?: string;

  @IsOptional()
  @IsString()
  byoAuthToken?: string;

  /**
   * An ALREADY-APPROVED regulatory bundle and its registered address on the BYO account.
   * Supplying both skips Twilio's human compliance review entirely, so the shape is pinned
   * here as well as in the service: a bundle SID is BU + 32 hex, an address AD + 32 hex.
   *
   * Every one of these four is hand-pasted from another console, so each is TRIMMED before
   * it is matched – a trailing space off a copy is not a 400 – and the case rules match the
   * service's normaliser exactly (region/edge are accepted in any case and lowercased
   * there). Where the two layers disagreed, the stricter one silently made the other's
   * behaviour unreachable.
   */
  @IsOptional()
  @Transform(trimmed)
  @Matches(/^BU[0-9a-fA-F]{32}$/, { message: "byoBundleSid must be a Twilio bundle SID (BU…)" })
  byoBundleSid?: string;

  @IsOptional()
  @Transform(trimmed)
  @Matches(/^AD[0-9a-fA-F]{32}$/, { message: "byoAddressSid must be a Twilio address SID (AD…)" })
  byoAddressSid?: string;

  /** Twilio home region of the BYO account, e.g. "au1". */
  @IsOptional()
  @Transform(trimmed)
  @Matches(/^[A-Za-z]{2}[0-9]$/, { message: "byoRegion must be a Twilio region, e.g. au1" })
  byoRegion?: string;

  /** Twilio edge of the BYO account, e.g. "sydney". */
  @IsOptional()
  @Transform(trimmed)
  @Matches(/^[A-Za-z][A-Za-z-]{2,19}$/, { message: "byoEdge must be a Twilio edge, e.g. sydney" })
  byoEdge?: string;

  @IsOptional()
  @IsString()
  friendlyName?: string;

  @IsObject()
  @ValidateNested()
  @Type(() => ComplianceInputDto)
  complianceInput!: ComplianceInputDto;
}

export class ResubmitRunDto {
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ComplianceInputDto)
  complianceInput?: ComplianceInputDto;
}

export class UploadDocumentDto {
  /** Twilio supporting-document type, e.g. "business_registration". */
  @IsString()
  @IsNotEmpty()
  type!: string;
}

export class SetNumberNicknameDto {
  /** Human label for a provisioned number; empty string clears it. */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  nickname?: string;

  /** Which sends this number serves ("transactional" = calls, "marketing" = SMS blasts). */
  @IsOptional()
  @IsIn(["transactional", "marketing", "whatsapp"])
  purpose?: "transactional" | "marketing" | "whatsapp";
}

/**
 * Connect a tenant's own Twilio account without provisioning anything. Until this existed the
 * only thing that created a BYO account was a provisioning run, so an organisation that already
 * owned numbers had to BUY one it did not need before it could adopt the ones it did.
 */
export class ConnectByoAccountDto {
  @Transform(trimmed)
  @Matches(/^AC[0-9a-fA-F]{32}$/, { message: "accountSid must be a Twilio account SID (AC…)" })
  accountSid!: string;

  /** Verified against Twilio before it is stored, then encrypted at rest. */
  @Transform(trimmed)
  @IsString()
  @MaxLength(200)
  authToken!: string;

  @IsOptional()
  @Transform(trimmed)
  @Matches(/^[a-z]{2}[0-9]$/, { message: "region must look like au1" })
  region?: string;

  @IsOptional()
  @Transform(trimmed)
  @Matches(/^[a-z][a-z-]{2,19}$/, { message: "edge must look like sydney" })
  edge?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  friendlyName?: string;
}

export class AdoptNumberDto {
  /**
   * The Twilio SID of a number the account ALREADY owns (`PN` + 32 hex). Pasted from the
   * adoptable-numbers listing, so it is trimmed before it is matched. Shape-checked here
   * because a malformed SID would otherwise only surface as a Twilio lookup failure, which
   * is indistinguishable from "not your number".
   */
  @Transform(trimmed)
  @Matches(/^PN[0-9a-fA-F]{32}$/, { message: "phoneNumberSid must be a Twilio phone number SID (PN…)" })
  phoneNumberSid!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  nickname?: string;

  /**
   * Take over an inbound hook that is ALREADY configured. Default (absent) is to leave the
   * existing configuration alone and report it – the numbers on a real BYO account carry a
   * working voice configuration belonging to the organisation's own systems, and silently
   * overwriting it would break a running service. Each hook opts in separately, and adoption
   * only ever touches the hook matching the number's class.
   */
  @IsOptional()
  @IsBoolean()
  claimSmsHook?: boolean;

  @IsOptional()
  @IsBoolean()
  claimVoiceHook?: boolean;
}

export class BundleStatusCallbackDto {
  @IsString()
  @IsNotEmpty()
  BundleSid!: string;

  @IsString()
  @IsNotEmpty()
  Status!: string;

  @IsOptional()
  @IsString()
  FailureReason?: string;
}
