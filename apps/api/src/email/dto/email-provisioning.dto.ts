import { IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from "class-validator";

export class StartEmailProvisioningRunDto {
  @IsString()
  @IsNotEmpty()
  tenantId!: string;

  @IsOptional()
  @IsString()
  campaignId?: string;

  @IsIn(["SUBUSER", "BYO"])
  mode!: "SUBUSER" | "BYO";

  @IsIn(["UPRISE_SUBDOMAIN", "CUSTOM_DOMAIN", "SINGLE_ADDRESS"])
  kind!: "UPRISE_SUBDOMAIN" | "CUSTOM_DOMAIN" | "SINGLE_ADDRESS";

  /** Subdomain label for UPRISE_SUBDOMAIN (defaults to the tenant slug). */
  @IsOptional()
  @Matches(/^[a-z0-9][a-z0-9-]*$/)
  slug?: string;

  /** Tenant-owned domain (CUSTOM_DOMAIN) or the verified address's domain (SINGLE_ADDRESS).
   *  RFC-shaped: labels of [a-z0-9-] separated by dots — it feeds SendGrid and
   *  DNSimple calls, so no URLs/CRLF/paths can be injected. */
  @IsOptional()
  @Matches(/^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?)+$/i)
  @MaxLength(253)
  domain?: string;

  /** Local part of the from-address, e.g. "hello". */
  @IsString()
  @Matches(/^[a-zA-Z0-9._%+-]+$/)
  fromLocalPart!: string;

  @IsString()
  @IsNotEmpty()
  fromName!: string;

  @IsOptional()
  @IsIn(["marketing", "transactional"])
  purpose?: string;

  @IsOptional()
  @IsString()
  byoApiKey?: string;

  /** An OPEN EmailProvisioningRequest this run fulfils (operator queue → run). */
  @IsOptional()
  @IsString()
  requestId?: string;
}

/** Tenant-owner ask for email setup (provisioning stays super-admin-executed). */
export class RequestEmailSetupDto {
  @IsOptional()
  @IsIn(["UPRISE_SUBDOMAIN", "CUSTOM_DOMAIN", "SINGLE_ADDRESS"])
  kind?: "UPRISE_SUBDOMAIN" | "CUSTOM_DOMAIN" | "SINGLE_ADDRESS";

  /** The tenant-owned domain they'd like to send from, if they have one in mind. */
  @IsOptional()
  @Matches(/^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?)+$/i)
  @MaxLength(253)
  domain?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class DeclineEmailSetupRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}
