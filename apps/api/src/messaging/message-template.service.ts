import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@uprise/db";
import { PrismaService } from "../prisma/prisma.service";
import { CreateMessageTemplateDto, UpdateMessageTemplateDto } from "./dto/message-template.dto";

const TEMPLATE_VAR_RE = /\{\{\s*(\w+)\s*\}\}/g;

/** CRUD for transactional message templates (meld doc 09/12). */
@Injectable()
export class MessageTemplateService {
  constructor(private readonly prisma: PrismaService) {}

  private extractBodyVars(body: string): string[] {
    const used = new Set<string>();
    for (const match of body.matchAll(TEMPLATE_VAR_RE)) used.add(match[1]);
    return [...used];
  }

  private asStringArray(value: Prisma.JsonValue | null | undefined): string[] | undefined {
    if (!Array.isArray(value)) return undefined;
    return value.filter((v): v is string => typeof v === "string");
  }

  /**
   * Reject a body that references a {{var}} not in its declared `variables` set.
   * When no variables are declared the body is unconstrained (prog parity).
   */
  private assertVariablesDeclared(body: string, variables?: string[]): void {
    if (!variables) return;
    const declared = new Set(variables);
    const undeclared = this.extractBodyVars(body).filter((v) => !declared.has(v));
    if (undeclared.length > 0) {
      throw new BadRequestException(
        `Template body uses undeclared variables: ${undeclared.join(", ")}`,
      );
    }
  }

  async create(tenantId: string, dto: CreateMessageTemplateDto) {
    this.assertVariablesDeclared(dto.body, dto.variables);
    return this.prisma.messageTemplate.create({
      data: {
        tenantId,
        key: dto.key,
        body: dto.body,
        ...(dto.channel ? { channel: dto.channel } : {}),
        ...(dto.kind ? { kind: dto.kind } : {}),
        type: dto.type ?? null,
        category: dto.category ?? null,
        variables: (dto.variables ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        fromNumber: dto.fromNumber ?? null,
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  async list(tenantId: string) {
    return this.prisma.messageTemplate.findMany({
      where: { tenantId },
      orderBy: { updatedAt: "desc" },
    });
  }

  async get(tenantId: string, id: string) {
    const template = await this.prisma.messageTemplate.findFirst({
      where: { id, tenantId },
    });
    if (!template) throw new NotFoundException("Message template not found");
    return template;
  }

  async update(tenantId: string, id: string, dto: UpdateMessageTemplateDto) {
    const existing = await this.get(tenantId, id);
    const body = dto.body ?? existing.body;
    const variables =
      dto.variables ?? this.asStringArray(existing.variables);
    this.assertVariablesDeclared(body, variables);
    return this.prisma.messageTemplate.update({
      where: { id: existing.id },
      data: {
        ...(dto.body !== undefined ? { body: dto.body } : {}),
        ...(dto.channel !== undefined ? { channel: dto.channel } : {}),
        ...(dto.kind !== undefined ? { kind: dto.kind } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.variables !== undefined
          ? { variables: dto.variables as Prisma.InputJsonValue }
          : {}),
        ...(dto.fromNumber !== undefined ? { fromNumber: dto.fromNumber } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }
}
