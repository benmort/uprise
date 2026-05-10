import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseFilePipeBuilder,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { AudiencesService } from "./audiences.service";
import { AudienceContactsDto, CreateAudienceDto, ListAudiencesDto } from "./dto/audience.dto";

@Controller("audiences")
export class AudiencesController {
  constructor(private readonly audiences: AudiencesService) {}

  @Post()
  create(@Body() dto: CreateAudienceDto) {
    return this.audiences.createAudience(dto);
  }

  @Get()
  list(@Query() dto: ListAudiencesDto) {
    return this.audiences.listAudiences(dto);
  }

  @Get(":id")
  getOne(@Param("id") id: string) {
    return this.audiences.getAudience(id);
  }

  @Patch(":id/archive")
  archive(@Param("id") id: string) {
    return this.audiences.archiveAudience(id);
  }

  @Patch(":id/restore")
  restore(@Param("id") id: string) {
    return this.audiences.restoreAudience(id);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.audiences.deleteAudience(id);
  }

  @Post(":id/import-csv")
  @UseInterceptors(FileInterceptor("file"))
  importCsv(
    @Param("id") id: string,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({ fileType: /(csv|plain)/ })
        .build({ fileIsRequired: true }),
    )
    file: any,
  ) {
    return this.audiences.importCsv(id, file.originalname || "contacts.csv", file.buffer.toString("utf8"));
  }

  @Get(":id/contacts")
  contacts(@Param("id") id: string, @Query() dto: AudienceContactsDto) {
    if (dto.query && dto.query.trim()) {
      return this.audiences.searchContacts(id, dto.query, dto.limit, dto.offset);
    }
    return this.audiences.listContacts(id, dto.limit, dto.offset);
  }

  @Get(":id/export-csv")
  @Header("Content-Type", "text/csv")
  async exportCsv(@Param("id") id: string): Promise<string> {
    return this.audiences.exportContactsCsv(id);
  }

  @Get(":id/growth")
  growth(@Param("id") id: string) {
    return this.audiences.growthMetrics(id);
  }

  @Get(":id/segment-summary")
  summary(@Param("id") id: string) {
    return this.audiences.segmentationSummary(id);
  }
}
