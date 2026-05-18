type Env = Record<string, string | undefined>;

function required(env: Env, key: string, errors: string[]): string {
  const value = env[key];
  if (!value || !value.trim()) {
    errors.push(`${key} is required`);
    return "";
  }
  return value.trim();
}

function numberInRange(
  env: Env,
  key: string,
  min: number,
  max: number,
  fallback: number,
  errors: string[],
): number {
  const raw = env[key];
  if (!raw || !raw.trim()) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    errors.push(`${key} must be between ${min} and ${max}`);
    return fallback;
  }
  return parsed;
}

function boolish(env: Env, key: string, fallback = false): boolean {
  const value = env[key];
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export type ValidatedEnv = {
  NODE_ENV: string;
  PORT: number;
  API_BASE_URL: string;
  CORS_ALLOWED_ORIGINS: string;
  RATE_LIMIT_WINDOW_MS: number;
  RATE_LIMIT_MAX_REQUESTS: number;
  DATABASE_URL: string;
  BASIC_AUTH_USERNAME: string;
  BASIC_AUTH_PASSWORD: string;
  CRON_SECRET: string;
  STREAM_TOKEN_SECRET: string;
  STREAM_TOKEN_TTL_SECONDS: number;
  BLAST_SEND_BATCH_SIZE: number;
  BLAST_DISPATCH_BATCH_SIZE: number;
  BLAST_SEND_MAX_RUN_MS: number;
  AUDIENCE_IMPORT_BATCH_SIZE: number;
  AUDIENCE_IMPORT_DISPATCH_BATCH_SIZE: number;
  AUDIENCE_IMPORT_MAX_RUN_MS: number;
  BULLMQ_REDIS_URL: string;
  BULLMQ_PREFIX: string;
  BULLMQ_DEFAULT_ATTEMPTS: number;
  BULLMQ_DEFAULT_BACKOFF_MS: number;
  BULLMQ_UPLOAD_QUEUE_CONCURRENCY: number;
  BULLMQ_BLAST_QUEUE_CONCURRENCY: number;
  TWILIO_ACCOUNT_SID: string;
  TWILIO_AUTH_TOKEN: string;
  TWILIO_PHONE_NUMBER: string;
  TWILIO_STATUS_CALLBACK_URL: string;
  ACTION_NETWORK_API_BASE_URL: string;
  ACTION_NETWORK_API_KEY: string;
  INTERNAL_SOURCE_API_BASE_URL: string;
  INTERNAL_SOURCE_API_KEY: string;
  INTEGRATION_CREDENTIAL_SECRET: string;
  DEFAULT_ORGANIZATION_SLUG: string;
  QUIET_HOURS_START: number;
  QUIET_HOURS_END: number;
  REQUIRE_OPTOUT_LANGUAGE: boolean;
  FEATURE_REALTIME_ENABLED: boolean;
  FEATURE_AI_ASSIST_ENABLED: boolean;
  FEATURE_BLAST_SCHEDULER_ENABLED: boolean;
  FEATURE_BULLMQ_UPLOAD_ENABLED: boolean;
  FEATURE_BULLMQ_BLAST_ENABLED: boolean;
};

export function validateEnv(config: Env): ValidatedEnv {
  const errors: string[] = [];
  const output: ValidatedEnv = {
    NODE_ENV: config.NODE_ENV?.trim() || "development",
    PORT: numberInRange(config, "PORT", 1, 65535, 3001, errors),
    API_BASE_URL: required(config, "API_BASE_URL", errors),
    CORS_ALLOWED_ORIGINS: config.CORS_ALLOWED_ORIGINS?.trim() || "",
    RATE_LIMIT_WINDOW_MS: numberInRange(config, "RATE_LIMIT_WINDOW_MS", 1000, 3600000, 60000, errors),
    RATE_LIMIT_MAX_REQUESTS: numberInRange(config, "RATE_LIMIT_MAX_REQUESTS", 10, 10000, 300, errors),
    DATABASE_URL: required(config, "DATABASE_URL", errors),
    BASIC_AUTH_USERNAME: required(config, "BASIC_AUTH_USERNAME", errors),
    BASIC_AUTH_PASSWORD: required(config, "BASIC_AUTH_PASSWORD", errors),
    CRON_SECRET: config.CRON_SECRET?.trim() || "",
    STREAM_TOKEN_SECRET: config.STREAM_TOKEN_SECRET?.trim() || "",
    STREAM_TOKEN_TTL_SECONDS: numberInRange(
      config,
      "STREAM_TOKEN_TTL_SECONDS",
      60,
      86400,
      43200,
      errors,
    ),
    BLAST_SEND_BATCH_SIZE: numberInRange(config, "BLAST_SEND_BATCH_SIZE", 1, 500, 50, errors),
    BLAST_DISPATCH_BATCH_SIZE: numberInRange(config, "BLAST_DISPATCH_BATCH_SIZE", 1, 100, 5, errors),
    BLAST_SEND_MAX_RUN_MS: numberInRange(config, "BLAST_SEND_MAX_RUN_MS", 1000, 28000, 22000, errors),
    AUDIENCE_IMPORT_BATCH_SIZE: numberInRange(
      config,
      "AUDIENCE_IMPORT_BATCH_SIZE",
      1,
      2000,
      200,
      errors,
    ),
    AUDIENCE_IMPORT_DISPATCH_BATCH_SIZE: numberInRange(
      config,
      "AUDIENCE_IMPORT_DISPATCH_BATCH_SIZE",
      1,
      500,
      100,
      errors,
    ),
    AUDIENCE_IMPORT_MAX_RUN_MS: numberInRange(
      config,
      "AUDIENCE_IMPORT_MAX_RUN_MS",
      1000,
      28000,
      22000,
      errors,
    ),
    BULLMQ_REDIS_URL: config.BULLMQ_REDIS_URL?.trim() || "",
    BULLMQ_PREFIX: config.BULLMQ_PREFIX?.trim() || "yarns",
    BULLMQ_DEFAULT_ATTEMPTS: numberInRange(config, "BULLMQ_DEFAULT_ATTEMPTS", 1, 20, 4, errors),
    BULLMQ_DEFAULT_BACKOFF_MS: numberInRange(
      config,
      "BULLMQ_DEFAULT_BACKOFF_MS",
      0,
      600000,
      2000,
      errors,
    ),
    BULLMQ_UPLOAD_QUEUE_CONCURRENCY: numberInRange(
      config,
      "BULLMQ_UPLOAD_QUEUE_CONCURRENCY",
      1,
      50,
      2,
      errors,
    ),
    BULLMQ_BLAST_QUEUE_CONCURRENCY: numberInRange(
      config,
      "BULLMQ_BLAST_QUEUE_CONCURRENCY",
      1,
      100,
      5,
      errors,
    ),
    TWILIO_ACCOUNT_SID: required(config, "TWILIO_ACCOUNT_SID", errors),
    TWILIO_AUTH_TOKEN: required(config, "TWILIO_AUTH_TOKEN", errors),
    TWILIO_PHONE_NUMBER: required(config, "TWILIO_PHONE_NUMBER", errors),
    TWILIO_STATUS_CALLBACK_URL: config.TWILIO_STATUS_CALLBACK_URL?.trim() || "",
    ACTION_NETWORK_API_BASE_URL:
      config.ACTION_NETWORK_API_BASE_URL?.trim() || "https://actionnetwork.org/api/v2",
    ACTION_NETWORK_API_KEY: required(config, "ACTION_NETWORK_API_KEY", errors),
    INTERNAL_SOURCE_API_BASE_URL: required(config, "INTERNAL_SOURCE_API_BASE_URL", errors),
    INTERNAL_SOURCE_API_KEY: required(config, "INTERNAL_SOURCE_API_KEY", errors),
    INTEGRATION_CREDENTIAL_SECRET: required(config, "INTEGRATION_CREDENTIAL_SECRET", errors),
    DEFAULT_ORGANIZATION_SLUG: config.DEFAULT_ORGANIZATION_SLUG?.trim() || "default",
    QUIET_HOURS_START: numberInRange(config, "QUIET_HOURS_START", 0, 23, 21, errors),
    QUIET_HOURS_END: numberInRange(config, "QUIET_HOURS_END", 0, 23, 8, errors),
    REQUIRE_OPTOUT_LANGUAGE: boolish(config, "REQUIRE_OPTOUT_LANGUAGE", true),
    FEATURE_REALTIME_ENABLED: boolish(config, "FEATURE_REALTIME_ENABLED", true),
    FEATURE_AI_ASSIST_ENABLED: boolish(config, "FEATURE_AI_ASSIST_ENABLED", true),
    FEATURE_BLAST_SCHEDULER_ENABLED: boolish(config, "FEATURE_BLAST_SCHEDULER_ENABLED", true),
    FEATURE_BULLMQ_UPLOAD_ENABLED: boolish(config, "FEATURE_BULLMQ_UPLOAD_ENABLED", false),
    FEATURE_BULLMQ_BLAST_ENABLED: boolish(config, "FEATURE_BULLMQ_BLAST_ENABLED", false),
  };

  if (
    (output.FEATURE_BULLMQ_UPLOAD_ENABLED || output.FEATURE_BULLMQ_BLAST_ENABLED) &&
    !output.BULLMQ_REDIS_URL
  ) {
    errors.push("BULLMQ_REDIS_URL is required when FEATURE_BULLMQ_UPLOAD_ENABLED or FEATURE_BULLMQ_BLAST_ENABLED is true");
  }

  if (errors.length > 0) {
    throw new Error(`Environment validation failed:\n- ${errors.join("\n- ")}`);
  }

  return output;
}
