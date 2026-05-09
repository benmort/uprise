import { Module } from "@nestjs/common";
import { EventsModule } from "../common/events/events.module";
import { BlastsController } from "./blasts.controller";
import { BlastsService } from "./blasts.service";
import { ComplianceService } from "./compliance.service";
import { TemplateRendererService } from "./template-renderer.service";

@Module({
  imports: [EventsModule],
  controllers: [BlastsController],
  providers: [BlastsService, ComplianceService, TemplateRendererService],
  exports: [BlastsService],
})
export class BlastsModule {}
