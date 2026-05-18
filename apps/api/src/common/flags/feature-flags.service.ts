import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export type SystemFeatureFlags = {
  FEATURE_REALTIME_ENABLED: boolean;
  FEATURE_AI_ASSIST_ENABLED: boolean;
  FEATURE_BLAST_SCHEDULER_ENABLED: boolean;
  FEATURE_BULLMQ_UPLOAD_ENABLED: boolean;
  FEATURE_BULLMQ_BLAST_ENABLED: boolean;
  BLAST_DRY_RUN: boolean;
};

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

  isBullmqUploadEnabled(): boolean {
    return this.config.get<boolean>("FEATURE_BULLMQ_UPLOAD_ENABLED", false);
  }

  isBullmqBlastEnabled(): boolean {
    return this.config.get<boolean>("FEATURE_BULLMQ_BLAST_ENABLED", false);
  }

  isBlastDryRunEnabled(): boolean {
    return this.config.get<boolean>("BLAST_DRY_RUN", false);
  }

  getSystemFeatureFlags(): SystemFeatureFlags {
    return {
      FEATURE_REALTIME_ENABLED: this.isRealtimeEnabled(),
      FEATURE_AI_ASSIST_ENABLED: this.isAiAssistEnabled(),
      FEATURE_BLAST_SCHEDULER_ENABLED: this.isBlastSchedulerEnabled(),
      FEATURE_BULLMQ_UPLOAD_ENABLED: this.isBullmqUploadEnabled(),
      FEATURE_BULLMQ_BLAST_ENABLED: this.isBullmqBlastEnabled(),
      BLAST_DRY_RUN: this.isBlastDryRunEnabled(),
    };
  }
}
