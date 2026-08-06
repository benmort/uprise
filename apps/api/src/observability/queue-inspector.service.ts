import { Injectable } from "@nestjs/common";
import { Queue, type Job } from "bullmq";
import { QUEUE_NAMES } from "../common/queue/queue.constants";
import { QueueConfigService } from "../common/queue/queue-config.service";

/** States worth listing. `completed` is deliberately absent — it is noise by the thousand. */
export const INSPECTABLE_STATES = ["waiting", "active", "delayed", "failed", "paused"] as const;
export type InspectableState = (typeof INSPECTABLE_STATES)[number];

export type InspectedJob = {
  id: string;
  name: string;
  state: InspectableState;
  queue: string;
  attemptsMade: number;
  /** Configured ceiling, so "3 of 19" reads as early rather than nearly-dead. */
  attemptsAllowed: number | null;
  failedReason: string | null;
  /** When this job next becomes runnable — the field that explains a job nothing is touching. */
  nextRunAt: string | null;
  createdAt: string | null;
  processedAt: string | null;
  finishedAt: string | null;
  /** Truncated: payloads carry CSV bodies and contact lists, which nobody wants in a log view. */
  data: string;
  /** First frame only. The full trace lives in the provider logs. */
  stacktrace: string | null;
};

/** Payloads can be megabytes (a CSV import carries its whole file). Show the shape, not the cargo. */
const DATA_PREVIEW_CHARS = 500;

function preview(value: unknown): string {
  let text: string;
  try {
    text = JSON.stringify(value ?? null) ?? "null";
  } catch {
    text = String(value);
  }
  return text.length > DATA_PREVIEW_CHARS ? `${text.slice(0, DATA_PREVIEW_CHARS)}…` : text;
}

function iso(ms: number | null | undefined): string | null {
  return ms ? new Date(ms).toISOString() : null;
}

/**
 * Per-job introspection of the BullMQ queues.
 *
 * `QueueStatsService` reports COUNTS, which is what made a real incident invisible: a sync job that
 * failed on every attempt sat in `delayed` awaiting an exponential backoff, and "delayed: 4" tells
 * you nothing about why. Diagnosing it meant hand-writing an ioredis script against production
 * Redis to read `failedReason` off the job hash. This is that script, made permanent and safe.
 *
 * Note `delayed` is where a permanently-failing job with retries left actually lives — NOT
 * `failed`. Anyone looking only at the failed set will conclude everything is fine.
 */
@Injectable()
export class QueueInspectorService {
  constructor(private readonly queueConfig: QueueConfigService) {}

  get configured(): boolean {
    return this.queueConfig.hasRedisConfigured;
  }

  /**
   * Jobs in the given queues and states, newest first.
   *
   * Queues are opened and closed per call rather than held: this is an operator path used
   * occasionally, and a pool of eleven idle Redis connections is a worse trade than a connect per
   * query.
   */
  async listJobs(opts: {
    queues?: string[];
    states?: InspectableState[];
    limit?: number;
    warnings: string[];
  }): Promise<InspectedJob[]> {
    if (!this.configured) {
      opts.warnings.push("BULLMQ_REDIS_URL or REDIS_URL is not configured — queue jobs unavailable");
      return [];
    }
    const known = new Set<string>(Object.values(QUEUE_NAMES));
    const requested = opts.queues?.length ? opts.queues : Object.values(QUEUE_NAMES);
    const names = requested.filter((name) => {
      if (known.has(name)) return true;
      opts.warnings.push(`Unknown queue "${name}" — ignored`);
      return false;
    });
    const states = opts.states?.length ? opts.states : [...INSPECTABLE_STATES];
    const limit = Math.min(Math.max(1, opts.limit ?? 50), 200);

    const out: InspectedJob[] = [];
    for (const name of names) {
      const queue = new Queue(name, {
        prefix: this.queueConfig.queuePrefix,
        connection: this.queueConfig.queueConnection,
      });
      try {
        for (const state of states) {
          const jobs = await queue.getJobs([state], 0, limit - 1);
          for (const job of jobs) {
            out.push(this.toInspected(job, state, name));
          }
        }
      } catch (err) {
        opts.warnings.push(`Queue "${name}" unreadable (${err instanceof Error ? err.message : "error"})`);
      } finally {
        await queue.close().catch(() => undefined);
      }
    }

    return out
      .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
      .slice(0, limit);
  }

  private toInspected(job: Job, state: InspectableState, queue: string): InspectedJob {
    // `job.delay`, NOT `job.opts.delay`. The enqueue option is the ORIGINAL delay — 0 for these
    // jobs — while BullMQ rewrites the job's own `delay` field to the current retry backoff on
    // each failure. Reading opts gives every parked job a next-run equal to its creation time,
    // which is exactly the "nothing is happening" reading this field exists to correct: the real
    // answer for a job on attempt 14 of an exponential backoff is months away.
    const delayMs = Number(job.delay ?? job.opts?.delay ?? 0);
    const nextRunAt =
      state === "delayed" && job.timestamp ? iso(Number(job.timestamp) + delayMs) : null;

    return {
      id: String(job.id ?? ""),
      name: job.name,
      state,
      queue,
      attemptsMade: Number(job.attemptsMade ?? 0),
      attemptsAllowed: job.opts?.attempts != null ? Number(job.opts.attempts) : null,
      failedReason: job.failedReason ?? null,
      nextRunAt,
      createdAt: iso(job.timestamp),
      processedAt: iso(job.processedOn),
      finishedAt: iso(job.finishedOn),
      data: preview(job.data),
      stacktrace: job.stacktrace?.[0] ?? null,
    };
  }
}
