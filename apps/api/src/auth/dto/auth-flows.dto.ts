import { ArrayMaxSize, IsArray, IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

/**
 * Canvasser roles offered at volunteer onboarding (advisory; organiser can change).
 *
 * Duplicated from `packages/contracts` on purpose – this app does not depend on that
 * package, and this copy is the one the `@IsIn` validator below enforces. Change both.
 * `preferredRole` is a plain nullable string column, so dropping a value strands no row.
 */
export const VOLUNTEER_PREFERRED_ROLES = [
  "doorknocker",
  "hander-outer",
  "booth-captain",
  "p2p-texter",
] as const;

/** Doorknocker onboarding prefs (advisory), assembled into TenantMember.canvassPrefs. */
export const WALKING_CAPABILITIES = ["short", "moderate", "long", "minimal"] as const;
export const SESSION_LENGTHS = ["short", "standard", "long", "flexible"] as const;

export class EmailDto {
  @IsEmail()
  @MaxLength(200)
  email!: string;
}

export class TokenDto {
  @IsString()
  @MaxLength(256)
  token!: string;
}

export class ResetPasswordDto {
  @IsString() @MaxLength(256) token!: string;
  @IsString() @MinLength(8) @MaxLength(200) password!: string;
}

export class ConfirmEmailDto {
  @IsEmail() @MaxLength(200) email!: string;
  @IsString() @MaxLength(12) code!: string;
}

export class TwofaSendDto {
  @IsString() @MaxLength(64) challengeId!: string;
}

export class TwofaVerifyDto {
  @IsString() @MaxLength(64) challengeId!: string;
  @IsString() @MaxLength(12) code!: string;
}

export class PhoneStartDto {
  @IsString() @MaxLength(20) phone!: string;
}

export class PhoneResendDto {
  @IsString() @MaxLength(64) challengeId!: string;
}

export class PhoneVerifyDto {
  @IsString() @MaxLength(64) challengeId!: string;
  @IsString() @MaxLength(12) code!: string;
}

export class InviteStartPhoneDto {
  @IsString() @MaxLength(256) token!: string;
  @IsString() @MaxLength(20) phone!: string;
}

export class AcceptInviteDto {
  @IsString() @MaxLength(256) token!: string;
  @IsOptional() @IsString() @MaxLength(200) displayName?: string;
  @IsOptional() @IsString() @MinLength(8) @MaxLength(200) password?: string;
  // Onboarding wizard: a verified phone OTP to bind + the volunteer's prefs.
  @IsOptional() @IsString() @MaxLength(64) challengeId?: string;
  @IsOptional() @IsString() @MaxLength(12) code?: string;
  @IsOptional() @IsIn(VOLUNTEER_PREFERRED_ROLES) preferredRole?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(7) @IsString({ each: true }) availabilityDays?: string[];
  // Doorknocker-only prefs (advisory) — assembled into TenantMember.canvassPrefs.
  @IsOptional() @IsIn(WALKING_CAPABILITIES) walkingCapability?: string;
  @IsOptional() @IsIn(SESSION_LENGTHS) sessionLength?: string;
}

// Tokenless open-join (per-campaign): same wizard, no invite token – campaignId is
// the authorisation + tenant source (gated server-side by campaign.openJoinEnabled).
export class OpenJoinStartPhoneDto {
  @IsString() @MaxLength(64) campaignId!: string;
  @IsString() @MaxLength(20) phone!: string;
}

export class OpenJoinAcceptDto {
  @IsString() @MaxLength(64) campaignId!: string;
  @IsOptional() @IsString() @MaxLength(200) displayName?: string;
  @IsOptional() @IsString() @MaxLength(64) challengeId?: string;
  @IsOptional() @IsString() @MaxLength(12) code?: string;
  @IsOptional() @IsIn(VOLUNTEER_PREFERRED_ROLES) preferredRole?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(7) @IsString({ each: true }) availabilityDays?: string[];
  // Doorknocker-only prefs (advisory) — assembled into TenantMember.canvassPrefs.
  @IsOptional() @IsIn(WALKING_CAPABILITIES) walkingCapability?: string;
  @IsOptional() @IsIn(SESSION_LENGTHS) sessionLength?: string;
}

export class SelectTenantDto {
  @IsString() @MaxLength(64) tenantId!: string;
}
