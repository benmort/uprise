import { Module } from "@nestjs/common";
import { AudiencesController } from "./audiences.controller";
import { AudiencesService } from "./audiences.service";
import { SegmentEvaluatorService } from "./segment-evaluator.service";
import { SegmentLeafResolverService } from "./segment-leaf-resolver.service";
import { SegmentPreviewService } from "./segment-preview.service";
import { CustomQueryService } from "./custom-query.service";
import { SegmentsController } from "./segments.controller";
import { SegmentsService } from "./segments.service";
import { SegmentAuthoringService } from "./segment-authoring.service";
import { QueueModule } from "../common/queue/queue.module";
import { FlagsModule } from "../common/flags/flags.module";
import { ContactsModule } from "../contacts/contacts.module";
import { InsightsModule } from "../insights/insights.module";

@Module({
  imports: [QueueModule, FlagsModule, ContactsModule, InsightsModule],
  controllers: [AudiencesController, SegmentsController],
  providers: [
    AudiencesService,
    SegmentEvaluatorService,
    SegmentLeafResolverService,
    SegmentPreviewService,
    CustomQueryService,
    SegmentsService,
    SegmentAuthoringService,
  ],
  exports: [AudiencesService, SegmentEvaluatorService],
})
export class AudiencesModule {}
