import { Type } from "class-transformer";
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from "class-validator";

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
  @IsString()
  @IsNotEmpty()
  tenantId!: string;

  @IsOptional()
  @IsString()
  campaignId?: string;

  @IsIn(["SUBACCOUNT", "BYO"])
  mode!: "SUBACCOUNT" | "BYO";

  @IsOptional()
  @IsString()
  byoAccountSid?: string;

  @IsOptional()
  @IsString()
  byoAuthToken?: string;

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
