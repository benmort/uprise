import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

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

export class AcceptInviteDto {
  @IsString() @MaxLength(256) token!: string;
  @IsOptional() @IsString() @MaxLength(200) displayName?: string;
  @IsOptional() @IsString() @MinLength(8) @MaxLength(200) password?: string;
}

export class SelectTenantDto {
  @IsString() @MaxLength(64) tenantId!: string;
}
