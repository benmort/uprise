import { IsOptional, IsString, MaxLength } from "class-validator";

export class InitiateCallDto {
  @IsString()
  @MaxLength(20)
  toNumber!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  fromNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  contactId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8192)
  twiml?: string;
}
