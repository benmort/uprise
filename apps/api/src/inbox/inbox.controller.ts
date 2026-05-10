import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { InboxService } from "./inbox.service";
import { ListConversationsDto, MarkConversationDto, ReplyDto } from "./dto/inbox.dto";

@Controller("inbox")
export class InboxController {
  constructor(private readonly inbox: InboxService) {}

  @Get("conversations")
  listConversations(@Query() dto: ListConversationsDto) {
    return this.inbox.listConversations({
      query: dto.query,
      blastId: dto.blastId,
      audienceId: dto.audienceId,
    });
  }

  @Get("conversations/:contactPhone")
  getThread(@Param("contactPhone") contactPhone: string) {
    return this.inbox.getThread(contactPhone);
  }

  @Post("reply")
  reply(@Body() dto: ReplyDto) {
    return this.inbox.reply(dto.contactPhone, dto.body);
  }

  @Patch("conversations/:contactPhone")
  markConversation(
    @Param("contactPhone") contactPhone: string,
    @Body() dto: MarkConversationDto,
  ) {
    return this.inbox.markConversation(contactPhone, Boolean(dto.resolved));
  }

  @Get("ai-suggestions")
  aiSuggestions(@Query("message") message?: string) {
    return this.inbox.suggest(message || "");
  }
}
