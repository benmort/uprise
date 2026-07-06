import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { AudiencesService } from "./audiences.service";
import { AudienceContactsDto, CreateAudienceDto, ListAudiencesDto } from "./dto/audience.dto";
import { RequirePermission } from "../auth/require-permission.decorator";
import { TenantId } from "../auth/tenant-id.decorator";

// Audiences are an organiser/owner domain (volunteers have no access). The cron
// dispatch route is deliberately left ungated — it runs with a Bearer token and
// has no request.user.
const READ = { action: "read", resource: "audience.audience" } as const;
const MANAGE = { action: "manage", resource: "audience.audience" } as const;

@Controller("audiences")
export class AudiencesController {
  constructor(private readonly audiences: AudiencesService) {}

  private validateCsvUpload(file: { mimetype?: string; originalname?: string } | undefined) {
    if (!file) {
      throw new BadRequestException("CSV file is required");
    }
    const mimetype = String(file.mimetype || "").toLowerCase();
    const originalname = String(file.originalname || "");
    const acceptedMimeTypes = new Set(["text/csv", "text/plain", "application/csv", "application/vnd.ms-excel"]);
    const hasAcceptedMime = acceptedMimeTypes.has(mimetype) || mimetype.includes("csv");
    const hasCsvExtension = /\.csv$/i.test(originalname);
    if (!hasAcceptedMime && !hasCsvExtension) {
      throw new BadRequestException(
        `Validation failed (current file type is ${mimetype || "unknown"}, expected type is text/csv or text/plain)`,
      );
    }
  }

  @Post()
  @RequirePermission(MANAGE)
  create(@TenantId() tenantId: string, @Body() dto: CreateAudienceDto) {
    return this.audiences.createAudience(tenantId, dto);
  }

  @Get()
  @RequirePermission(READ)
  list(@TenantId() tenantId: string, @Query() dto: ListAudiencesDto) {
    return this.audiences.listAudiences(tenantId, dto);
  }

  @Get("dispatch-imports")
  @Post("dispatch-imports")
  dispatchImports(@Query("limit") limit?: string) {
    const parsedLimit = limit ? Number(limit) : undefined;
    return this.audiences.dispatchPendingImports(parsedLimit);
  }

  /** Create (or return) the dynamic "all WhatsApp opt-ins" smart audience. */
  @Post("whatsapp-opt-ins")
  @RequirePermission(MANAGE)
  whatsappOptIns(@TenantId() tenantId: string) {
    return this.audiences.ensureWhatsappOptInAudience(tenantId);
  }

  /** Dynamic/static segments for the tenant (backs the admin "Dynamic Segments" card).
   *  Declared BEFORE `@Get(":id")` so "segments" isn't captured as an audience id. */
  @Get("segments")
  @RequirePermission(READ)
  listSegments(@TenantId() tenantId: string) {
    return this.audiences.listSegments(tenantId);
  }

  @Get(":id")
  @RequirePermission(READ)
  getOne(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.audiences.getAudience(tenantId, id);
  }

  @Patch(":id/archive")
  @RequirePermission(MANAGE)
  archive(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.audiences.archiveAudience(tenantId, id);
  }

  @Patch(":id/restore")
  @RequirePermission(MANAGE)
  restore(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.audiences.restoreAudience(tenantId, id);
  }

  @Delete(":id")
  @RequirePermission(MANAGE)
  remove(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.audiences.deleteAudience(tenantId, id);
  }

  @Post(":id/import-csv")
  @RequirePermission(MANAGE)
  @UseInterceptors(FileInterceptor("file"))
  importCsv(
    @TenantId() tenantId: string,
    @Param("id") id: string,
    @UploadedFile() file: any,
  ) {
    this.validateCsvUpload(file);
    return this.audiences.startCsvImport(tenantId, id, file.originalname || "contacts.csv", file.buffer.toString("utf8"));
  }

  @Get(":id/imports/:importId")
  @RequirePermission(READ)
  importStatus(
    @TenantId() tenantId: string,
    @Param("id") id: string,
    @Param("importId") importId: string,
  ) {
    return this.audiences.getImportStatus(tenantId, id, importId);
  }

  @Get(":id/contacts")
  @RequirePermission(READ)
  contacts(@TenantId() tenantId: string, @Param("id") id: string, @Query() dto: AudienceContactsDto) {
    if (dto.query && dto.query.trim()) {
      return this.audiences.searchContacts(tenantId, id, dto.query, dto.limit, dto.offset);
    }
    return this.audiences.listContacts(tenantId, id, dto.limit, dto.offset);
  }

  @Get(":id/export-csv")
  @RequirePermission(READ)
  @Header("Content-Type", "text/csv")
  async exportCsv(@TenantId() tenantId: string, @Param("id") id: string): Promise<string> {
    return this.audiences.exportContactsCsv(tenantId, id);
  }

  @Get(":id/whatsapp-reach")
  @RequirePermission(READ)
  whatsappReach(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.audiences.whatsappReach(tenantId, id);
  }

  @Get(":id/growth")
  @RequirePermission(READ)
  growth(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.audiences.growthMetrics(tenantId, id);
  }

  @Get(":id/segment-summary")
  @RequirePermission(READ)
  summary(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.audiences.segmentationSummary(tenantId, id);
  }
}
