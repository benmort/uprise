import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from "@nestjs/common";
import { OrgProfileService } from "./org-profile.service";
import {
  OrgAddressDto,
  OrgContactDto,
  OrgCredentialDto,
  UpdateOrgProfileDto,
} from "./dto/org-profile.dto";
import { RequirePermission } from "../auth/require-permission.decorator";

// The org record is tenant-wide config (meld doc 11): organiser/owner manage,
// member reads. Gated on tenant.org-profile.
const READ = { action: "read", resource: "tenant.org-profile" } as const;
const MANAGE = { action: "manage", resource: "tenant.org-profile" } as const;

@Controller("org-profile")
export class OrgProfileController {
  constructor(private readonly orgProfile: OrgProfileService) {}

  @Get()
  @RequirePermission(READ)
  get() {
    return this.orgProfile.getProfile();
  }

  @Patch()
  @RequirePermission(MANAGE)
  update(@Body() dto: UpdateOrgProfileDto) {
    return this.orgProfile.updateProfile(dto);
  }

  @Put("credential")
  @RequirePermission(MANAGE)
  setCredential(@Body() dto: OrgCredentialDto) {
    return this.orgProfile.setCredential(dto);
  }

  @Post("contacts")
  @RequirePermission(MANAGE)
  addContact(@Body() dto: OrgContactDto) {
    return this.orgProfile.addContact(dto);
  }

  @Patch("contacts/:id")
  @RequirePermission(MANAGE)
  updateContact(@Param("id") id: string, @Body() dto: OrgContactDto) {
    return this.orgProfile.updateContact(id, dto);
  }

  @Delete("contacts/:id")
  @RequirePermission(MANAGE)
  deleteContact(@Param("id") id: string) {
    return this.orgProfile.deleteContact(id);
  }

  @Post("addresses")
  @RequirePermission(MANAGE)
  addAddress(@Body() dto: OrgAddressDto) {
    return this.orgProfile.addAddress(dto);
  }

  @Patch("addresses/:id")
  @RequirePermission(MANAGE)
  updateAddress(@Param("id") id: string, @Body() dto: OrgAddressDto) {
    return this.orgProfile.updateAddress(id, dto);
  }

  @Delete("addresses/:id")
  @RequirePermission(MANAGE)
  deleteAddress(@Param("id") id: string) {
    return this.orgProfile.deleteAddress(id);
  }
}
