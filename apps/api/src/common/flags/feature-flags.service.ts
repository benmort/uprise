import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class FeatureFlagsService {
  constructor(private readonly config: ConfigService) {}

  isRealtimeEnabled(): boolean {
    return this.config.get<boolean>("FEATURE_REALTIME_ENABLED", true);
  }

  isAiAssistEnabled(): boolean {
    return this.config.get<boolean>("FEATURE_AI_ASSIST_ENABLED", true);
  }

  isBlastSchedulerEnabled(): boolean {
    return this.config.get<boolean>("FEATURE_BLAST_SCHEDULER_ENABLED", true);
  }
}
