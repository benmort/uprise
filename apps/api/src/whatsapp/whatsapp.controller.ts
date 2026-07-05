import { Controller, Get, Post, Query } from "@nestjs/common";
import { WhatsappService } from "./whatsapp.service";
import { RequirePermission } from "../auth/require-permission.decorator";
import { TenantId } from "../auth/tenant-id.decorator";

// WhatsApp templates are messaging.template (mirrors the SMS message-template controller):
// read to list, manage to sync from the provider. Held by organiser/owner (member: read).
const READ = { action: "read", resource: "messaging.template" } as const;
const MANAGE = { action: "manage", resource: "messaging.template" } as const;

@Controller("whatsapp")
export class WhatsappController {
  constructor(private readonly whatsapp: WhatsappService) {}

  @Get("templates")
  @RequirePermission(READ)
  listTemplates(@TenantId() tenantId: string, @Query("status") status?: string) {
    return this.whatsapp.listTemplates(tenantId, { status });
  }

  @Post("templates/sync")
  @RequirePermission(MANAGE)
  syncTemplates(@TenantId() tenantId: string) {
    return this.whatsapp.syncTemplates(tenantId);
  }
}
