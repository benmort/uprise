import { Controller, Get, Post, Query } from "@nestjs/common";
import { WhatsappService } from "./whatsapp.service";

@Controller("whatsapp")
export class WhatsappController {
  constructor(private readonly whatsapp: WhatsappService) {}

  @Get("templates")
  listTemplates(@Query("status") status?: string) {
    return this.whatsapp.listTemplates({ status });
  }

  @Post("templates/sync")
  syncTemplates() {
    return this.whatsapp.syncTemplates();
  }
}
