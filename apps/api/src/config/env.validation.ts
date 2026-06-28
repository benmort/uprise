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
  BLAST_DISPATCH_LIMIT: number;
  BLAST_SEND_MAX_RUN_MS: number;
  AUDIENCE_IMPORT_BATCH_SIZE: number;
  AUDIENCE_IMPORT_DISPATCH_BATCH_SIZE: number;
  AUDIENCE_IMPORT_DISPATCH_LIMIT: number;
  AUDIENCE_IMPORT_MAX_RUN_MS: number;
  BULLMQ_REDIS_URL: string;
  BULLMQ_PREFIX: string;
  BULLMQ_DEFAULT_ATTEMPTS: number;
  BULLMQ_DEFAULT_BACKOFF_MS: number;
  BULLMQ_UPLOAD_QUEUE_CONCURRENCY: number;
  BULLMQ_BLAST_QUEUE_CONCURRENCY: number;
  BULLMQ_INTEGRATION_SYNC_CONCURRENCY: number;
  TWILIO_ACCOUNT_SID: string;
  TWILIO_AUTH_TOKEN: string;
  TWILIO_PHONE_NUMBER: string;
  TWILIO_STATUS_CALLBACK_URL: string;
  TWILIO_SEND_RATE_PER_SECOND: number;
  TWILIO_SEND_MAX_CONCURRENT: number;
  TWILIO_RATE_LIMIT_COOLDOWN_MS: number;
  TWILIO_WHATSAPP_FROM: string;
  TWILIO_WHATSAPP_MESSAGING_SERVICE_SID: string;
  TWILIO_CONTENT_API_ENABLED: boolean;
  WHATSAPP_SESSION_WINDOW_HOURS: number;
  FEATURE_PUSH_ENABLED: boolean;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT: string;
  ACTION_NETWORK_API_BASE_URL: string;
  ACTION_NETWORK_API_KEY: string;
  ACTION_NETWORK_SYNC_PER_PAGE: number;
  ACTION_NETWORK_SYNC_MAX_PAGES: number;
  ACTION_NETWORK_SYNC_PAGES_PER_RUN: number;
  ACTION_NETWORK_SYNC_RUN_BUDGET_MS: number;
  ACTION_NETWORK_SYNC_IDENTIFIER_BATCH_SIZE: number;
  ACTION_NETWORK_SYNC_PERSON_HREF_CONCURRENCY: number;
  ACTION_NETWORK_SYNC_REQUESTS_PER_SECOND: number;
  ACTION_NETWORK_SYNC_MAX_RETRIES: number;
  INTERNAL_SOURCE_API_BASE_URL: string;
  INTERNAL_SOURCE_API_KEY: string;
  INTEGRATION_CREDENTIAL_SECRET: string;
  DEFAULT_ORGANIZATION_SLUG: string;
  QUIET_HOURS_START: number;
  QUIET_HOURS_END: number;
  REQUIRE_OPTOUT_LANGUAGE: boolean;
  TURNSTILE_SECRET_KEY: string;
  TURNSTILE_TIMEOUT_MS: number;
};

