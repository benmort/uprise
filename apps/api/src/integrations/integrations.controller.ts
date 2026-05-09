import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { IntegrationsService } from "./integrations.service";
import {
  SampleIntegrationListDto,
  SearchIntegrationListsDto,
  SyncIntegrationListDto,
  TestIntegrationConnectionDto,
  UpsertIntegrationConnectionDto,
} from "./dto/integration.dto";

@Controller("integrations")
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Post("connections")
  upsertConnection(@Body() dto: UpsertIntegrationConnectionDto) {
    return this.integrations.upsertConnection(dto);
  }

  @Post("connections/test")
  testConnection(@Body() dto: TestIntegrationConnectionDto) {
    return this.integrations.testConnection(dto);
  }

  @Get("lists/search")
  searchLists(@Query() dto: SearchIntegrationListsDto) {
    return this.integrations.searchLists(dto);
  }

  @Get("lists/sample")
  sampleList(@Query() dto: SampleIntegrationListDto) {
    return this.integrations.sampleList(dto);
  }

  @Post("lists/sync")
  syncList(@Body() dto: SyncIntegrationListDto) {
    return this.integrations.syncList(dto);
  }

  @Get("sync-jobs")
  syncJobs(@Query("limit") limit?: string) {
    const n = Number(limit || "20");
    return this.integrations.getSyncJobs(Number.isFinite(n) ? n : 20);
  }
}
