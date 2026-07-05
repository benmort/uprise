import { Body, Controller, Get, HttpStatus, Param, Patch, Query, UseGuards } from "@nestjs/common";
import { RolesGuard } from "../auth/roles.guard";
import { RequirePermission } from "../auth/require-permission.decorator";
import { TenantId } from "../auth/tenant-id.decorator";
import { ApiHttpException } from "../common/http/api-response";
import { ContactsService } from "./contacts.service";
import { UpdateContactDto } from "./dto/contacts.dto";

// Contacts hold PII. Reads require read contacts.contact (held by every role); edits require
// manage (owner/organiser). Previously undecorated — a latent auth gap now closed.
const READ = { action: "read", resource: "contacts.contact" } as const;
const MANAGE = { action: "manage", resource: "contacts.contact" } as const;

@Controller("contacts")
@UseGuards(RolesGuard)
export class ContactsController {
  constructor(private readonly contacts: ContactsService) {}

  @Get()
  @RequirePermission(READ)
  async search(@TenantId() tenantId: string, @Query("query") query?: string) {
    return this.contacts.search(tenantId, query ?? "");
  }

  @Get(":id")
  @RequirePermission(READ)
  async profile(@TenantId() tenantId: string, @Param("id") id: string) {
    const profile = await this.contacts.getProfile(tenantId, id);
    if (!profile) {
      throw new ApiHttpException("CONTACT_NOT_FOUND", "Contact not found", HttpStatus.NOT_FOUND);
    }
    return profile;
  }

  @Patch(":id")
  @RequirePermission(MANAGE)
  async update(@TenantId() tenantId: string, @Param("id") id: string, @Body() dto: UpdateContactDto) {
    return this.contacts.updateContact(tenantId, id, dto);
  }
}
