import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class QueueConfigService {
  constructor(private readonly config: ConfigService) {}

  get redisUrl(): string {
    return this.config.get<string>("BULLMQ_REDIS_URL", "").trim();
  }

  get queuePrefix(): string {
    return this.config.get<string>("BULLMQ_PREFIX", "yarns").trim() || "yarns";
  }

  get defaultAttempts(): number {
    return Number(this.config.get<string>("BULLMQ_DEFAULT_ATTEMPTS", "4"));
  }

  get defaultBackoffMs(): number {
    return Number(this.config.get<string>("BULLMQ_DEFAULT_BACKOFF_MS", "2000"));
  }

  get uploadQueueConcurrency(): number {
    return Number(this.config.get<string>("BULLMQ_UPLOAD_QUEUE_CONCURRENCY", "2"));
  }

  get blastQueueConcurrency(): number {
    return Number(this.config.get<string>("BULLMQ_BLAST_QUEUE_CONCURRENCY", "5"));
  }

  get workerHealthPort(): number {
    return Number(this.config.get<string>("WORKER_HEALTH_PORT", "3210"));
  }

  get hasRedisConfigured(): boolean {
    return this.redisUrl.length > 0;
  }

  get queueConnection(): { url: string } {
    if (!this.redisUrl) {
      throw new Error("BULLMQ_REDIS_URL is required when BullMQ is enabled");
    }
    return { url: this.redisUrl };
  }
}
