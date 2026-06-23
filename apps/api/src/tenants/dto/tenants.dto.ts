import { AppUserRole } from "@yarns/db";
import { IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

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

export class CreateNetworkDto {
  @IsString() @MaxLength(200) name!: string;
}
