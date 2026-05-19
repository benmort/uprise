import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class QueueConfigService {
  constructor(private readonly config: ConfigService) {}

  private getTrimmed(key: string): string {
    return this.config.get<string>(key, "").trim();
  }

  get redisUrl(): string {
    return this.getTrimmed("BULLMQ_REDIS_URL") || this.getTrimmed("REDIS_URL");
  }

  get queuePrefix(): string {
    return this.config.get<string>("BULLMQ_PREFIX", "yarns").trim() || "yarns";
  }

  get defaultAttempts(): number {
    return Number(this.config.get<string>("BULLMQ_DEFAULT_ATTEMPTS", "19"));
  }

  get defaultBackoffMs(): number {
    return Number(this.config.get<string>("BULLMQ_DEFAULT_BACKOFF_MS", "570000"));
  }

  get uploadQueueConcurrency(): number {
    return Number(this.config.get<string>("BULLMQ_UPLOAD_QUEUE_CONCURRENCY", "47"));
  }

  get blastQueueConcurrency(): number {
    return Number(this.config.get<string>("BULLMQ_BLAST_QUEUE_CONCURRENCY", "95"));
  }

  get integrationSyncQueueConcurrency(): number {
    return Number(this.config.get<string>("BULLMQ_INTEGRATION_SYNC_CONCURRENCY", "47"));
  }

  get hasRedisConfigured(): boolean {
    return this.redisUrl.length > 0;
  }

  get queueConnection(): { url: string } {
    if (!this.redisUrl) {
      throw new Error("BULLMQ_REDIS_URL or REDIS_URL is required when BullMQ is enabled");
    }
    return { url: this.redisUrl };
  }
}
