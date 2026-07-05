import { IsArray, IsOptional, IsString, MaxLength } from "class-validator";

/** Organiser edit of a contact profile. Provided fields overwrite; omitted are left as-is.
 *  Consent is not editable here (compliance-sensitive; flows from opt-out/STOP). */
export class UpdateContactDto {
  @IsOptional() @IsString() @MaxLength(200) firstName?: string;
  @IsOptional() @IsString() @MaxLength(200) lastName?: string;
  @IsOptional() @IsString() @MaxLength(200) email?: string;
  @IsOptional() @IsString() @MaxLength(20) phoneE164?: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) @MaxLength(60, { each: true }) tags?: string[];
}
