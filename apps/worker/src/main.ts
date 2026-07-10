import "reflect-metadata";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { type Server } from "node:http";
import { config as dotenvConfig } from "dotenv";
import { NestFactory } from "@nestjs/core";
import { Job, Queue, QueueEvents, Worker } from "bullmq";
import express, { type NextFunction, type Request, type Response } from "express";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import type { EventEnvelope } from "@uprise/events";
import { AudiencesService } from "../../api/src/audiences/audiences.service";
import { SegmentEvaluatorService } from "../../api/src/audiences/segment-evaluator.service";
import { TurfEstimateService } from "../../api/src/canvassing/turf-estimate.service";
import { BlastsService } from "../../api/src/blasts/blasts.service";
import { IntegrationsService } from "../../api/src/integrations/integrations.service";
import { JourneysService } from "../../api/src/journeys/journeys.service";
import { DomainLogger } from "../../api/src/common/logging/domain-logger.service";
import { PrismaService } from "../../api/src/prisma/prisma.service";
import { ReactionRegistry } from "../../api/src/common/reactions/reaction-registry";
import { QueueConfigService } from "../../api/src/common/queue/queue-config.service";
import {
  isAudienceImportBatchJobPayload,
  isBlastRetryFailedJobPayload,
  isBlastSendBatchJobPayload,
  isIntegrationSyncJobPayload,
  isJourneyRunRungJobPayload,
  isSegmentEvalRunJobPayload,
  isTurfEstimateRunJobPayload,
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

type OutboxRow = {
  id: string;
  tenantId: string;
  eventType: string;
  aggregateId: string;
  payload: unknown;
  metadata: unknown;
  occurredAt: Date;
};

/**
 * Outbox relay (meld doc 05): claim unpublished events (FOR UPDATE SKIP LOCKED,
 * so it's safe even if run by multiple worker instances), enqueue each onto the
 * domain-events queue (jobId = event id → BullMQ dedup), then mark published —
 * all in one transaction so a crash mid-loop leaves rows unpublished for retry.
 */
async function drainOutbox(
  prisma: PrismaService,
  queue: Queue,
  logger: DomainLogger,
  batchSize = 100,
): Promise<number> {
  let published = 0;
  try {
    await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<OutboxRow[]>`
        SELECT "id", "tenantId", "eventType", "aggregateId", "payload", "metadata", "occurredAt"
        FROM "events"."OutboxEvent"
        WHERE "publishedAt" IS NULL
        ORDER BY "seq" ASC
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED`;
      for (const row of rows) {
        const envelope: EventEnvelope = {
          id: row.id,
          eventType: row.eventType,
          tenantId: row.tenantId,
          aggregateId: row.aggregateId,
          payload: row.payload,
          metadata: (row.metadata ?? {}) as EventEnvelope["metadata"],
          occurredAt:
            row.occurredAt instanceof Date ? row.occurredAt.toISOString() : String(row.occurredAt),
        };
        await queue.add(QUEUE_JOB_TYPES.DOMAIN_EVENT, envelope, {
          jobId: row.id,
          removeOnComplete: true,
          removeOnFail: 1000,
        });
        await tx.outboxEvent.update({
          where: { id: row.id },
          data: { publishedAt: new Date(), attempts: { increment: 1 } },
        });
        published += 1;
      }
    });
  } catch (err) {
    logger.error("worker", "Outbox relay drain failed", undefined, { error: String(err) });
  }
  return published;
}

const BULL_BOARD_BASE_PATH = "/admin/queues";

/**
 * HTTP basic-auth gate for the Bull Board path. Compares the decoded
 * `Authorization: Basic` header against BASIC_AUTH_USERNAME / BASIC_AUTH_PASSWORD.
 * If neither credential env is set the board is refused outright (closed by
 * default) rather than served wide open.
 */
