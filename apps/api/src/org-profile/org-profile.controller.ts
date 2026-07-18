import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from "@nestjs/common";
import { AppUserRole } from "@uprise/db";
import { OrgProfileService } from "./org-profile.service";
import {
  OrgAddressDto,
  OrgContactDto,
  OrgCredentialDto,
  UpdateOrgProfileDto,
} from "./dto/org-profile.dto";
import { RequirePermission } from "../auth/require-permission.decorator";
import { TenantId } from "../auth/tenant-id.decorator";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";

// The org record is tenant-wide config (meld doc 11): organiser/owner manage,
// member reads. Gated on tenant.org-profile.
const READ = { action: "read", resource: "tenant.org-profile" } as const;
const MANAGE = { action: "manage", resource: "tenant.org-profile" } as const;

// The Business & Legal (credential), Contacts and Addresses surfaces are owner-only
// (super-admin bypasses via RolesGuard) — the UI hides these tabs for non-owners and
// the API is the real boundary. The base profile (name/branding) stays organiser-manageable.
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
  @UseGuards(RolesGuard)
  @Roles(AppUserRole.OWNER)
  setCredential(@TenantId() tenantId: string, @Body() dto: OrgCredentialDto) {
    return this.orgProfile.setCredential(tenantId, dto);
  }

  @Post("contacts")
  @RequirePermission(MANAGE)
  @UseGuards(RolesGuard)
  @Roles(AppUserRole.OWNER)
  addContact(@TenantId() tenantId: string, @Body() dto: OrgContactDto) {
    return this.orgProfile.addContact(tenantId, dto);
  }

  @Patch("contacts/:id")
  @RequirePermission(MANAGE)
  @UseGuards(RolesGuard)
  @Roles(AppUserRole.OWNER)
  updateContact(@TenantId() tenantId: string, @Param("id") id: string, @Body() dto: OrgContactDto) {
    return this.orgProfile.updateContact(tenantId, id, dto);
  }

  @Delete("contacts/:id")
  @RequirePermission(MANAGE)
  @UseGuards(RolesGuard)
  @Roles(AppUserRole.OWNER)
  deleteContact(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.orgProfile.deleteContact(tenantId, id);
  }

  @Post("addresses")
  @RequirePermission(MANAGE)
  @UseGuards(RolesGuard)
  @Roles(AppUserRole.OWNER)
  addAddress(@TenantId() tenantId: string, @Body() dto: OrgAddressDto) {
    return this.orgProfile.addAddress(tenantId, dto);
  }

  @Patch("addresses/:id")
  @RequirePermission(MANAGE)
  @UseGuards(RolesGuard)
  @Roles(AppUserRole.OWNER)
  updateAddress(@TenantId() tenantId: string, @Param("id") id: string, @Body() dto: OrgAddressDto) {
    return this.orgProfile.updateAddress(tenantId, id, dto);
  }

  @Delete("addresses/:id")
  @RequirePermission(MANAGE)
  @UseGuards(RolesGuard)
  @Roles(AppUserRole.OWNER)
  deleteAddress(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.orgProfile.deleteAddress(tenantId, id);
  }
}
