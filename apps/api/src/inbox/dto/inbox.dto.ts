import { IsOptional, IsString } from "class-validator";
import { PaginationDto } from "../../common/dto/pagination.dto";

export class ListConversationsDto extends PaginationDto {
  @IsOptional()
  @IsString()
  query?: string;

  @IsOptional()
  @IsString()
  blastId?: string;

  @IsOptional()
  @IsString()
  audienceId?: string;
}

export class ReplyDto {
  @IsString()
  contactPhone!: string;

  @IsString()
  body!: string;
}

export class MarkConversationDto {
  @IsOptional()
  resolved?: boolean;
}
