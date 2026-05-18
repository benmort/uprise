import { Module } from "@nestjs/common";
import { LoggingModule } from "../logging/logging.module";
import { BullmqDispatchQueue } from "./bullmq-dispatch.queue";
import { DispatchQueue } from "./dispatch-queue";
import { QueueConfigService } from "./queue-config.service";
import { DISPATCH_QUEUE_TOKEN } from "./queue.tokens";

@Module({
  imports: [LoggingModule],
  providers: [
    QueueConfigService,
    {
      provide: DISPATCH_QUEUE_TOKEN,
      useClass: BullmqDispatchQueue,
    },
  ],
  exports: [QueueConfigService, DISPATCH_QUEUE_TOKEN],
})
export class QueueModule {}

export type DispatchQueueToken = DispatchQueue;