function basicAuthGuard(logger: DomainLogger): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    const expectedUser = (process.env.BASIC_AUTH_USERNAME ?? "").trim();
    const expectedPass = process.env.BASIC_AUTH_PASSWORD ?? "";
    const challenge = () => {
      res.setHeader("WWW-Authenticate", 'Basic realm="uprise queues"');
      res.status(401).send("Authentication required");
    };
    if (!expectedUser || !expectedPass) {
      logger.warn("worker", "Bull Board access refused: BASIC_AUTH_USERNAME/PASSWORD not configured");
      challenge();
      return;
    }
    const header = req.headers.authorization ?? "";
    if (!header.startsWith("Basic ")) {
      challenge();
      return;
    }
    let decoded = "";
    try {
      decoded = Buffer.from(header.slice("Basic ".length), "base64").toString("utf8");
    } catch {
      challenge();
      return;
    }
    const sep = decoded.indexOf(":");
    const user = sep === -1 ? decoded : decoded.slice(0, sep);
    const pass = sep === -1 ? "" : decoded.slice(sep + 1);
    if (user === expectedUser && pass === expectedPass) {
      next();
      return;
    }
    challenge();
  };
}

/**
 * Mount Bull Board (+ a /health endpoint) on a small express server listening on
 * WORKER_HEALTH_PORT. One BullMQAdapter per queue, all built with the SAME Redis
 * connection + prefix the workers use, so the board reads the live `uprise:*` keys.
 * The whole /admin/queues path is gated behind HTTP basic auth.
 */
function startBullBoardServer(
  connection: { url: string },
  prefix: string,
  logger: DomainLogger,
): { server: Server; queues: Queue[] } {
  const queues = Object.values(QUEUE_NAMES).map(
    (name) => new Queue(name, { connection, prefix }),
  );

  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath(BULL_BOARD_BASE_PATH);
  createBullBoard({
    queues: queues.map((queue) => new BullMQAdapter(queue)),
    serverAdapter,
  });

  const httpApp = express();
  httpApp.disable("x-powered-by");
  httpApp.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });
  // Root → the queue dashboard, so worker.uprise.org.au lands on Bull Board.
  httpApp.get("/", (_req, res) => {
    res.redirect(302, BULL_BOARD_BASE_PATH);
  });
  httpApp.use(BULL_BOARD_BASE_PATH, basicAuthGuard(logger), serverAdapter.getRouter());

  const port = Number(process.env.WORKER_HEALTH_PORT ?? "3210");
  const server = httpApp.listen(port, () => {
    logger.log("worker", "Bull Board mounted", {
      url: `http://0.0.0.0:${port}${BULL_BOARD_BASE_PATH}`,
      queues: queues.map((queue) => queue.name),
    });
  });

  return { server, queues };
}

