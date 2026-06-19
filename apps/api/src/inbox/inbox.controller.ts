import { Body, Controller, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { InboxService } from "./inbox.service";
import type { AuthUser } from "../auth/auth-user";
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
  getThread(
    @Param("contactPhone") contactPhone: string,
    @Query("channel") channel?: string,
  ) {
    return this.inbox.getThread(contactPhone, channel);
  }

  @Post("reply")
  reply(@Body() dto: ReplyDto) {
    return this.inbox.reply(dto.contactPhone, dto.body, dto.channel);
  }

  @Patch("conversations/:contactPhone")
  markConversation(
    @Param("contactPhone") contactPhone: string,
    @Body() dto: MarkConversationDto,
  ) {
    return this.inbox.markConversation(contactPhone, Boolean(dto.resolved), dto.channel);
  }

  @Post("conversations/:contactPhone/claim")
  claim(
    @Param("contactPhone") contactPhone: string,
    @Body() body: { channel?: string },
    @Req() req: Request & { user?: AuthUser },
  ) {
    const ownerId = req.user?.id ?? "env-admin";
    return this.inbox.claimConversation(contactPhone, ownerId, body?.channel);
  }

  @Post("conversations/:contactPhone/release")
  release(@Param("contactPhone") contactPhone: string, @Body() body: { channel?: string }) {
    return this.inbox.releaseConversation(contactPhone, body?.channel);
  }

  @Get("ai-suggestions")
  aiSuggestions(@Query("message") message?: string) {
    return this.inbox.suggest(message || "");
  }
}
