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

// Audiences are an organiser/owner domain (canvassers have no access). The cron
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
  create(@Body() dto: CreateAudienceDto) {
    return this.audiences.createAudience(dto);
  }

  @Get()
  @RequirePermission(READ)
  list(@Query() dto: ListAudiencesDto) {
    return this.audiences.listAudiences(dto);
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
  whatsappOptIns() {
    return this.audiences.ensureWhatsappOptInAudience();
  }

  @Get(":id")
  @RequirePermission(READ)
  getOne(@Param("id") id: string) {
    return this.audiences.getAudience(id);
  }

  @Patch(":id/archive")
  @RequirePermission(MANAGE)
  archive(@Param("id") id: string) {
    return this.audiences.archiveAudience(id);
  }

  @Patch(":id/restore")
  @RequirePermission(MANAGE)
  restore(@Param("id") id: string) {
    return this.audiences.restoreAudience(id);
  }

  @Delete(":id")
  @RequirePermission(MANAGE)
  remove(@Param("id") id: string) {
    return this.audiences.deleteAudience(id);
  }

  @Post(":id/import-csv")
  @RequirePermission(MANAGE)
  @UseInterceptors(FileInterceptor("file"))
  importCsv(
    @Param("id") id: string,
    @UploadedFile() file: any,
  ) {
    this.validateCsvUpload(file);
    return this.audiences.startCsvImport(id, file.originalname || "contacts.csv", file.buffer.toString("utf8"));
  }

  @Get(":id/imports/:importId")
  @RequirePermission(READ)
  importStatus(
    @Param("id") id: string,
    @Param("importId") importId: string,
  ) {
    return this.audiences.getImportStatus(id, importId);
  }

  @Get(":id/contacts")
  @RequirePermission(READ)
  contacts(@Param("id") id: string, @Query() dto: AudienceContactsDto) {
    if (dto.query && dto.query.trim()) {
      return this.audiences.searchContacts(id, dto.query, dto.limit, dto.offset);
    }
    return this.audiences.listContacts(id, dto.limit, dto.offset);
  }

  @Get(":id/export-csv")
  @RequirePermission(READ)
  @Header("Content-Type", "text/csv")
  async exportCsv(@Param("id") id: string): Promise<string> {
    return this.audiences.exportContactsCsv(id);
  }

  @Get(":id/whatsapp-reach")
  @RequirePermission(READ)
  whatsappReach(@Param("id") id: string) {
    return this.audiences.whatsappReach(id);
  }

  @Get(":id/growth")
  @RequirePermission(READ)
  growth(@Param("id") id: string) {
    return this.audiences.growthMetrics(id);
  }

  @Get(":id/segment-summary")
  @RequirePermission(READ)
  summary(@Param("id") id: string) {
    return this.audiences.segmentationSummary(id);
  }
}