export function validateEnv(config: Env): ValidatedEnv {
  const errors: string[] = [];
  const resolvedBullmqRedisUrl = config.BULLMQ_REDIS_URL?.trim() || config.REDIS_URL?.trim() || "";
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
    BLAST_SEND_BATCH_SIZE: numberInRange(config, "BLAST_SEND_BATCH_SIZE", 1, 500, 475, errors),
    BLAST_DISPATCH_BATCH_SIZE: numberInRange(config, "BLAST_DISPATCH_BATCH_SIZE", 1, 100, 95, errors),
    BLAST_DISPATCH_LIMIT: numberInRange(config, "BLAST_DISPATCH_LIMIT", 1, 100, 95, errors),
    BLAST_SEND_MAX_RUN_MS: numberInRange(config, "BLAST_SEND_MAX_RUN_MS", 1000, 28000, 26600, errors),
    AUDIENCE_IMPORT_BATCH_SIZE: numberInRange(
      config,
      "AUDIENCE_IMPORT_BATCH_SIZE",
      1,
      2000,
      1900,
      errors,
    ),
    AUDIENCE_IMPORT_DISPATCH_BATCH_SIZE: numberInRange(
      config,
      "AUDIENCE_IMPORT_DISPATCH_BATCH_SIZE",
      1,
      500,
      475,
      errors,
    ),
    AUDIENCE_IMPORT_DISPATCH_LIMIT: numberInRange(
      config,
      "AUDIENCE_IMPORT_DISPATCH_LIMIT",
      1,
      100,
      95,
      errors,
    ),
    AUDIENCE_IMPORT_MAX_RUN_MS: numberInRange(
      config,
      "AUDIENCE_IMPORT_MAX_RUN_MS",
      1000,
      28000,
      26600,
      errors,
    ),
    BULLMQ_REDIS_URL: resolvedBullmqRedisUrl,
    BULLMQ_PREFIX: config.BULLMQ_PREFIX?.trim() || "uprise",
    BULLMQ_DEFAULT_ATTEMPTS: numberInRange(config, "BULLMQ_DEFAULT_ATTEMPTS", 1, 20, 19, errors),
    BULLMQ_DEFAULT_BACKOFF_MS: numberInRange(
      config,
      "BULLMQ_DEFAULT_BACKOFF_MS",
      0,
      600000,
      570000,
      errors,
    ),
    BULLMQ_UPLOAD_QUEUE_CONCURRENCY: numberInRange(
      config,
      "BULLMQ_UPLOAD_QUEUE_CONCURRENCY",
      1,
      50,
      47,
      errors,
    ),
    BULLMQ_BLAST_QUEUE_CONCURRENCY: numberInRange(
      config,
      "BULLMQ_BLAST_QUEUE_CONCURRENCY",
      1,
      100,
      95,
      errors,
    ),
    BULLMQ_INTEGRATION_SYNC_CONCURRENCY: numberInRange(
      config,
      "BULLMQ_INTEGRATION_SYNC_CONCURRENCY",
      1,
      50,
      47,
      errors,
    ),
    TWILIO_ACCOUNT_SID: required(config, "TWILIO_ACCOUNT_SID", errors),
    TWILIO_AUTH_TOKEN: required(config, "TWILIO_AUTH_TOKEN", errors),
    TWILIO_PHONE_NUMBER: required(config, "TWILIO_PHONE_NUMBER", errors),
    TWILIO_STATUS_CALLBACK_URL: config.TWILIO_STATUS_CALLBACK_URL?.trim() || "",
    TWILIO_SEND_RATE_PER_SECOND: numberInRange(config, "TWILIO_SEND_RATE_PER_SECOND", 1, 500, 475, errors),
    TWILIO_SEND_MAX_CONCURRENT: numberInRange(config, "TWILIO_SEND_MAX_CONCURRENT", 1, 50, 47, errors),
    TWILIO_RATE_LIMIT_COOLDOWN_MS: numberInRange(
      config,
      "TWILIO_RATE_LIMIT_COOLDOWN_MS",
      0,
      120000,
      114000,
      errors,
    ),
    TWILIO_WHATSAPP_FROM: config.TWILIO_WHATSAPP_FROM?.trim() || "",
    TWILIO_WHATSAPP_MESSAGING_SERVICE_SID:
      config.TWILIO_WHATSAPP_MESSAGING_SERVICE_SID?.trim() || "",
    TWILIO_CONTENT_API_ENABLED: boolish(config, "TWILIO_CONTENT_API_ENABLED", false),
    WHATSAPP_SESSION_WINDOW_HOURS: numberInRange(
      config,
      "WHATSAPP_SESSION_WINDOW_HOURS",
      1,
      24,
      24,
      errors,
    ),
    FEATURE_PUSH_ENABLED: boolish(config, "FEATURE_PUSH_ENABLED", false),
    VAPID_PUBLIC_KEY: config.VAPID_PUBLIC_KEY?.trim() || "",
    VAPID_PRIVATE_KEY: config.VAPID_PRIVATE_KEY?.trim() || "",
    VAPID_SUBJECT: config.VAPID_SUBJECT?.trim() || "mailto:hello@uprise.app",
    ACTION_NETWORK_API_BASE_URL:
      config.ACTION_NETWORK_API_BASE_URL?.trim() || "https://actionnetwork.org/api/v2",
    ACTION_NETWORK_API_KEY: required(config, "ACTION_NETWORK_API_KEY", errors),
    ACTION_NETWORK_SYNC_PER_PAGE: numberInRange(config, "ACTION_NETWORK_SYNC_PER_PAGE", 1, 100, 95, errors),
    ACTION_NETWORK_SYNC_MAX_PAGES: numberInRange(
      config,
      "ACTION_NETWORK_SYNC_MAX_PAGES",
      1,
      10000,
      9500,
      errors,
    ),
    ACTION_NETWORK_SYNC_PAGES_PER_RUN: numberInRange(
      config,
      "ACTION_NETWORK_SYNC_PAGES_PER_RUN",
      1,
      1000,
      950,
      errors,
    ),
    ACTION_NETWORK_SYNC_RUN_BUDGET_MS: numberInRange(
      config,
      "ACTION_NETWORK_SYNC_RUN_BUDGET_MS",
      1000,
      120000,
      114000,
      errors,
    ),
    ACTION_NETWORK_SYNC_IDENTIFIER_BATCH_SIZE: numberInRange(
      config,
      "ACTION_NETWORK_SYNC_IDENTIFIER_BATCH_SIZE",
      1,
      50,
      47,
      errors,
    ),
    ACTION_NETWORK_SYNC_PERSON_HREF_CONCURRENCY: numberInRange(
      config,
      "ACTION_NETWORK_SYNC_PERSON_HREF_CONCURRENCY",
      1,
      20,
      19,
      errors,
    ),
    ACTION_NETWORK_SYNC_REQUESTS_PER_SECOND: numberInRange(
      config,
      "ACTION_NETWORK_SYNC_REQUESTS_PER_SECOND",
      1,
      200,
      190,
      errors,
    ),
    ACTION_NETWORK_SYNC_MAX_RETRIES: numberInRange(
      config,
      "ACTION_NETWORK_SYNC_MAX_RETRIES",
      0,
      10,
      9,
      errors,
    ),
    INTERNAL_SOURCE_API_BASE_URL: required(config, "INTERNAL_SOURCE_API_BASE_URL", errors),
    INTERNAL_SOURCE_API_KEY: required(config, "INTERNAL_SOURCE_API_KEY", errors),
    INTEGRATION_CREDENTIAL_SECRET: required(config, "INTEGRATION_CREDENTIAL_SECRET", errors),
    DEFAULT_ORGANIZATION_SLUG: config.DEFAULT_ORGANIZATION_SLUG?.trim() || "default",
    QUIET_HOURS_START: numberInRange(config, "QUIET_HOURS_START", 0, 23, 21, errors),
    QUIET_HOURS_END: numberInRange(config, "QUIET_HOURS_END", 0, 23, 8, errors),
    REQUIRE_OPTOUT_LANGUAGE: boolish(config, "REQUIRE_OPTOUT_LANGUAGE", true),
    // Cloudflare Turnstile (bot protection). Blank secret → the guard is a no-op.
    TURNSTILE_SECRET_KEY: config.TURNSTILE_SECRET_KEY?.trim() || "",
    TURNSTILE_TIMEOUT_MS: numberInRange(config, "TURNSTILE_TIMEOUT_MS", 1000, 30000, 5000, errors),
  };

  if (errors.length > 0) {
    throw new Error(`Environment validation failed:\n- ${errors.join("\n- ")}`);
  }

  return output;
}
