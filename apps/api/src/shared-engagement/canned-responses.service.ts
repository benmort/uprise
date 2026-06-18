import { Injectable } from "@nestjs/common";
import { CannedResponse, CannedVisibility, EngagementChannel } from "../../src/generated/prisma";
import { PrismaService } from "../prisma/prisma.service";
import { ApiHttpException } from "../common/http/api-response";

export type CreateCannedResponseInput = {
  title: string;
  body: string;
  channel?: EngagementChannel;
  visibility?: CannedVisibility;
  ownerId?: string | null;
  dispositionCode?: string | null;
  surveyOptionId?: string | null;
};

@Injectable()
export class CannedResponsesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The canned-response library visible for a channel: org-wide + auto-send
   * tiers always, plus the requesting user's personal tier. Ordered most-recent
   * first so the ranking layer (AI) can re-order without losing the default.
   */
  async listForChannel(
    organizationId: string,
    channel: EngagementChannel,
    ownerId?: string | null,
  ): Promise<CannedResponse[]> {
    return this.prisma.cannedResponse.findMany({
      where: {
        organizationId,
        isArchived: false,
        channel: { in: [channel, EngagementChannel.BOTH] },
        OR: [
          { visibility: { in: [CannedVisibility.ORG, CannedVisibility.AUTO_SEND] } },
          ownerId ? { visibility: CannedVisibility.PERSONAL, ownerId } : { id: "__none__" },
        ],
      },
      orderBy: { updatedAt: "desc" },
    });
  }

  async create(organizationId: string, input: CreateCannedResponseInput): Promise<CannedResponse> {
    return this.prisma.cannedResponse.create({
      data: {
        organizationId,
        title: input.title,
        body: input.body,
        channel: input.channel ?? EngagementChannel.SMS,
        visibility: input.visibility ?? CannedVisibility.ORG,
        ownerId: input.visibility === CannedVisibility.PERSONAL ? input.ownerId ?? null : null,
        dispositionCode: input.dispositionCode ?? null,
        surveyOptionId: input.surveyOptionId ?? null,
      },
    });
  }

  async getById(organizationId: string, id: string): Promise<CannedResponse | null> {
    return this.prisma.cannedResponse.findFirst({ where: { id, organizationId } });
  }

  async update(
    organizationId: string,
    id: string,
    input: Partial<CreateCannedResponseInput>,
  ): Promise<CannedResponse> {
    const existing = await this.getById(organizationId, id);
    if (!existing) throw new ApiHttpException("CANNED_NOT_FOUND", "Canned response not found");
    const visibility = input.visibility ?? existing.visibility;
    return this.prisma.cannedResponse.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.body !== undefined ? { body: input.body } : {}),
        ...(input.channel !== undefined ? { channel: input.channel } : {}),
        ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
        ...(input.dispositionCode !== undefined ? { dispositionCode: input.dispositionCode } : {}),
        // Keep ownerId consistent with visibility: only PERSONAL carries an owner.
        ownerId: visibility === CannedVisibility.PERSONAL ? input.ownerId ?? existing.ownerId ?? null : null,
      },
    });
  }

  /** Soft-delete: archive so historical dispositions logged against it stay valid. */
  async archive(organizationId: string, id: string): Promise<{ archived: boolean }> {
    const existing = await this.getById(organizationId, id);
    if (!existing) throw new ApiHttpException("CANNED_NOT_FOUND", "Canned response not found");
    await this.prisma.cannedResponse.update({ where: { id }, data: { isArchived: true } });
    return { archived: true };
  }
}
