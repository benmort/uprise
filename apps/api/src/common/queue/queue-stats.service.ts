import { Injectable } from "@nestjs/common";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { QUEUE_NAMES } from "./queue.constants";
import { QueueConfigService } from "./queue-config.service";

type QueueCounts = {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
};

type QueueSummary = {
  name: string;
  counts: QueueCounts;
  error: string | null;
};

type RedisSummary = {
  configured: boolean;
  connected: boolean;
  pingMs: number | null;
  version: string | null;
  connectedClients: number | null;
  usedMemoryBytes: number | null;
  usedMemoryHuman: string | null;
  error: string | null;
};

export type QueueStatsResponse = {
  at: string;
  queuePrefix: string;
  queues: QueueSummary[];
  redis: RedisSummary;
};

function toInt(raw: string | undefined): number | null {
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  return Math.trunc(parsed);
}

function parseInfo(raw: string): Record<string, string> {
  const pairs: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf(":");
    if (index === -1) continue;
    const key = trimmed.slice(0, index);
    const value = trimmed.slice(index + 1);
    pairs[key] = value;
  }
  return pairs;
}

@Injectable()
export class QueueStatsService {
  constructor(private readonly queueConfig: QueueConfigService) {}

  async getStats(): Promise<QueueStatsResponse> {
    const at = new Date().toISOString();
    const queuePrefix = this.queueConfig.queuePrefix;
    if (!this.queueConfig.hasRedisConfigured) {
      return {
        at,
        queuePrefix,
        queues: [],
        redis: {
          configured: false,
          connected: false,
          pingMs: null,
          version: null,
          connectedClients: null,
          usedMemoryBytes: null,
          usedMemoryHuman: null,
          error: "BULLMQ_REDIS_URL or REDIS_URL is not configured",
        },
      };
    }

    const queueNames = [
      QUEUE_NAMES.AUDIENCE_IMPORT,
      QUEUE_NAMES.BLAST_SEND,
      QUEUE_NAMES.BLAST_RETRY,
    ];
    const queues = queueNames.map(
      (name) =>
        new Queue(name, {
          prefix: queuePrefix,
          connection: this.queueConfig.queueConnection,
        }),
    );

    let redis: IORedis | null = null;
    try {
      const queueSummaries = await Promise.all(
        queues.map(async (queue): Promise<QueueSummary> => {
          try {
            const counts = await queue.getJobCounts(
              "waiting",
              "active",
              "completed",
              "failed",
              "delayed",
              "paused",
            );
            return {
              name: queue.name,
              counts: {
                waiting: counts.waiting ?? 0,
                active: counts.active ?? 0,
                completed: counts.completed ?? 0,
                failed: counts.failed ?? 0,
                delayed: counts.delayed ?? 0,
                paused: counts.paused ?? 0,
              },
              error: null,
            };
          } catch (error) {
            return {
              name: queue.name,
              counts: {
                waiting: 0,
                active: 0,
                completed: 0,
                failed: 0,
                delayed: 0,
                paused: 0,
              },
              error: String(error),
            };
          }
        }),
      );

      const startedAt = Date.now();
      redis = new IORedis(this.queueConfig.redisUrl);
      await redis.ping();
      const pingMs = Date.now() - startedAt;
      const info = parseInfo(await redis.info());
      return {
        at,
        queuePrefix,
        queues: queueSummaries,
        redis: {
          configured: true,
          connected: true,
          pingMs,
          version: info.redis_version ?? null,
          connectedClients: toInt(info.connected_clients),
          usedMemoryBytes: toInt(info.used_memory),
          usedMemoryHuman: info.used_memory_human ?? null,
          error: null,
        },
      };
    } catch (error) {
      return {
        at,
        queuePrefix,
        queues: await Promise.all(
          queues.map(async (queue): Promise<QueueSummary> => {
            try {
              const counts = await queue.getJobCounts(
                "waiting",
                "active",
                "completed",
                "failed",
                "delayed",
                "paused",
              );
              return {
                name: queue.name,
                counts: {
                  waiting: counts.waiting ?? 0,
                  active: counts.active ?? 0,
                  completed: counts.completed ?? 0,
                  failed: counts.failed ?? 0,
                  delayed: counts.delayed ?? 0,
                  paused: counts.paused ?? 0,
                },
                error: null,
              };
            } catch (queueError) {
              return {
                name: queue.name,
                counts: {
                  waiting: 0,
                  active: 0,
                  completed: 0,
                  failed: 0,
                  delayed: 0,
                  paused: 0,
                },
                error: String(queueError),
              };
            }
          }),
        ),
        redis: {
          configured: true,
          connected: false,
          pingMs: null,
          version: null,
          connectedClients: null,
          usedMemoryBytes: null,
          usedMemoryHuman: null,
          error: String(error),
        },
      };
    } finally {
      await Promise.all(queues.map((queue) => queue.close()));
      if (redis) {
        await redis.quit().catch(() => undefined);
      }
    }
  }
}
