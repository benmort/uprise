import { Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";
import { RequirePermission } from "../auth/require-permission.decorator";
import { TenantId } from "../auth/tenant-id.decorator";
import { TagsService } from "./tags.service";
import { AssignTagDto, CreateTagDto } from "./dto/tags.dto";

const TAG_READ = { action: "read", resource: "contacts.tag" } as const;
const TAG_MANAGE = { action: "manage", resource: "contacts.tag" } as const;

@Controller("contact-tags")
export class TagsController {
  constructor(private readonly tags: TagsService) {}

  @Get()
  @RequirePermission(TAG_READ)
  async list(@TenantId() tenantId: string) {
    return this.tags.listTags(tenantId);
  }

  @Post()
  @RequirePermission(TAG_MANAGE)
  async create(@TenantId() tenantId: string, @Body() dto: CreateTagDto) {
    return this.tags.createTag(tenantId, dto);
  }

  @Delete(":id")
  @RequirePermission(TAG_MANAGE)
  async remove(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.tags.deleteTag(tenantId, id);
  }

  @Get("contact/:contactId")
  @RequirePermission(TAG_READ)
  async forContact(@TenantId() tenantId: string, @Param("contactId") contactId: string) {
    return this.tags.getContactTags(tenantId, contactId);
  }

  @Post("contact/:contactId")
  @RequirePermission(TAG_MANAGE)
  async assign(@TenantId() tenantId: string, @Param("contactId") contactId: string, @Body() dto: AssignTagDto) {
    return this.tags.assignTag(tenantId, contactId, dto.tagId);
  }

  @Delete("contact/:contactId/:tagId")
  @RequirePermission(TAG_MANAGE)
  async unassign(
    @TenantId() tenantId: string,
    @Param("contactId") contactId: string,
    @Param("tagId") tagId: string,
  ) {
    return this.tags.removeTag(tenantId, contactId, tagId);
  }
}
