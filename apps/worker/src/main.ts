import "reflect-metadata";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { config as dotenvConfig } from "dotenv";
import { NestFactory } from "@nestjs/core";
import { Job, QueueEvents, Worker } from "bullmq";
import { AudiencesService } from "../../api/src/audiences/audiences.service";
import { BlastsService } from "../../api/src/blasts/blasts.service";
import { DomainLogger } from "../../api/src/common/logging/domain-logger.service";
import { QueueConfigService } from "../../api/src/common/queue/queue-config.service";
import {
  isAudienceImportBatchJobPayload,
  isBlastRetryFailedJobPayload,
  isBlastSendBatchJobPayload,
} from "../../api/src/common/queue/queue.payloads";
import { QUEUE_JOB_TYPES, QUEUE_NAMES } from "../../api/src/common/queue/queue.constants";

type WorkerQueueMetrics = {
  queue: string;
  completed: number;
  failed: number;
  active: number;
  waiting: number;
  delayed: number;
  stalled: number;
  lastError?: string;
};

const envFileCandidates = [
  resolve(process.cwd(), "apps/worker/.env"),
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), "apps/api/.env"),
  resolve(process.cwd(), "../api/.env"),
];
for (const envPath of envFileCandidates) {
  if (!existsSync(envPath)) continue;
  dotenvConfig({ path: envPath, override: false });
}

async function bootstrap(): Promise<void> {
  const { AppModule } = await import("../../api/src/app.module");
  const app = await NestFactory.createApplicationContext(AppModule);
  const queueConfig = app.get(QueueConfigService);
  const audiences = app.get(AudiencesService);
  const blasts = app.get(BlastsService);
  const logger = app.get(DomainLogger);

  const connection = queueConfig.queueConnection;
  const prefix = queueConfig.queuePrefix;
  const metricsMap = new Map<string, WorkerQueueMetrics>();

  const ensureMetrics = (queue: string): WorkerQueueMetrics => {
    const existing = metricsMap.get(queue);
    if (existing) return existing;
    const created: WorkerQueueMetrics = {
      queue,
      completed: 0,
      failed: 0,
      active: 0,
      waiting: 0,
      delayed: 0,
      stalled: 0,
    };
    metricsMap.set(queue, created);
    return created;
  };

  const workers = [
    new Worker(
      QUEUE_NAMES.AUDIENCE_IMPORT,
      async (job: Job) => {
        if (job.name !== QUEUE_JOB_TYPES.AUDIENCE_IMPORT_BATCH) return null;
        if (!isAudienceImportBatchJobPayload(job.data)) {
          throw new Error(`Invalid audience import job payload for job ${job.id}`);
        }
        return audiences.processImportQueueJob(job.data);
      },
      { connection, prefix, concurrency: queueConfig.uploadQueueConcurrency },
    ),
    new Worker(
      QUEUE_NAMES.BLAST_SEND,
      async (job: Job) => {
        if (job.name !== QUEUE_JOB_TYPES.BLAST_SEND_BATCH) return null;
        if (!isBlastSendBatchJobPayload(job.data)) {
          throw new Error(`Invalid blast send job payload for job ${job.id}`);
        }
        return blasts.processBlastSendQueueJob(job.data);
      },
      { connection, prefix, concurrency: queueConfig.blastQueueConcurrency },
    ),
    new Worker(
      QUEUE_NAMES.BLAST_RETRY,
      async (job: Job) => {
        if (job.name !== QUEUE_JOB_TYPES.BLAST_RETRY_FAILED) return null;
        if (!isBlastRetryFailedJobPayload(job.data)) {
          throw new Error(`Invalid blast retry job payload for job ${job.id}`);
        }
        return blasts.processBlastRetryQueueJob(job.data);
      },
      { connection, prefix, concurrency: 1 },
    ),
  ];

  for (const worker of workers) {
    const queueMetrics = ensureMetrics(worker.name);
    worker.on("active", () => {
      queueMetrics.active += 1;
    });
    worker.on("completed", () => {
      queueMetrics.completed += 1;
      queueMetrics.active = Math.max(0, queueMetrics.active - 1);
    });
    worker.on("failed", (_job, error) => {
      queueMetrics.failed += 1;
      queueMetrics.active = Math.max(0, queueMetrics.active - 1);
      queueMetrics.lastError = String(error);
    });
    worker.on("stalled", () => {
      queueMetrics.stalled += 1;
    });
  }

  const queueEvents = [
    new QueueEvents(QUEUE_NAMES.AUDIENCE_IMPORT, { connection, prefix }),
    new QueueEvents(QUEUE_NAMES.BLAST_SEND, { connection, prefix }),
    new QueueEvents(QUEUE_NAMES.BLAST_RETRY, { connection, prefix }),
  ];

  await Promise.all(queueEvents.map((events) => events.waitUntilReady()));
  for (const events of queueEvents) {
    const queueMetrics = ensureMetrics(events.name);
    events.on("waiting", () => {
      queueMetrics.waiting += 1;
    });
    events.on("delayed", () => {
      queueMetrics.delayed += 1;
    });
  }

  logger.log("worker", "BullMQ worker booted", {
    prefix,
    queues: workers.map((worker) => worker.name),
    queueMetricsTracked: Array.from(metricsMap.keys()),
  });

  const shutdown = async () => {
    logger.warn("worker", "Shutting down BullMQ worker");
    await Promise.all(workers.map((worker) => worker.close()));
    await Promise.all(queueEvents.map((events) => events.close()));
    await app.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

void bootstrap();
