import { Injectable, NotFoundException } from "@nestjs/common";
import { UserAvatar, UserProfile } from "@yarns/db";
import { PrismaService } from "../prisma/prisma.service";

export interface UserProfileInput {
  displayName?: string | null;
  givenName?: string | null;
  familyName?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
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
