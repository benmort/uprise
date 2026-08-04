import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { Type } from "class-transformer";

/**
 * Embed-domain grammar: bare lowercase hostname (labels of [a-z0-9-], ≥ 1 dot,
 * or the literal "localhost") with at most one leading `*.` wildcard. Anything
 * else — schemes, ports, paths, whitespace, semicolons — is rejected at write
 * time, which is what makes the frame-ancestors CSP header uninjectable.
 */
export const EMBED_DOMAIN_RE = /^(\*\.)?(localhost|[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+)$/;

export class CreateActionPageDto {
  @IsString() @MaxLength(160) title!: string;
}

export class UpdateActionPageDto {
  @IsOptional() @IsString() @MaxLength(160) title?: string;
  @IsOptional() @IsString() @MaxLength(200) headline?: string;
  @IsOptional() @IsString() @MaxLength(5000) body?: string;
  @IsOptional() @IsString() @MaxLength(80) ctaLabel?: string;
  @IsOptional() @IsString() @MaxLength(2000) successMessage?: string;
  @IsOptional() @IsBoolean() collectName?: boolean;
  @IsOptional() @IsBoolean() collectEmail?: boolean;
  @IsOptional() @IsBoolean() collectPhone?: boolean;
  @IsOptional() @IsBoolean() allowPrefill?: boolean;
  @IsOptional() @IsBoolean() requireCaptcha?: boolean;
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Matches(EMBED_DOMAIN_RE, { each: true, message: "embedDomains entries must be bare hostnames (optionally *.host)" })
  embedDomains?: string[];
  @IsOptional() @IsString() campaignId?: string | null;
}

export class ListActionPagesQueryDto {
  @IsOptional() @IsIn(["DRAFT", "PUBLISHED", "ARCHIVED"]) status?: string;
  @IsOptional() @IsString() @MaxLength(200) search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset?: number;
}

export class SupporterDto {
  @IsOptional() @IsString() @MaxLength(160) name?: string;
  @IsOptional() @IsEmail() @MaxLength(254) email?: string;
  @IsOptional() @Matches(/^\+?[0-9 ()-]{6,20}$/) phone?: string;
}

export class CreateCallSessionDto {
  @IsOptional() @Type(() => SupporterDto) supporter?: SupporterDto;
  /** Host page origin as observed by the embed (advisory — CSP is the control). */
  @IsOptional() @IsString() @MaxLength(300) embedAncestor?: string;
}
