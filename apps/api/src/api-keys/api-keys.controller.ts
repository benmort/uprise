import { Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";
import { ApiKeysService } from "./api-keys.service";
import { CreateApiKeyDto } from "./dto/api-keys.dto";
import { RequirePermission } from "../auth/require-permission.decorator";

// API keys are an owner/admin surface (granted via `manage tenant.all`).
const MANAGE = { action: "manage", resource: "tenant.api-keys" } as const;
const READ = { action: "read", resource: "tenant.api-keys" } as const;

@Controller("api-keys")
export class ApiKeysController {
  constructor(private readonly apiKeys: ApiKeysService) {}

  @Get()
  @RequirePermission(READ)
  list() {
    return this.apiKeys.list();
  }

  @Post()
  @RequirePermission(MANAGE)
  issue(@Body() dto: CreateApiKeyDto) {
    return this.apiKeys.issue(dto);
  }

  @Delete(":id")
  @RequirePermission(MANAGE)
  revoke(@Param("id") id: string) {
    return this.apiKeys.revoke(id);
  }
}
