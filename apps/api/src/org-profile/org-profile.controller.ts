import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from "@nestjs/common";
import { OrgProfileService } from "./org-profile.service";
import {
  OrgAddressDto,
  OrgContactDto,
  OrgCredentialDto,
  UpdateOrgProfileDto,
} from "./dto/org-profile.dto";
import { RequirePermission } from "../auth/require-permission.decorator";
import { TenantId } from "../auth/tenant-id.decorator";

// The org record is tenant-wide config (meld doc 11): organiser/owner manage,
// member reads. Gated on tenant.org-profile.
const READ = { action: "read", resource: "tenant.org-profile" } as const;
const MANAGE = { action: "manage", resource: "tenant.org-profile" } as const;

@Controller("org-profile")
export class OrgProfileController {
  constructor(private readonly orgProfile: OrgProfileService) {}

  @Get()
  @RequirePermission(READ)
  get(@TenantId() tenantId: string) {
    return this.orgProfile.getProfile(tenantId);
  }

  @Patch()
  @RequirePermission(MANAGE)
  update(@TenantId() tenantId: string, @Body() dto: UpdateOrgProfileDto) {
    return this.orgProfile.updateProfile(tenantId, dto);
  }

  @Put("credential")
  @RequirePermission(MANAGE)
  setCredential(@TenantId() tenantId: string, @Body() dto: OrgCredentialDto) {
    return this.orgProfile.setCredential(tenantId, dto);
  }

  @Post("contacts")
  @RequirePermission(MANAGE)
  addContact(@TenantId() tenantId: string, @Body() dto: OrgContactDto) {
    return this.orgProfile.addContact(tenantId, dto);
  }

  @Patch("contacts/:id")
  @RequirePermission(MANAGE)
  updateContact(@TenantId() tenantId: string, @Param("id") id: string, @Body() dto: OrgContactDto) {
    return this.orgProfile.updateContact(tenantId, id, dto);
  }

  @Delete("contacts/:id")
  @RequirePermission(MANAGE)
  deleteContact(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.orgProfile.deleteContact(tenantId, id);
  }

  @Post("addresses")
  @RequirePermission(MANAGE)
  addAddress(@TenantId() tenantId: string, @Body() dto: OrgAddressDto) {
    return this.orgProfile.addAddress(tenantId, dto);
  }

  @Patch("addresses/:id")
  @RequirePermission(MANAGE)
  updateAddress(@TenantId() tenantId: string, @Param("id") id: string, @Body() dto: OrgAddressDto) {
    return this.orgProfile.updateAddress(tenantId, id, dto);
  }

  @Delete("addresses/:id")
  @RequirePermission(MANAGE)
  deleteAddress(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.orgProfile.deleteAddress(tenantId, id);
  }
}
