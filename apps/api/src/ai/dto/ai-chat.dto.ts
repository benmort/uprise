import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";
import { AI_CHAT_MODELS, type AiChatModel } from "../ai.service";

export class AiChatDto {
  /** Continue an existing conversation; omitted ⇒ a new one is created. */
  @IsOptional()
  @IsString()
  conversationId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20_000)
  message!: string;

  @IsOptional()
  @IsIn([...AI_CHAT_MODELS])
  model?: AiChatModel;

  /** Caller-assembled system prompt (personalisation settings live client-side). */
  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  system?: string;
}
