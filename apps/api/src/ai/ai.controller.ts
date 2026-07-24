import { Body, Controller, Delete, Get, Param, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { SuperAdmin } from "../auth/super-admin.decorator";
import type { AuthUser } from "../auth/auth-user";
import { AiService } from "./ai.service";
import { AiChatDto } from "./dto/ai-chat.dto";

/**
 * Admin AI assistant. Platform-operator surface: every route is @SuperAdmin()
 * (the house gate for routes no tenant role should reach — see
 * tenants.controller.ts). Conversations are additionally scoped to the caller
 * inside the service.
 */
@Controller("ai")
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post("chat")
  @SuperAdmin()
  chat(@Body() dto: AiChatDto, @Req() req: Request & { user?: AuthUser }) {
    return this.ai.chat(req.user!.id, dto);
  }

  @Get("conversations")
  @SuperAdmin()
  list(@Req() req: Request & { user?: AuthUser }) {
    return this.ai.listConversations(req.user!.id);
  }

  @Get("conversations/:id")
  @SuperAdmin()
  get(@Param("id") id: string, @Req() req: Request & { user?: AuthUser }) {
    return this.ai.getConversation(req.user!.id, id);
  }

  @Delete("conversations/:id")
  @SuperAdmin()
  remove(@Param("id") id: string, @Req() req: Request & { user?: AuthUser }) {
    return this.ai.deleteConversation(req.user!.id, id);
  }
}
