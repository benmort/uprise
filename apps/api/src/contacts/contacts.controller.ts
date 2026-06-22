import { Controller, Get, HttpStatus, Param, Query, UseGuards } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { RolesGuard } from "../auth/roles.guard";
import { ApiHttpException } from "../common/http/api-response";
import { ContactsService } from "./contacts.service";

@Controller("contacts")
@UseGuards(RolesGuard)
export class ContactsController {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly contacts: ContactsService,
  ) {}

  private async ensureOrganization() {
    const slug = this.config.get<string>("DEFAULT_ORGANIZATION_SLUG", "default");
    return this.prisma.tenant.upsert({
      where: { slug },
      create: { slug, name: "Default Organization" },
      update: {},
    });
  }

  @Get()
  async search(@Query("query") query?: string) {
    const org = await this.ensureOrganization();
    return this.contacts.search(org.id, query ?? "");
  }

  @Get(":id")
  async profile(@Param("id") id: string) {
    const org = await this.ensureOrganization();
    const profile = await this.contacts.getProfile(org.id, id);
    if (!profile) {
      throw new ApiHttpException("CONTACT_NOT_FOUND", "Contact not found", HttpStatus.NOT_FOUND);
    }
    return profile;
  }
}
