import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { put } from "@vercel/blob";
import { UserAvatar, UserProfile } from "@uprise/db";
import { PrismaService } from "../prisma/prisma.service";

export interface UserProfileInput {
  displayName?: string | null;
  givenName?: string | null;
  familyName?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
  dateOfBirth?: string | Date | null;
  facebookUrl?: string | null;
  twitterUrl?: string | null;
  linkedinUrl?: string | null;
  instagramUrl?: string | null;
  websiteUrl?: string | null;
}

/**
 * User profile + avatars (meld doc 11), folded into IAM. All methods are
 * self-scoped to the caller's userId (no cross-user access), so routes need
 * only a session — no CASL permission.
 */
@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string): Promise<UserProfile> {
    const existing = await this.prisma.userProfile.findUnique({ where: { userId } });
    if (existing) return existing;
    // Lazily seed from the User identity row.
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    return this.prisma.userProfile.create({
      data: { userId, displayName: user?.displayName ?? null },
    });
  }

  async upsertProfile(userId: string, input: UserProfileInput): Promise<UserProfile> {
    const data = {
      displayName: input.displayName ?? null,
      givenName: input.givenName ?? null,
      familyName: input.familyName ?? null,
      phone: input.phone ?? null,
      avatarUrl: input.avatarUrl ?? null,
      bio: input.bio ?? null,
      dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : null,
      facebookUrl: input.facebookUrl ?? null,
      twitterUrl: input.twitterUrl ?? null,
      linkedinUrl: input.linkedinUrl ?? null,
      instagramUrl: input.instagramUrl ?? null,
      websiteUrl: input.websiteUrl ?? null,
    };
    const profile = await this.prisma.userProfile.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
    // Mirror displayName onto the base User row so reads of User.displayName don't drift (WS3).
    if (input.displayName && input.displayName.trim()) {
      await this.prisma.user.update({ where: { id: userId }, data: { displayName: input.displayName.trim() } });
    }
    return profile;
  }

  // ── Avatars ─────────────────────────────────────────────────────────
  async listAvatars(userId: string): Promise<UserAvatar[]> {
    return this.prisma.userAvatar.findMany({ where: { userId }, orderBy: { isSelected: "desc" } });
  }

  /**
   * Upload an avatar image to blob storage, then register + select it. Mirrors the
   * canvassing door-photo upload (Vercel Blob, BLOB_READ_WRITE_TOKEN). Selecting is
   * handled by addAvatar (first avatar auto-selects); we select explicitly so an
   * upload always becomes the active avatar.
   */
  async uploadAvatar(
    userId: string,
    file?: { buffer?: Buffer; originalname?: string; mimetype?: string },
  ): Promise<UserAvatar> {
    if (!file?.buffer) throw new BadRequestException("No image provided");
    // Blob credentials resolve from the env: a static BLOB_READ_WRITE_TOKEN (local/dev) or,
    // in the Vercel runtime, OIDC (VERCEL_OIDC_TOKEN + BLOB_STORE_ID). Require at least one.
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token && !process.env.BLOB_STORE_ID) throw new BadRequestException("Image storage is not configured");
    const ext = (file.originalname?.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
    const key = `avatars/${userId}-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext || "jpg"}`;
    const { url } = await put(key, file.buffer, {
      access: "public",
      contentType: file.mimetype || "image/jpeg",
      ...(token ? { token } : {}),
    });
    const avatar = await this.addAvatar(userId, url);
    return avatar.isSelected ? avatar : this.selectAvatar(userId, avatar.id);
  }

  /** Add an avatar; the first avatar a user has becomes the selected one. */
  async addAvatar(userId: string, url: string): Promise<UserAvatar> {
    const count = await this.prisma.userAvatar.count({ where: { userId } });
    const isSelected = count === 0;
    const avatar = await this.prisma.userAvatar.create({ data: { userId, url, isSelected } });
    if (isSelected) {
      await this.prisma.userProfile.upsert({
        where: { userId },
        create: { userId, avatarUrl: url },
        update: { avatarUrl: url },
      });
    }
    return avatar;
  }

  /**
   * Select an avatar. Invariant: exactly one isSelected per user — siblings are
   * flipped false and the chosen one true in one transaction. Also mirrors the
   * url onto UserProfile.avatarUrl.
   */
  async selectAvatar(userId: string, avatarId: string): Promise<UserAvatar> {
    const target = await this.prisma.userAvatar.findFirst({ where: { id: avatarId, userId } });
    if (!target) throw new NotFoundException("Avatar not found");
    const [, selected] = await this.prisma.$transaction([
      this.prisma.userAvatar.updateMany({ where: { userId }, data: { isSelected: false } }),
      this.prisma.userAvatar.update({ where: { id: avatarId }, data: { isSelected: true } }),
      this.prisma.userProfile.upsert({
        where: { userId },
        create: { userId, avatarUrl: target.url },
        update: { avatarUrl: target.url },
      }),
    ]);
    return selected;
  }

  /** Clear the selected avatar: no avatar selected + blank the profile avatarUrl. */
  async clearSelectedAvatar(userId: string): Promise<{ ok: true }> {
    await this.prisma.$transaction([
      this.prisma.userAvatar.updateMany({ where: { userId }, data: { isSelected: false } }),
      this.prisma.userProfile.updateMany({ where: { userId }, data: { avatarUrl: null } }),
    ]);
    return { ok: true };
  }

  async deleteAvatar(userId: string, avatarId: string): Promise<{ ok: true }> {
    const target = await this.prisma.userAvatar.findFirst({ where: { id: avatarId, userId } });
    if (!target) throw new NotFoundException("Avatar not found");
    await this.prisma.userAvatar.delete({ where: { id: avatarId } });
    // If the selected avatar was removed, promote the most recent remaining one.
    if (target.isSelected) {
      const next = await this.prisma.userAvatar.findFirst({ where: { userId }, orderBy: { id: "desc" } });
      if (next) {
        await this.prisma.$transaction([
          this.prisma.userAvatar.update({ where: { id: next.id }, data: { isSelected: true } }),
          this.prisma.userProfile.upsert({
            where: { userId },
            create: { userId, avatarUrl: next.url },
            update: { avatarUrl: next.url },
          }),
        ]);
      } else {
        await this.prisma.userProfile.updateMany({ where: { userId }, data: { avatarUrl: null } });
      }
    }
    return { ok: true };
  }
}
