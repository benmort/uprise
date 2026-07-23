import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { TextingService } from "./texting.service";
import type { AuthUser } from "../auth/auth-user";
import { RequirePermission } from "../auth/require-permission.decorator";
import { TenantId } from "../auth/tenant-id.decorator";
import { ClaimTextingBatchDto, SendTextingMessageDto, TextingReplyDto } from "./dto/texting.dto";

// Volunteer P2P texting — its OWN resource (volunteer: manage messaging.texting;
// organiser/owner inherit via messaging.all). Deliberately NOT messaging.conversation:
// these endpoints are session-user-scoped in the service, the admin inbox is not.
const TEXTING = { action: "manage", resource: "messaging.texting" } as const;

type AuthedRequest = Request & { user?: AuthUser };

function actorOf(req: AuthedRequest): AuthUser {
  // BasicAuthGuard always sets req.user for authenticated routes; the fallback shape keeps
  // TypeScript honest rather than covering a real path.
  return req.user as AuthUser;
}

@Controller("texting")
export class TextingController {
  constructor(private readonly texting: TextingService) {}

  @Get("banks")
  @RequirePermission(TEXTING)
  listBanks(@TenantId() tenantId: string, @Req() req: AuthedRequest) {
    return this.texting.listBanks(tenantId, actorOf(req));
  }

  @Post("banks/:blastId/claim")
  @RequirePermission(TEXTING)
  claim(
    @TenantId() tenantId: string,
    @Param("blastId") blastId: string,
    @Body() dto: ClaimTextingBatchDto,
    @Req() req: AuthedRequest,
  ) {
    return this.texting.claimBatch(tenantId, actorOf(req), blastId, dto.kind, dto.count ?? 10);
  }

  @Get("banks/:blastId/queue")
  @RequirePermission(TEXTING)
  queue(@TenantId() tenantId: string, @Param("blastId") blastId: string, @Req() req: AuthedRequest) {
    return this.texting.myQueue(tenantId, actorOf(req), blastId);
  }

  @Post("send")
  @RequirePermission(TEXTING)
  send(@TenantId() tenantId: string, @Body() dto: SendTextingMessageDto, @Req() req: AuthedRequest) {
    return this.texting.sendInitial(tenantId, actorOf(req), dto.recipientId);
  }

  @Get("conversations/:contactPhone")
  @RequirePermission(TEXTING)
  thread(@TenantId() tenantId: string, @Param("contactPhone") contactPhone: string, @Req() req: AuthedRequest) {
    return this.texting.thread(tenantId, actorOf(req), contactPhone);
  }

  @Post("reply")
  @RequirePermission(TEXTING)
  reply(@TenantId() tenantId: string, @Body() dto: TextingReplyDto, @Req() req: AuthedRequest) {
    return this.texting.reply(tenantId, actorOf(req), dto.contactPhone, dto.body);
  }

  @Post("conversations/:contactPhone/resolve")
  @RequirePermission(TEXTING)
  resolve(@TenantId() tenantId: string, @Param("contactPhone") contactPhone: string, @Req() req: AuthedRequest) {
    return this.texting.resolve(tenantId, actorOf(req), contactPhone);
  }
}
