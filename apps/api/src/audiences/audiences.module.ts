import { Module } from "@nestjs/common";
import { AudiencesController } from "./audiences.controller";
import { AudiencesService } from "./audiences.service";
import { QueueModule } from "../common/queue/queue.module";
import { FlagsModule } from "../common/flags/flags.module";

@Module({
  imports: [QueueModule, FlagsModule],
  controllers: [AudiencesController],
  providers: [AudiencesService],
  exports: [AudiencesService],
})
export class AudiencesModule {}
