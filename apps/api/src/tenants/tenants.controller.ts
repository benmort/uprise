import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { AppUserRole } from "@uprise/db";
import { TenantsService, TENANT_CREATE_PLANS } from "./tenants.service";
import { IamFlowsService } from "../auth/iam-flows.service";
import type { AuthUser } from "../auth/auth-user";
import { RequirePermission } from "../auth/require-permission.decorator";
import { SuperAdmin } from "../auth/super-admin.decorator";
import {
  AddMemberDto,
  ApproveJoinRequestDto,
  CreateInvitationDto,
  CreateSelfServeTenantDto,
  CreateTenantDto,
  RejectJoinRequestDto,
  UpdateMemberRoleDto,
  UpdateOnboardingDto,
  UpdateTenantDto,
} from "./dto/tenants.dto";

// Tenant provisioning + membership/invitation admin (meld doc 12). Creating/updating a tenant
// is an owner/super-admin op (manage tenant.tenant); member + invitation ops require manage
// tenant.member / tenant.invitation (granted to OWNER via tenant.all and to ORGANISER — already
// in the CASL matrix).
const TENANT_MANAGE = { action: "manage", resource: "tenant.tenant" } as const;
const TENANT_READ = { action: "read", resource: "tenant.tenant" } as const;
const MEMBER_MANAGE = { action: "manage", resource: "tenant.member" } as const;
const INVITE_MANAGE = { action: "manage", resource: "tenant.invitation" } as const;
// Onboarding rides the org-profile permission: read is held by every tenant member; manage
// by OWNER (via tenant.all) + ORGANISER — the exact gate for the getting-started surface.
const ORG_PROFILE_READ = { action: "read", resource: "tenant.org-profile" } as const;
const ORG_PROFILE_MANAGE = { action: "manage", resource: "tenant.org-profile" } as const;

@Controller("tenants")
export class TenantsController {
  constructor(
    private readonly tenants: TenantsService,
    private readonly flows: IamFlowsService,
  ) {}

  /**
   * Bind a path :id to the caller's own tenant (super-admin exempt). The CASL
   * permission checks the *action*, not the tenant instance — without this an
   * organiser of tenant A could act on tenant B's join requests via the URL.
   */
  private assertOwnTenant(req: Request & { user?: AuthUser }, id: string): void {
    if (req.user?.isSuperAdmin) return;
    if (req.user?.tenantId !== id) throw new ForbiddenException("Wrong tenant");
  }

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

  /**
   * Self-serve tenant creation from the in-app switcher. Declared before :id routes.
   * CASL (manage tenant.tenant) limits this to owners/super-admins; on top of that a
   * non-super-admin must own their current tenant AND sit on a paid plan. The new tenant
   * is created under the caller's network with the caller as OWNER.
   */
  @Post("self-serve")
  @RequirePermission(TENANT_MANAGE)
  async createSelfServe(
    @Body() dto: CreateSelfServeTenantDto,
    @Req() req: Request & { user?: AuthUser },
  ) {
    const user = req.user;
    if (!user) throw new ForbiddenException("Not authenticated");

    let networkId: string | undefined;
    if (!user.isSuperAdmin) {
      const memberships = await this.flows.membershipsFor(user.id);
      const current = memberships.find((m) => m.tenantId === user.tenantId);
      const allowed =
        current?.role === AppUserRole.OWNER &&
        (TENANT_CREATE_PLANS as readonly string[]).includes(current.planName ?? "");
      if (!allowed) throw new ForbiddenException("Your plan does not allow creating tenants");
      networkId = current?.network?.id ?? undefined;
    }

    return this.tenants.createTenant({
      slug: dto.slug,
      name: dto.name,
      networkId,
      ownerUserId: user.id,
    });
  }

  // Declared before :id so "availability" isn't captured as a tenant id. Public
  // (guard-allowlisted) so the sign-up UI can pre-check a desired slug.
  @Get("availability")
  available(@Query("slug") slug: string) {
    return this.tenants.isSlugAvailable(slug ?? "");
  }

  // Public tenant brand (id + name) by slug for the volunteer auth panel. Declared
  // before :id; guard-allowlisted. Slugs are public subdomains, so this leaks nothing.
  @Get("brand")
  brand(@Query("slug") slug: string) {
    return this.tenants.tenantBrandBySlug(slug ?? "");
  }

  // Super-admin search across ALL tenants (powers the feature-flag override editor).
  // Declared before :id so "search" isn't captured as a tenant id. @SuperAdmin is the gate
  // (TENANT_READ alone is held by organisers too).
  @Get("search")
  @SuperAdmin()
  search(@Query("q") q: string | undefined) {
    return this.tenants.searchTenants(q);
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

  // Organiser getting-started progress. assertOwnTenant stops an organiser of tenant A
  // reading/patching tenant B via the URL (CASL checks the action, not the instance).
  @Get(":id/onboarding")
  @RequirePermission(ORG_PROFILE_READ)
  getOnboarding(@Param("id") id: string, @Req() req: Request & { user?: AuthUser }) {
    this.assertOwnTenant(req, id);
    return this.tenants.getOnboarding(id);
  }

  @Patch(":id/onboarding")
  @RequirePermission(ORG_PROFILE_MANAGE)
  updateOnboarding(
    @Param("id") id: string,
    @Body() dto: UpdateOnboardingDto,
    @Req() req: Request & { user?: AuthUser },
  ) {
    this.assertOwnTenant(req, id);
    return this.tenants.updateOnboarding(id, dto);
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

  // ── Join requests (self-signup → admin approval) — tenant-bound to the session ──
  @Get(":id/join-requests")
  @RequirePermission(MEMBER_MANAGE)
  listJoinRequests(
    @Param("id") id: string,
    @Query("status") status: string | undefined,
    @Req() req: Request & { user?: AuthUser },
  ) {
    this.assertOwnTenant(req, id);
    return this.tenants.listJoinRequests(id, status);
  }

  @Post(":id/join-requests/:requestId/approve")
  @RequirePermission(MEMBER_MANAGE)
  approveJoinRequest(
    @Param("id") id: string,
    @Param("requestId") requestId: string,
    @Body() dto: ApproveJoinRequestDto,
    @Req() req: Request & { user?: AuthUser },
  ) {
    this.assertOwnTenant(req, id);
    return this.flows.approveJoinRequest(id, requestId, { role: dto.role, approvedBy: req.user?.id });
  }

  @Post(":id/join-requests/:requestId/reject")
  @RequirePermission(MEMBER_MANAGE)
  rejectJoinRequest(
    @Param("id") id: string,
    @Param("requestId") requestId: string,
    @Body() _dto: RejectJoinRequestDto,
    @Req() req: Request & { user?: AuthUser },
  ) {
    this.assertOwnTenant(req, id);
    return this.flows.rejectJoinRequest(id, requestId, { rejectedBy: req.user?.id });
  }
}
