import { Module } from "@nestjs/common";
import { LoggingModule } from "../logging/logging.module";
import { BullmqDispatchQueue } from "./bullmq-dispatch.queue";
import { DispatchQueue } from "./dispatch-queue";
import { QueueConfigService } from "./queue-config.service";
import { DISPATCH_QUEUE_TOKEN } from "./queue.tokens";
import { QueueStatsController } from "./queue-stats.controller";
import { QueueStatsService } from "./queue-stats.service";

@Module({
  imports: [LoggingModule],
  controllers: [QueueStatsController],
  providers: [
    QueueConfigService,
    QueueStatsService,
    {
      provide: DISPATCH_QUEUE_TOKEN,
      useClass: BullmqDispatchQueue,
    },
  ],
  exports: [QueueConfigService, DISPATCH_QUEUE_TOKEN],
})
export class QueueModule {}

export type DispatchQueueToken = DispatchQueue;
