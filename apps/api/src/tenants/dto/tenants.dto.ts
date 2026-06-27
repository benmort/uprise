import { AppUserRole } from "@yarns/db";
import { IsEmail, IsEnum, IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateTenantDto {
  @IsString() @MaxLength(64) slug!: string;
  @IsString() @MaxLength(200) name!: string;
  @IsOptional() @IsString() @MaxLength(64) networkId?: string;
}

export class UpdateTenantDto {
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(64) slug?: string;
}

export class AddMemberDto {
  @IsOptional() @IsString() @MaxLength(64) userId?: string;
  @IsOptional() @IsEmail() @MaxLength(200) email?: string;
  @IsEnum(AppUserRole) role!: AppUserRole;
}

export class UpdateMemberRoleDto {
  @IsEnum(AppUserRole) role!: AppUserRole;
}

export class CreateInvitationDto {
  @IsEmail() @MaxLength(200) email!: string;
  @IsEnum(AppUserRole) role!: AppUserRole;
}

export class RegisterDto {
  @IsEmail() @MaxLength(200) email!: string;
  @IsString() @MinLength(8) @MaxLength(200) password!: string;
  @IsOptional() @IsString() @MaxLength(200) displayName?: string;
  @IsString() @MaxLength(200) orgName!: string;
  @IsString() @MaxLength(64) slug!: string;
}

// ── Self-signup → admin approval (the inverse of invite) ──────────────
export class RequestAccessDto {
  @IsEmail() @MaxLength(200) email!: string;
  @IsString() @MinLength(8) @MaxLength(200) password!: string;
  @IsString() @MinLength(1) @MaxLength(200) displayName!: string;
  @IsIn(["staff", "volunteer"]) requestedRole!: "staff" | "volunteer";
  @IsString() @MaxLength(64) tenantSlug!: string;
}

export class ConfirmAccessDto {
  @IsEmail() @MaxLength(200) email!: string;
  @IsString() @MaxLength(12) code!: string;
  @IsString() @MaxLength(64) tenantSlug!: string;
}

export class ApproveJoinRequestDto {
  // Approval may only grant ORGANISER or VOLUNTEER — never OWNER (privilege escalation:
  // an organiser approving a self-signup must not be able to mint an owner by crafting the
  // body). super-admin isn't an AppUserRole, so it can't appear here at all. Mirrors
  // approveJoinRequestSchema in @yarns/contracts.
  @IsIn(["ORGANISER", "VOLUNTEER"]) role!: "ORGANISER" | "VOLUNTEER";
}

export class RejectJoinRequestDto {
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class CreateNetworkDto {
  @IsString() @MaxLength(200) name!: string;
}
