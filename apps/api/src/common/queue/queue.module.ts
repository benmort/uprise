import { Module } from "@nestjs/common";
import { LoggingModule } from "../logging/logging.module";
import { InMemoryDispatchQueue } from "./in-memory-dispatch.queue";
import { DispatchQueue } from "./dispatch-queue";

@Module({
  imports: [LoggingModule],
  providers: [
    {
      provide: "DispatchQueue",
      useClass: InMemoryDispatchQueue,
    },
  ],
  exports: ["DispatchQueue"],
})
export class QueueModule {}

export type DispatchQueueToken = DispatchQueue;