async function bootstrap(): Promise<void> {
  const { AppModule } = await import("../../api/src/app.module");
  const app = await NestFactory.createApplicationContext(AppModule);
  const queueConfig = app.get(QueueConfigService);
  const audiences = app.get(AudiencesService);
  const segmentEvaluator = app.get(SegmentEvaluatorService);
  const turfEstimates = app.get(TurfEstimateService);
  const blasts = app.get(BlastsService);
  const integrations = app.get(IntegrationsService);
  const journeys = app.get(JourneysService);
  const prisma = app.get(PrismaService);
  const reactions = app.get(ReactionRegistry);
  const logger = app.get(DomainLogger);

  const connection = queueConfig.queueConnection;
  const prefix = queueConfig.queuePrefix;
  // Producer for the relay; consumed by the domain-events worker below.
  const domainEventsQueue = new Queue(QUEUE_NAMES.DOMAIN_EVENTS, { connection, prefix });
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
    new Worker(
      QUEUE_NAMES.INTEGRATION_SYNC,
      async (job: Job) => {
        if (job.name !== QUEUE_JOB_TYPES.INTEGRATION_SYNC_LIST) return null;
        if (!isIntegrationSyncJobPayload(job.data)) {
          throw new Error(`Invalid integration sync job payload for job ${job.id}`);
        }
        return integrations.processSyncQueueJob(job.data);
      },
      { connection, prefix, concurrency: queueConfig.integrationSyncQueueConcurrency },
    ),
    new Worker(
      QUEUE_NAMES.JOURNEY_RUN,
      async (job: Job) => {
        if (job.name !== QUEUE_JOB_TYPES.JOURNEY_RUN_RUNG) return null;
        if (!isJourneyRunRungJobPayload(job.data)) {
          throw new Error(`Invalid journey run job payload for job ${job.id}`);
        }
        return journeys.processRungJob(job.data);
      },
      { connection, prefix, concurrency: queueConfig.journeyQueueConcurrency },
    ),
    new Worker(
      QUEUE_NAMES.DOMAIN_EVENTS,
      async (job: Job) => {
        if (job.name !== QUEUE_JOB_TYPES.DOMAIN_EVENT) return null;
        await reactions.dispatch(QUEUE_NAMES.DOMAIN_EVENTS, job.data as EventEnvelope);
        return null;
      },
      { connection, prefix, concurrency: 5 },
    ),
    new Worker(
      QUEUE_NAMES.SEGMENT_EVAL,
      async (job: Job) => {
        if (job.name !== QUEUE_JOB_TYPES.SEGMENT_EVAL_RUN) return null;
        if (!isSegmentEvalRunJobPayload(job.data)) {
          throw new Error(`Invalid segment eval job payload for job ${job.id}`);
        }
        return segmentEvaluator.processEvalJob(job.data);
      },
      { connection, prefix, concurrency: 2 },
    ),
    // Pricing a turf is CPU-bound (ordering the buildings) and then rate-limited (Mapbox
    // walks the footpaths, 25 waypoints per request). Kew is 28,580 buildings and 1,191
    // requests. One at a time: two of these would fight each other for the same quota.
    new Worker(
      QUEUE_NAMES.TURF_ESTIMATE,
      async (job: Job) => {
        if (job.name !== QUEUE_JOB_TYPES.TURF_ESTIMATE_RUN) return null;
        if (!isTurfEstimateRunJobPayload(job.data)) {
          throw new Error(`Invalid turf estimate job payload for job ${job.id}`);
        }
        return turfEstimates.processEstimateJob(job.data);
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
    new QueueEvents(QUEUE_NAMES.INTEGRATION_SYNC, { connection, prefix }),
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

  // Outbox relay: poll for unpublished domain events and fan them onto the
  // domain-events queue. SKIP LOCKED makes the poll safe across worker instances.
  const relayIntervalMs = Number(process.env.OUTBOX_RELAY_INTERVAL_MS ?? "750");
  const relayInterval = setInterval(() => {
    void drainOutbox(prisma, domainEventsQueue, logger);
  }, relayIntervalMs);

  // Interactive queue dashboard (Bull Board) on WORKER_HEALTH_PORT, basic-auth gated.
  const { server: bullBoardServer, queues: bullBoardQueues } = startBullBoardServer(
    connection,
    prefix,
    logger,
  );

  logger.log("worker", "BullMQ worker booted", {
    prefix,
    queues: workers.map((worker) => worker.name),
    queueMetricsTracked: Array.from(metricsMap.keys()),
    outboxRelayMs: relayIntervalMs,
    reactionTriggers: reactions.triggers(),
  });

  const shutdown = async () => {
    logger.warn("worker", "Shutting down BullMQ worker");
    clearInterval(relayInterval);
    await new Promise<void>((res) => bullBoardServer.close(() => res()));
    await Promise.all(workers.map((worker) => worker.close()));
    await Promise.all(queueEvents.map((events) => events.close()));
    await Promise.all(bullBoardQueues.map((queue) => queue.close()));
    await domainEventsQueue.close();
    await app.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

void bootstrap();
