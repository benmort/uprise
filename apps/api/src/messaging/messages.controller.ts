import { Controller, Get, Param } from "@nestjs/common";
import { MessagesService } from "./messages.service";
import { RequirePermission } from "../auth/require-permission.decorator";

// Per-message read (meld doc 09). Gated on messaging.outbound; organiser/owner
// hold `manage messaging.all`, members `read messaging.all`.
const READ = { action: "read", resource: "messaging.outbound" } as const;

@Controller("messages")
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get(":id")
  @RequirePermission(READ)
  get(@Param("id") id: string) {
    return this.messages.getMessage(id);
  }
}
