import { Queue } from "bullmq";
import IORedis from "ioredis";
import { QUEUE_NAMES } from "./queue.constants";
import { QueueConfigService } from "./queue-config.service";
import { QueueStatsService } from "./queue-stats.service";

type MockQueueState = {
  counts?: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    paused: number;
  };
  error?: Error;
};

const queueStates = new Map<string, MockQueueState>();
const queueClose = jest.fn().mockResolvedValue(undefined);
const redisPing = jest.fn();
const redisInfo = jest.fn();
const redisQuit = jest.fn().mockResolvedValue("OK");

jest.mock("bullmq", () => ({
  Queue: jest.fn().mockImplementation((name: string) => ({
    name,
    getJobCounts: jest.fn(async () => {
      const state = queueStates.get(name);
      if (state?.error) throw state.error;
      return (
        state?.counts ?? {
          waiting: 0,
          active: 0,
          completed: 0,
          failed: 0,
          delayed: 0,
          paused: 0,
        }
      );
    }),
    close: queueClose,
  })),
}));

jest.mock("ioredis", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    ping: redisPing,
    info: redisInfo,
    quit: redisQuit,
  })),
}));

describe("QueueStatsService", () => {
  beforeEach(() => {
    queueStates.clear();
    queueClose.mockClear();
    redisPing.mockReset();
    redisInfo.mockReset();
    redisQuit.mockClear();
    (Queue as unknown as jest.Mock).mockClear();
    (IORedis as unknown as jest.Mock).mockClear();
  });

  it("returns non-failing payload when redis is not configured", async () => {
    const service = new QueueStatsService(
      {
        hasRedisConfigured: false,
        queuePrefix: "yarns",
      } as QueueConfigService,
    );
    const stats = await service.getStats();

    expect(stats.queuePrefix).toBe("yarns");
    expect(stats.queues).toEqual([]);
    expect(stats.redis.configured).toBe(false);
    expect(stats.redis.connected).toBe(false);
    expect(stats.redis.error).toContain("BULLMQ_REDIS_URL or REDIS_URL");
    expect(Queue).not.toHaveBeenCalled();
  });

  it("returns queue + redis stats for healthy redis", async () => {
    queueStates.set(QUEUE_NAMES.AUDIENCE_IMPORT, {
      counts: { waiting: 2, active: 1, completed: 9, failed: 0, delayed: 0, paused: 0 },
    });
    queueStates.set(QUEUE_NAMES.BLAST_SEND, {
      counts: { waiting: 4, active: 1, completed: 20, failed: 2, delayed: 1, paused: 0 },
    });
    queueStates.set(QUEUE_NAMES.BLAST_RETRY, {
      counts: { waiting: 0, active: 0, completed: 3, failed: 1, delayed: 0, paused: 0 },
    });
    redisPing.mockResolvedValue("PONG");
    redisInfo.mockResolvedValue(
      "# Server\nredis_version:7.2.5\n# Clients\nconnected_clients:18\n# Memory\nused_memory:123456\nused_memory_human:120.56K\n",
    );

    const service = new QueueStatsService(
      {
        hasRedisConfigured: true,
        redisUrl: "redis://localhost:6379",
        queuePrefix: "yarns",
        queueConnection: { url: "redis://localhost:6379" },
      } as QueueConfigService,
    );
    const stats = await service.getStats();

    expect(stats.redis.configured).toBe(true);
    expect(stats.redis.connected).toBe(true);
    expect(stats.redis.pingMs).not.toBeNull();
    expect(stats.redis.version).toBe("7.2.5");
    expect(stats.redis.connectedClients).toBe(18);
    expect(stats.redis.usedMemoryBytes).toBe(123456);
    expect(stats.redis.usedMemoryHuman).toBe("120.56K");

    const audience = stats.queues.find((queue) => queue.name === QUEUE_NAMES.AUDIENCE_IMPORT);
    expect(audience?.counts.waiting).toBe(2);
    expect(stats.queues).toHaveLength(3);
    expect(queueClose).toHaveBeenCalledTimes(3);
    expect(redisQuit).toHaveBeenCalledTimes(1);
  });

  it("degrades gracefully when redis ping fails", async () => {
    queueStates.set(QUEUE_NAMES.AUDIENCE_IMPORT, {
      counts: { waiting: 1, active: 0, completed: 0, failed: 0, delayed: 0, paused: 0 },
    });
    queueStates.set(QUEUE_NAMES.BLAST_SEND, {
      error: new Error("queue down"),
    });
    queueStates.set(QUEUE_NAMES.BLAST_RETRY, {
      counts: { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, paused: 0 },
    });
    redisPing.mockRejectedValue(new Error("redis unavailable"));

    const service = new QueueStatsService(
      {
        hasRedisConfigured: true,
        redisUrl: "redis://localhost:6379",
        queuePrefix: "yarns",
        queueConnection: { url: "redis://localhost:6379" },
      } as QueueConfigService,
    );
    const stats = await service.getStats();

    expect(stats.redis.configured).toBe(true);
    expect(stats.redis.connected).toBe(false);
    expect(stats.redis.error).toContain("redis unavailable");
    expect(stats.queues).toHaveLength(3);
    const erroredQueue = stats.queues.find((queue) => queue.name === QUEUE_NAMES.BLAST_SEND);
    expect(erroredQueue?.error).toContain("queue down");
  });
});
