import { Injectable, HttpStatus } from "@nestjs/common";
import { EngagementChannel } from "@uprise/db";
import { PrismaService } from "../prisma/prisma.service";
import { ApiHttpException } from "../common/http/api-response";

export type ScriptStepInput = {
  bodyText: string;
  outcomeKey?: string | null;
  orderIndex?: number;
};

@Injectable()
export class ScriptsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string) {
    const scripts = await this.prisma.script.findMany({
      where: { tenantId, isArchived: false },
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { steps: true } } },
    });
    // Campaigns each script is bound to (ContentBinding) — the door resolves its script
    // by matching its campaign against this list, so reuse across campaigns works.
    const bindings = await this.prisma.contentBinding.findMany({
      where: { tenantId, contentType: "SCRIPT", objectType: "CANVASS_CAMPAIGN" },
      select: { contentId: true, objectId: true },
    });
    const campaignsByScript = new Map<string, string[]>();
    for (const b of bindings) {
      const list = campaignsByScript.get(b.contentId) ?? [];
      list.push(b.objectId);
      campaignsByScript.set(b.contentId, list);
    }
    return scripts.map((s) => ({
      id: s.id,
      name: s.name,
      channel: s.channel,
      campaignIds: campaignsByScript.get(s.id) ?? [],
      stepCount: s._count.steps,
      updatedAt: s.updatedAt,
    }));
  }

  async get(tenantId: string, id: string) {
    const script = await this.prisma.script.findFirst({
      where: { id, tenantId },
      include: { steps: { orderBy: { orderIndex: "asc" } } },
    });
    if (!script) throw new ApiHttpException("SCRIPT_NOT_FOUND", "Script not found", HttpStatus.NOT_FOUND);
    return script;
  }

  async create(
    tenantId: string,
    input: { name: string; channel?: EngagementChannel; steps?: ScriptStepInput[] },
  ) {
    return this.prisma.script.create({
      data: {
        tenantId,
        name: input.name,
        channel: input.channel ?? EngagementChannel.BOTH,
        steps: input.steps
          ? {
              create: input.steps.map((s, i) => ({
                bodyText: s.bodyText,
                outcomeKey: s.outcomeKey ?? null,
                orderIndex: s.orderIndex ?? i,
              })),
            }
          : undefined,
      },
      include: { steps: { orderBy: { orderIndex: "asc" } } },
    });
  }

  async update(
    tenantId: string,
    id: string,
    input: { name?: string; channel?: EngagementChannel; steps?: ScriptStepInput[] },
  ) {
    const existing = await this.prisma.script.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!existing) throw new ApiHttpException("SCRIPT_NOT_FOUND", "Script not found", HttpStatus.NOT_FOUND);
    return this.prisma.$transaction(async (tx) => {
      await tx.script.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.channel !== undefined ? { channel: input.channel } : {}),
        },
      });
      if (input.steps) {
        await tx.scriptStep.deleteMany({ where: { scriptId: id } });
        await tx.scriptStep.createMany({
          data: input.steps.map((s, i) => ({
            scriptId: id,
            bodyText: s.bodyText,
            outcomeKey: s.outcomeKey ?? null,
            orderIndex: s.orderIndex ?? i,
          })),
        });
      }
      return tx.script.findUnique({ where: { id }, include: { steps: { orderBy: { orderIndex: "asc" } } } });
    });
  }

  async archive(tenantId: string, id: string) {
    const existing = await this.prisma.script.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!existing) throw new ApiHttpException("SCRIPT_NOT_FOUND", "Script not found", HttpStatus.NOT_FOUND);
    await this.prisma.script.update({ where: { id }, data: { isArchived: true } });
    return { archived: true };
  }
}
