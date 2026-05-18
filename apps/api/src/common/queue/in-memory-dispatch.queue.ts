import { Injectable } from "@nestjs/common";
import { DispatchQueue, DispatchQueueJob } from "./dispatch-queue";
import { DomainLogger } from "../logging/domain-logger.service";

@Injectable()
export class InMemoryDispatchQueue implements DispatchQueue {
  constructor(private readonly logger: DomainLogger) {}

  async enqueue<TPayload>(job: DispatchQueueJob<TPayload>): Promise<{ jobId: string; queued: boolean }> {
    const delayMs = Math.max(0, (job.runAt?.getTime() || Date.now()) - Date.now());
    setTimeout(() => {
      this.logger.log("queue", "Queued job became due", {
        jobId: job.id,
        queue: job.queue,
        type: job.type,
      });
    }, delayMs);
    return {
      jobId: job.id,
      queued: true,
    };
  }
}
