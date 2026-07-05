import { Body, Controller, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { InboxService } from "./inbox.service";
import type { AuthUser } from "../auth/auth-user";
import { RequirePermission } from "../auth/require-permission.decorator";
import { TenantId } from "../auth/tenant-id.decorator";
import { ListConversationsDto, MarkConversationDto, ReplyDto } from "./dto/inbox.dto";

// Shared inbox — messaging.conversation (member: read; organiser/owner: manage via messaging.all).
const READ = { action: "read", resource: "messaging.conversation" } as const;
const MANAGE = { action: "manage", resource: "messaging.conversation" } as const;

@Controller("inbox")
export class InboxController {
  constructor(private readonly inbox: InboxService) {}

  @Get("conversations")
  @RequirePermission(READ)
  listConversations(@TenantId() tenantId: string, @Query() dto: ListConversationsDto) {
    return this.inbox.listConversations(tenantId, {
      query: dto.query,
      blastId: dto.blastId,
      audienceId: dto.audienceId,
    });
  }

  @Get("conversations/:contactPhone")
  @RequirePermission(READ)
  getThread(
    @TenantId() tenantId: string,
    @Param("contactPhone") contactPhone: string,
    @Query("channel") channel?: string,
  ) {
    return this.inbox.getThread(tenantId, contactPhone, channel);
  }

  @Post("reply")
  @RequirePermission(MANAGE)
  reply(@TenantId() tenantId: string, @Body() dto: ReplyDto) {
    return this.inbox.reply(tenantId, dto.contactPhone, dto.body, dto.channel);
  }

  @Patch("conversations/:contactPhone")
  @RequirePermission(MANAGE)
  markConversation(
    @TenantId() tenantId: string,
    @Param("contactPhone") contactPhone: string,
    @Body() dto: MarkConversationDto,
  ) {
    return this.inbox.markConversation(tenantId, contactPhone, Boolean(dto.resolved), dto.channel);
  }

  @Post("conversations/:contactPhone/claim")
  @RequirePermission(MANAGE)
  claim(
    @TenantId() tenantId: string,
    @Param("contactPhone") contactPhone: string,
    @Body() body: { channel?: string },
    @Req() req: Request & { user?: AuthUser },
  ) {
    const ownerId = req.user?.id ?? "env-admin";
    return this.inbox.claimConversation(tenantId, contactPhone, ownerId, body?.channel);
  }

  @Post("conversations/:contactPhone/release")
  @RequirePermission(MANAGE)
  release(
    @TenantId() tenantId: string,
    @Param("contactPhone") contactPhone: string,
    @Body() body: { channel?: string },
  ) {
    return this.inbox.releaseConversation(tenantId, contactPhone, body?.channel);
  }

  @Get("ai-suggestions")
  @RequirePermission(READ)
  aiSuggestions(@TenantId() tenantId: string, @Query("message") message?: string) {
    return this.inbox.suggest(tenantId, message || "");
  }
}
