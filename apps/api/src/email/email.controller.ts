import { Body, Controller, Get, Param, Put } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";
import { PrismaService } from "../prisma/prisma.service";
import { EmailService } from "./email.service";
import { RequirePermission } from "../auth/require-permission.decorator";

class UpsertTemplateDto {
  @IsString() @MaxLength(200) subject!: string;
  @IsString() @MaxLength(20000) body!: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

// Email is an organiser/owner domain (manage messaging.all covers messaging.template).
const READ = { action: "read", resource: "messaging.template" } as const;
const MANAGE = { action: "manage", resource: "messaging.template" } as const;

@Controller("email")
export class EmailController {
  constructor(
    private readonly email: EmailService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private async tenantId(): Promise<string> {
    const slug = this.config.get<string>("DEFAULT_ORGANIZATION_SLUG", "default");
    const org = await this.prisma.tenant.upsert({ where: { slug }, create: { slug, name: "Default Organization" }, update: {} });
    return org.id;
  }

  // Declared before :id so "health"/"templates" aren't captured as an email id.
  @Get("health")
  @RequirePermission(READ)
  emailHealth() {
    return this.email.emailHealth();
  }

  @Get("templates")
  @RequirePermission(READ)
  async listTemplates() {
    return this.email.listTemplates(await this.tenantId());
  }

  @Get("templates/:key")
  @RequirePermission(READ)
  async getTemplate(@Param("key") key: string) {
    return this.email.getTemplate(await this.tenantId(), key);
  }

  @Put("templates/:key")
  @RequirePermission(MANAGE)
  async upsertTemplate(@Param("key") key: string, @Body() dto: UpsertTemplateDto) {
    return this.email.upsertTemplate(await this.tenantId(), { key, ...dto });
  }

  @Get(":id")
  @RequirePermission(READ)
  async getEmail(@Param("id") id: string) {
    return this.email.getEmail(await this.tenantId(), id);
  }
}
