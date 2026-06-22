import { Module } from "@nestjs/common";
import { AudiencesController } from "./audiences.controller";
import { AudiencesService } from "./audiences.service";
import { SegmentEvaluatorService } from "./segment-evaluator.service";
import { QueueModule } from "../common/queue/queue.module";
import { FlagsModule } from "../common/flags/flags.module";
import { ContactsModule } from "../contacts/contacts.module";

@Module({
  imports: [QueueModule, FlagsModule, ContactsModule],
  controllers: [AudiencesController],
  providers: [AudiencesService, SegmentEvaluatorService],
  exports: [AudiencesService, SegmentEvaluatorService],
})
export class AudiencesModule {}
