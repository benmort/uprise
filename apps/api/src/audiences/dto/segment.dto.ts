import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

/**
 * Segment DTOs — class-validator gates the SCALARS only; `filter` / `policy` /
 * `customClauses` enter as `unknown` and are authoritatively validated by the
 * `@uprise/segmentation` Zod schemas in the service (the slingshot pattern:
 * Zod is the runtime authority for the domain shapes).
 */

export class CreateSegmentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  /** The blast channel the container audience targets (drives the L3 floor). */
  @IsOptional()
  @IsIn(["SMS", "WHATSAPP", "ALL"])
  channel?: "SMS" | "WHATSAPP" | "ALL";

  /** FilterNode — Zod-validated in the service. */
  filter!: unknown;

  /** SegmentPolicy — Zod-validated in the service; defaulted when omitted. */
  @IsOptional()
  policy?: unknown;

  /** SegmentCustomClause[] — Zod- + AST-validated in the service. */
  @IsOptional()
  customClauses?: unknown;
}

export class UpdateSegmentDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  filter?: unknown;

  @IsOptional()
  policy?: unknown;

  @IsOptional()
  customClauses?: unknown;
}

export class PreviewSegmentDto {
  filter!: unknown;

  @IsOptional()
  policy?: unknown;

  @IsOptional()
  customClauses?: unknown;

  @IsOptional()
  @IsIn(["SMS", "WHATSAPP"])
  channel?: "SMS" | "WHATSAPP";

  /** The saved segment's seed, so the sample matches the send order. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  seed?: string;
}

export class GenerateSegmentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  prompt!: string;
}

export class CompileCustomClauseDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  intent!: string;
}
