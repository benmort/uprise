import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from "class-validator";
import { Type } from "class-transformer";

/** Claim a batch of P2P work from a text bank's blast. */
export class ClaimTextingBatchDto {
  /** "initial" = unsent scripted first messages to press-send; "replies" = unowned unread conversations. */
  @IsIn(["initial", "replies"])
  kind!: "initial" | "replies";

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(25)
  count?: number;
}

export class SendTextingMessageDto {
  @IsString()
  @IsNotEmpty()
  recipientId!: string;
}

export class TextingReplyDto {
  @IsString()
  @IsNotEmpty()
  contactPhone!: string;

  @IsString()
  @IsNotEmpty()
  body!: string;
}
