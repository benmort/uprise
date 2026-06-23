import { IsBoolean, IsEmail, IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateOrgProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;
}

export class OrgContactDto {
  @IsOptional() @IsString() @MaxLength(120) firstName?: string;
  @IsOptional() @IsString() @MaxLength(120) lastName?: string;
  @IsOptional() @IsEmail() @MaxLength(200) email?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(40) mobilePhone?: string;
  @IsOptional() @IsString() @MaxLength(120) title?: string;
  @IsOptional() @IsString() @MaxLength(120) role?: string;
  @IsOptional() @IsString() @MaxLength(60) contactType?: string;
  @IsOptional() @IsBoolean() isPrimaryContact?: boolean;
  @IsOptional() @IsBoolean() isAuthorisedSignatory?: boolean;
}

export class OrgAddressDto {
  @IsOptional() @IsString() @MaxLength(60) addressType?: string;
  @IsOptional() @IsString() @MaxLength(200) line1?: string;
  @IsOptional() @IsString() @MaxLength(200) line2?: string;
  @IsOptional() @IsString() @MaxLength(120) suburb?: string;
  @IsOptional() @IsString() @MaxLength(120) city?: string;
  @IsOptional() @IsString() @MaxLength(120) state?: string;
  @IsOptional() @IsString() @MaxLength(120) country?: string;
  @IsOptional() @IsString() @MaxLength(20) postcode?: string;
}

export class OrgCredentialDto {
  @IsOptional() @IsString() @MaxLength(200) legalTradingName?: string;
  @IsOptional() @IsString() @MaxLength(40) australianBusinessNumber?: string;
  @IsOptional() @IsString() @MaxLength(40) australianCompanyNumber?: string;
  @IsOptional() @IsString() @MaxLength(40) taxFileNumber?: string;
  @IsOptional() @IsString() @MaxLength(120) industry?: string;
  @IsOptional() @IsString() @MaxLength(120) entityType?: string;
  @IsOptional() @IsString() @MaxLength(120) registrationNumber?: string;
  @IsOptional() @IsBoolean() isRegisteredEntity?: boolean;
  @IsOptional() @IsString() @MaxLength(60) acncRegistrationNumber?: string;
  @IsOptional() @IsString() @MaxLength(60) acncStatus?: string;
  @IsOptional() @IsString() @MaxLength(120) charitySubtype?: string;
  @IsOptional() @IsBoolean() deductibleGiftRecipient?: boolean;
  @IsOptional() @IsString() @MaxLength(60) dgrStatus?: string;
  @IsOptional() @IsString() @MaxLength(20) financialYearEnd?: string;
}
