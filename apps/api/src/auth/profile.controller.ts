import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import { IsString, MaxLength } from "class-validator";
import type { Request } from "express";
import { ProfileService } from "./profile.service";
import { IamFlowsService } from "./iam-flows.service";
import type { AuthUser } from "./auth-user";
import { AddAvatarDto, UpdateProfileDto } from "./dto/profile.dto";

class SetMobileDto {
  @IsString() @MaxLength(20) mobile!: string;
}
class CodeDto {
  @IsString() @MaxLength(12) code!: string;
}

/**
 * Self-service profile + avatars (meld doc 11) + 2FA enrolment / mobile capture
 * (WS3 — without this the SMS-2FA login flow is dead code). Every route operates on
 * the caller's own userId — no cross-user access — so they need only a session.
 */
@Controller("iam")
export class ProfileController {
  constructor(
    private readonly profiles: ProfileService,
    private readonly flows: IamFlowsService,
  ) {}

  private userId(req: Request & { user?: AuthUser }): string {
    const id = req.user?.id;
    if (!id) throw new UnauthorizedException("Authentication required");
    return id;
  }

  @Get("profile")
  getProfile(@Req() req: Request & { user?: AuthUser }) {
    return this.profiles.getProfile(this.userId(req));
  }

  @Put("profile")
  updateProfile(@Req() req: Request & { user?: AuthUser }, @Body() dto: UpdateProfileDto) {
    return this.profiles.upsertProfile(this.userId(req), dto);
  }

  // ── Mobile capture + 2FA enrolment (WS3) ──────────────────────────────
  @Put("profile/mobile")
  setMobile(@Req() req: Request & { user?: AuthUser }, @Body() dto: SetMobileDto) {
    return this.flows.setMobile(this.userId(req), dto.mobile);
  }

  @Post("profile/mobile/send")
  sendMobile(@Req() req: Request & { user?: AuthUser }) {
    return this.flows.sendMobileVerification(this.userId(req));
  }

  @Post("profile/mobile/verify")
  verifyMobile(@Req() req: Request & { user?: AuthUser }, @Body() dto: CodeDto) {
    return this.flows.confirmMobileVerification(this.userId(req), dto.code);
  }

  @Post("profile/2fa/enable")
  enable2fa(@Req() req: Request & { user?: AuthUser }) {
    return this.flows.enable2fa(this.userId(req));
  }

  @Post("profile/2fa/disable")
  disable2fa(@Req() req: Request & { user?: AuthUser }) {
    return this.flows.disable2fa(this.userId(req));
  }

  @Get("avatars")
  listAvatars(@Req() req: Request & { user?: AuthUser }) {
    return this.profiles.listAvatars(this.userId(req));
  }

  @Post("avatars")
  addAvatar(@Req() req: Request & { user?: AuthUser }, @Body() dto: AddAvatarDto) {
    return this.profiles.addAvatar(this.userId(req), dto.url);
  }

  @Post("avatars/:id/select")
  selectAvatar(@Req() req: Request & { user?: AuthUser }, @Param("id") id: string) {
    return this.profiles.selectAvatar(this.userId(req), id);
  }

  @Delete("avatars/:id")
  deleteAvatar(@Req() req: Request & { user?: AuthUser }, @Param("id") id: string) {
    return this.profiles.deleteAvatar(this.userId(req), id);
  }
}
