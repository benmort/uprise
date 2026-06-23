import { IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateProfileDto {
  @IsOptional() @IsString() @MaxLength(200) displayName?: string;
  @IsOptional() @IsString() @MaxLength(120) givenName?: string;
  @IsOptional() @IsString() @MaxLength(120) familyName?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(2048) avatarUrl?: string;
  @IsOptional() @IsString() @MaxLength(2000) bio?: string;
  @IsOptional() @IsString() @MaxLength(40) dateOfBirth?: string;
  @IsOptional() @IsString() @MaxLength(2048) facebookUrl?: string;
  @IsOptional() @IsString() @MaxLength(2048) twitterUrl?: string;
  @IsOptional() @IsString() @MaxLength(2048) linkedinUrl?: string;
  @IsOptional() @IsString() @MaxLength(2048) instagramUrl?: string;
  @IsOptional() @IsString() @MaxLength(2048) websiteUrl?: string;
}

export class AddAvatarDto {
  @IsString()
  @MaxLength(2048)
  url!: string;
}
