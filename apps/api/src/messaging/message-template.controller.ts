import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { MessageTemplateService } from "./message-template.service";
import { CreateMessageTemplateDto, UpdateMessageTemplateDto } from "./dto/message-template.dto";
import { RequirePermission } from "../auth/require-permission.decorator";

// Transactional template management (meld doc 09/12). Gated on messaging.template;
// organiser/owner hold `manage messaging.all`.
const READ = { action: "read", resource: "messaging.template" } as const;
const CREATE = { action: "create", resource: "messaging.template" } as const;
const UPDATE = { action: "update", resource: "messaging.template" } as const;

@Controller("message-templates")
export class MessageTemplateController {
  constructor(private readonly templates: MessageTemplateService) {}

  @Post()
  @RequirePermission(CREATE)
  create(@Body() dto: CreateMessageTemplateDto) {
    return this.templates.create(dto);
  }

  @Get()
  @RequirePermission(READ)
  list() {
    return this.templates.list();
  }

  @Get(":id")
  @RequirePermission(READ)
  get(@Param("id") id: string) {
    return this.templates.get(id);
  }

  @Patch(":id")
  @RequirePermission(UPDATE)
  update(@Param("id") id: string, @Body() dto: UpdateMessageTemplateDto) {
    return this.templates.update(id, dto);
  }
}
