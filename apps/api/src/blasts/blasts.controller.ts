import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { BlastsService } from "./blasts.service";
import {
  CreateBlastDto,
  ListBlastsDto,
  ProofBlastDto,
  ScheduleBlastDto,
  UpdateBlastDto,
} from "./dto/blast.dto";

@Controller("blasts")
export class BlastsController {
  constructor(private readonly blasts: BlastsService) {}

  @Post()
  create(@Body() dto: CreateBlastDto) {
    return this.blasts.createDraft(dto);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateBlastDto) {
    return this.blasts.updateDraft(id, dto);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.blasts.deleteBlast(id);
  }

  @Post(":id/proof-preview")
  proofPreview(@Param("id") id: string, @Body() dto: ProofBlastDto) {
    return this.blasts.previewProof(id, dto);
  }

  @Post(":id/proofed")
  markProofed(@Param("id") id: string) {
    return this.blasts.markProofed(id);
  }

  @Post(":id/schedule")
  schedule(@Param("id") id: string, @Body() dto: ScheduleBlastDto) {
    return this.blasts.schedule(id, dto);
  }

  @Post(":id/send")
  sendNow(@Param("id") id: string) {
    return this.blasts.sendNow(id);
  }

  @Get("dispatch-due")
  @Post("dispatch-due")
  dispatchDue(@Query("limit") limit?: string) {
    const parsedLimit = limit ? Number(limit) : undefined;
    return this.blasts.dispatchDueScheduled(parsedLimit);
  }

  @Post(":id/retry-failed")
  retryFailed(@Param("id") id: string) {
    return this.blasts.retryFailed(id);
  }

  @Get()
  list(@Query() _dto: ListBlastsDto) {
    return this.blasts.listBlasts();
  }
}
