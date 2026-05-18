import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { JobsOptions, Queue } from "bullmq";
import { DispatchQueue, DispatchQueueJob, DispatchQueueName } from "./dispatch-queue";
import { DomainLogger } from "../logging/domain-logger.service";
import { QueueConfigService } from "./queue-config.service";

@Injectable()
export class BullmqDispatchQueue implements DispatchQueue, OnModuleDestroy {
  private readonly queues = new Map<DispatchQueueName, Queue>();

  constructor(
    private readonly logger: DomainLogger,
    private readonly queueConfig: QueueConfigService,
  ) {}

  async enqueue<TPayload>(job: DispatchQueueJob<TPayload>): Promise<{ jobId: string; queued: boolean }> {
    const queue = this.getQueue(job.queue);
    const existing = await queue.getJob(job.id);
    if (existing) {
      return { jobId: String(existing.id), queued: false };
    }

    const delayMs = Math.max(0, (job.runAt?.getTime() || Date.now()) - Date.now());
    const options: JobsOptions = {
      jobId: job.id,
      delay: delayMs,
      attempts: Math.max(1, Math.trunc(job.attempts ?? this.queueConfig.defaultAttempts)),
      removeOnComplete: job.removeOnComplete ?? 1000,
      removeOnFail: false,
    };
    const backoffMs = Math.max(0, Math.trunc(job.backoffMs ?? this.queueConfig.defaultBackoffMs));
    if (backoffMs > 0) {
      options.backoff = { type: "exponential", delay: backoffMs };
    }

    const created = await queue.add(job.type, job.payload, options);
    this.logger.log("queue", "Enqueued BullMQ job", {
      queue: job.queue,
      type: job.type,
      jobId: created.id,
    });
    return { jobId: String(created.id), queued: true };
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(Array.from(this.queues.values()).map((queue) => queue.close()));
    this.queues.clear();
  }

  private getQueue(name: DispatchQueueName): Queue {
    const existing = this.queues.get(name);
    if (existing) return existing;
    const created = new Queue(name, {
      prefix: this.queueConfig.queuePrefix,
      connection: this.queueConfig.queueConnection,
    });
    this.queues.set(name, created);
    return created;
  }
}
