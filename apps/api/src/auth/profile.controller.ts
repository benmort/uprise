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
import type { Request } from "express";
import { ProfileService } from "./profile.service";
import type { AuthUser } from "./auth-user";
import { AddAvatarDto, UpdateProfileDto } from "./dto/profile.dto";

/**
 * Self-service profile + avatars (meld doc 11). Every route operates on the
 * caller's own userId — no cross-user access — so they need only a session
 * (no @RequirePermission; the AbilityGuard is a no-op here).
 */
@Controller("iam")
export class ProfileController {
  constructor(private readonly profiles: ProfileService) {}

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
