import { Body, Controller, Get, Param, Put } from "@nestjs/common";
import { IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";
import { EmailService } from "./email.service";
import { RequirePermission } from "../auth/require-permission.decorator";
import { TenantId } from "../auth/tenant-id.decorator";

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
  constructor(private readonly email: EmailService) {}

  // Declared before :id so "health"/"templates" aren't captured as an email id.
  @Get("health")
  @RequirePermission(READ)
  emailHealth() {
    return this.email.emailHealth();
  }

  @Get("templates")
  @RequirePermission(READ)
  async listTemplates(@TenantId() tenantId: string) {
    return this.email.listTemplates(tenantId);
  }

  @Get("templates/:key")
  @RequirePermission(READ)
  async getTemplate(@TenantId() tenantId: string, @Param("key") key: string) {
    return this.email.getTemplate(tenantId, key);
  }

  @Put("templates/:key")
  @RequirePermission(MANAGE)
  async upsertTemplate(
    @TenantId() tenantId: string,
    @Param("key") key: string,
    @Body() dto: UpsertTemplateDto,
  ) {
    return this.email.upsertTemplate(tenantId, { key, ...dto });
  }

  @Get(":id")
  @RequirePermission(READ)
  async getEmail(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.email.getEmail(tenantId, id);
  }
}
