import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { TenantsService } from "./tenants.service";
import type { AuthUser } from "../auth/auth-user";
import { RequirePermission } from "../auth/require-permission.decorator";
import {
  AddMemberDto,
  CreateInvitationDto,
  CreateTenantDto,
  UpdateMemberRoleDto,
  UpdateTenantDto,
} from "./dto/tenants.dto";

// Tenant provisioning + membership/invitation admin (meld doc 12). Creating/updating a tenant
// is an owner/super-admin op (manage tenant.tenant); member + invitation ops are organiser-level
// (manage tenant.member / tenant.invitation — already in the CASL matrix).
const TENANT_MANAGE = { action: "manage", resource: "tenant.tenant" } as const;
const TENANT_READ = { action: "read", resource: "tenant.tenant" } as const;
const MEMBER_MANAGE = { action: "manage", resource: "tenant.member" } as const;
const INVITE_MANAGE = { action: "manage", resource: "tenant.invitation" } as const;

@Controller("tenants")
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Post()
  @RequirePermission(TENANT_MANAGE)
  create(@Body() dto: CreateTenantDto, @Req() req: Request & { user?: AuthUser }) {
    return this.tenants.createTenant({
      slug: dto.slug,
      name: dto.name,
      networkId: dto.networkId,
      ownerUserId: req.user?.id,
    });
  }

  // Declared before :id so "availability" isn't captured as a tenant id. Public
  // (guard-allowlisted) so the sign-up UI can pre-check a desired slug.
  @Get("availability")
  available(@Query("slug") slug: string) {
    return this.tenants.isSlugAvailable(slug ?? "");
  }

  @Get(":id")
  @RequirePermission(TENANT_READ)
  get(@Param("id") id: string) {
    return this.tenants.getTenant(id);
  }

  @Patch(":id")
  @RequirePermission(TENANT_MANAGE)
  update(@Param("id") id: string, @Body() dto: UpdateTenantDto) {
    return this.tenants.updateTenant(id, dto);
  }

  @Delete(":id")
  @RequirePermission(TENANT_MANAGE)
  remove(@Param("id") id: string) {
    return this.tenants.deleteTenant(id);
  }

  @Get(":id/members")
  @RequirePermission(MEMBER_MANAGE)
  listMembers(@Param("id") id: string) {
    return this.tenants.listMembers(id);
  }

  @Post(":id/members")
  @RequirePermission(MEMBER_MANAGE)
  addMember(
    @Param("id") id: string,
    @Body() dto: AddMemberDto,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.tenants.addMember(id, { ...dto, addedBy: req.user?.id });
  }

  @Patch(":id/members/:userId")
  @RequirePermission(MEMBER_MANAGE)
  updateMemberRole(
    @Param("id") id: string,
    @Param("userId") userId: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.tenants.updateMemberRole(id, userId, dto.role);
  }

  @Delete(":id/members/:userId")
  @RequirePermission(MEMBER_MANAGE)
  removeMember(@Param("id") id: string, @Param("userId") userId: string) {
    return this.tenants.removeMember(id, userId);
  }

  @Post(":id/invitations")
  @RequirePermission(INVITE_MANAGE)
  createInvitation(
    @Param("id") id: string,
    @Body() dto: CreateInvitationDto,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.tenants.createInvitation(id, { ...dto, invitedBy: req.user?.id });
  }

  @Get(":id/invitations")
  @RequirePermission(INVITE_MANAGE)
  listInvitations(@Param("id") id: string) {
    return this.tenants.listInvitations(id);
  }

  @Delete(":id/invitations/:invitationId")
  @RequirePermission(INVITE_MANAGE)
  revokeInvitation(@Param("id") id: string, @Param("invitationId") invitationId: string) {
    return this.tenants.revokeInvitation(id, invitationId);
  }
}
