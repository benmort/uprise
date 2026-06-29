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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { IsEmail, IsString, MaxLength, MinLength } from "class-validator";
import type { Request } from "express";
import { AppUserRole } from "@uprise/db";
import { ProfileService } from "./profile.service";
import { IamFlowsService } from "./iam-flows.service";
import { RolesGuard } from "./roles.guard";
import { Roles } from "./roles.decorator";
import type { AuthUser } from "./auth-user";
import { AddAvatarDto, UpdateProfileDto } from "./dto/profile.dto";

class SetMobileDto {
  @IsString() @MaxLength(20) mobile!: string;
}
class CodeDto {
  @IsString() @MaxLength(12) code!: string;
}
class ChangePasswordDto {
  @IsString() currentPassword!: string;
  @IsString() @MinLength(8) @MaxLength(200) newPassword!: string;
}
class ChangeEmailDto {
  @IsEmail() newEmail!: string;
  @IsString() password!: string;
}
class DeleteAccountDto {
  @IsString() password!: string;
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

  // ── Self-service password + email change ──────────────────────────────
  @Post("password/change")
  changePassword(@Req() req: Request & { user?: AuthUser }, @Body() dto: ChangePasswordDto) {
    return this.flows.changePassword(this.userId(req), dto.currentPassword, dto.newPassword);
  }

  @Post("email/change")
  changeEmail(@Req() req: Request & { user?: AuthUser }, @Body() dto: ChangeEmailDto) {
    return this.flows.changeEmail(this.userId(req), dto.newEmail, dto.password);
  }

  // Account deletion is restricted to workspace OWNERs (and the break-glass
  // super-admin, which clears every RolesGuard gate). ORGANISER/VOLUNTEER cannot
  // delete their own account — they must ask an owner.
  @Post("account/delete")
  @UseGuards(RolesGuard)
  @Roles(AppUserRole.OWNER)
  deleteAccount(@Req() req: Request & { user?: AuthUser }, @Body() dto: DeleteAccountDto) {
    return this.flows.deleteAccount(this.userId(req), dto.password);
  }

  @Get("avatars")
  listAvatars(@Req() req: Request & { user?: AuthUser }) {
    return this.profiles.listAvatars(this.userId(req));
  }

  @Post("avatars")
  addAvatar(@Req() req: Request & { user?: AuthUser }, @Body() dto: AddAvatarDto) {
    return this.profiles.addAvatar(this.userId(req), dto.url);
  }

  @Post("avatars/upload")
  @UseInterceptors(FileInterceptor("file"))
  uploadAvatar(
    @Req() req: Request & { user?: AuthUser },
    @UploadedFile() file: { buffer?: Buffer; originalname?: string; mimetype?: string },
  ) {
    return this.profiles.uploadAvatar(this.userId(req), file);
  }

  @Post("avatars/:id/select")
  selectAvatar(@Req() req: Request & { user?: AuthUser }, @Param("id") id: string) {
    return this.profiles.selectAvatar(this.userId(req), id);
  }

  @Post("avatars/clear-selected")
  clearSelectedAvatar(@Req() req: Request & { user?: AuthUser }) {
    return this.profiles.clearSelectedAvatar(this.userId(req));
  }

  @Delete("avatars/:id")
  deleteAvatar(@Req() req: Request & { user?: AuthUser }, @Param("id") id: string) {
    return this.profiles.deleteAvatar(this.userId(req), id);
  }
}
