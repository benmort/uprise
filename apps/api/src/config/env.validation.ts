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
  // Tenant to attribute platform/auth messages to when the actor has no membership — e.g. the
  // 2FA / phone-login OTP for a tenant-independent break-glass super-admin. Optional; blank ⇒
  // fall back to the oldest tenant. The send uses the platform transactional number regardless.
  PLATFORM_TENANT_ID: string;
  // Dev only: actually send OTP/2FA SMS via Twilio (vs the on-screen code). Ignored in prod.
  DEV_SEND_OTP_SMS: boolean;
  // Gate new-workspace self-service signups behind super-admin approval. When on, /auth/register
  // creates the account + a pending TenantJoinRequest but issues NO session — the owner can't sign
  // in until a super-admin approves it. Defaults on in production, off elsewhere (frictionless dev).
  SIGNUP_APPROVAL_REQUIRED: boolean;
  PORT: number;
  API_BASE_URL: string;
  CORS_ALLOWED_ORIGINS: string;
  // Parent domain the session cookie is scoped to for cross-subdomain SSO (meld
  // doc 14), e.g. ".dev.uprise.org.au". Blank → host-only (single-app/localhost).
  // First-class here so it isn't silently dropped through validation and so the
  // bootstrap SSO guard reads a validated value (see bootstrap.assertCookieDomainForSso).
  SESSION_COOKIE_DOMAIN: string;
  // The platform's base domain for host-based tenant routing: a `<slug>.<this>` host
  // serves the admin app scoped to that tenant. e.g. "uprise.org.au" (prod) /
  // "dev.uprise.org.au" (staging). Platform app hosts (admin./auth./api. …) and the apex
  // are excluded (session-based, unchanged).
  PLATFORM_BASE_DOMAIN: string;
  AUTH_APP_URL: string;
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
  SENDGRID_API_KEY: string;
  SENDGRID_FROM_EMAIL: string;
  SENDGRID_WEBHOOK_VERIFICATION_KEY: string;
  SENDGRID_WEBHOOK_SECRET: string;
  MARKETING_NOTIFY_EMAIL: string;
  DNSIMPLE_API_TOKEN: string;
  DNSIMPLE_ACCOUNT_ID: string;
  DNSIMPLE_ZONE: string;
  EMAIL_IDENTITY_ROOT_DOMAIN: string;
  TWILIO_ACCOUNT_SID: string;
  TWILIO_AUTH_TOKEN: string;
  TWILIO_PHONE_NUMBER: string;
  TWILIO_STATUS_CALLBACK_URL: string;
  // Browser Voice (WebRTC softphone): API key/secret sign the Voice access token,
  // the TwiML App's Voice URL points at /voice-outbound. Platform-account path;
  // per-subaccount voice apps are created lazily. Blank ⇒ platform voice inert.
  TWILIO_API_KEY_SID: string;
  TWILIO_API_KEY_SECRET: string;
  TWILIO_TWIML_APP_SID: string;
  // Outbound-voice caller ID the callee sees on browser calls — must be a
  // voice-capable number (AU mobiles are SMS-only and get rejected → 13214).
  // Blank ⇒ falls back to TWILIO_PHONE_NUMBER. The *_URL overrides default to
  // API_BASE_URL-derived paths when blank.
  TWILIO_VOICE_FROM: string;
  TWILIO_VOICE_TWIML_URL: string;
  TWILIO_VOICE_STATUS_CALLBACK_URL: string;
  TWILIO_VOICE_RECORDING_CALLBACK_URL: string;
  TWILIO_SEND_RATE_PER_SECOND: number;
  TWILIO_SEND_MAX_CONCURRENT: number;
  TWILIO_SUBACCOUNT_SEND_RATE_PER_SECOND: number;
  TWILIO_SUBACCOUNT_SEND_MAX_CONCURRENT: number;
  TWILIO_RATE_LIMIT_COOLDOWN_MS: number;
  TWILIO_WHATSAPP_FROM: string;
  TWILIO_WHATSAPP_MESSAGING_SERVICE_SID: string;
  TWILIO_CONTENT_API_ENABLED: boolean;
  WHATSAPP_SESSION_WINDOW_HOURS: number;
  FEATURE_PUSH_ENABLED: boolean;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT: string;
  /** Server-side Mapbox token. Absent ⇒ turf walks are priced with straight lines, and say so. */
  MAPBOX_TOKEN: string;
  MAPBOX_DIRECTIONS_RPM: number;
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
    PLATFORM_TENANT_ID: config.PLATFORM_TENANT_ID?.trim() || "",
    DEV_SEND_OTP_SMS: boolish(config, "DEV_SEND_OTP_SMS", false),
    // Default on in production so a public launch is gated; explicit env value always wins.
    SIGNUP_APPROVAL_REQUIRED: boolish(
      config,
      "SIGNUP_APPROVAL_REQUIRED",
      (config.NODE_ENV?.trim() || "development") === "production",
    ),
    PORT: numberInRange(config, "PORT", 1, 65535, 3001, errors),
    API_BASE_URL: required(config, "API_BASE_URL", errors),
    CORS_ALLOWED_ORIGINS: config.CORS_ALLOWED_ORIGINS?.trim() || "",
    SESSION_COOKIE_DOMAIN: config.SESSION_COOKIE_DOMAIN?.trim() || "",
    PLATFORM_BASE_DOMAIN: config.PLATFORM_BASE_DOMAIN?.trim() || "uprise.org.au",
    AUTH_APP_URL: config.AUTH_APP_URL?.trim() || "",
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
    // SendGrid (meld doc 07). Optional — blank ⇒ SendGridService throws 503 on
    // send and the signed-webhook check is skipped. validateEnv returns ONLY
    // declared keys, so every config.get() key MUST be listed here.
    SENDGRID_API_KEY: config.SENDGRID_API_KEY?.trim() || "",
    SENDGRID_FROM_EMAIL: config.SENDGRID_FROM_EMAIL?.trim() || "",
    SENDGRID_WEBHOOK_VERIFICATION_KEY: config.SENDGRID_WEBHOOK_VERIFICATION_KEY?.trim() || "",
    SENDGRID_WEBHOOK_SECRET: config.SENDGRID_WEBHOOK_SECRET?.trim() || "",
    MARKETING_NOTIFY_EMAIL: config.MARKETING_NOTIFY_EMAIL?.trim() || "",
    // DNSimple (per-tenant email identities). Blank ⇒ the DNS client throws 503
    // and only CUSTOM_DOMAIN/SINGLE_ADDRESS provisioning works.
    DNSIMPLE_API_TOKEN: config.DNSIMPLE_API_TOKEN?.trim() || "",
    DNSIMPLE_ACCOUNT_ID: config.DNSIMPLE_ACCOUNT_ID?.trim() || "",
    DNSIMPLE_ZONE: config.DNSIMPLE_ZONE?.trim() || "uprise.org.au",
    EMAIL_IDENTITY_ROOT_DOMAIN: config.EMAIL_IDENTITY_ROOT_DOMAIN?.trim() || "mail.uprise.org.au",
    TWILIO_ACCOUNT_SID: required(config, "TWILIO_ACCOUNT_SID", errors),
    TWILIO_AUTH_TOKEN: required(config, "TWILIO_AUTH_TOKEN", errors),
    TWILIO_PHONE_NUMBER: required(config, "TWILIO_PHONE_NUMBER", errors),
    TWILIO_STATUS_CALLBACK_URL: config.TWILIO_STATUS_CALLBACK_URL?.trim() || "",
    TWILIO_API_KEY_SID: config.TWILIO_API_KEY_SID?.trim() || "",
    TWILIO_API_KEY_SECRET: config.TWILIO_API_KEY_SECRET?.trim() || "",
    TWILIO_TWIML_APP_SID: config.TWILIO_TWIML_APP_SID?.trim() || "",
    TWILIO_VOICE_FROM: config.TWILIO_VOICE_FROM?.trim() || "",
    TWILIO_VOICE_TWIML_URL: config.TWILIO_VOICE_TWIML_URL?.trim() || "",
    TWILIO_VOICE_STATUS_CALLBACK_URL: config.TWILIO_VOICE_STATUS_CALLBACK_URL?.trim() || "",
    TWILIO_VOICE_RECORDING_CALLBACK_URL: config.TWILIO_VOICE_RECORDING_CALLBACK_URL?.trim() || "",
    TWILIO_SEND_RATE_PER_SECOND: numberInRange(config, "TWILIO_SEND_RATE_PER_SECOND", 1, 500, 475, errors),
    TWILIO_SEND_MAX_CONCURRENT: numberInRange(config, "TWILIO_SEND_MAX_CONCURRENT", 1, 50, 47, errors),
    // Per-subaccount defaults — an AU mobile long code sustains ~1 msg/sec.
    TWILIO_SUBACCOUNT_SEND_RATE_PER_SECOND: numberInRange(
      config,
      "TWILIO_SUBACCOUNT_SEND_RATE_PER_SECOND",
      1,
      500,
      1,
      errors,
    ),
    TWILIO_SUBACCOUNT_SEND_MAX_CONCURRENT: numberInRange(
      config,
      "TWILIO_SUBACCOUNT_SEND_MAX_CONCURRENT",
      1,
      50,
      5,
      errors,
    ),
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
    MAPBOX_TOKEN: config.MAPBOX_TOKEN?.trim() || "",
    MAPBOX_DIRECTIONS_RPM: numberInRange(config, "MAPBOX_DIRECTIONS_RPM", 1, 1200, 240, errors),
    ACTION_NETWORK_API_BASE_URL:
      config.ACTION_NETWORK_API_BASE_URL?.trim() || "https://actionnetwork.org/api/v2",
    ACTION_NETWORK_API_KEY: required(config, "ACTION_NETWORK_API_KEY", errors),
    // Action Network rejects per_page > 25 with a 403, so the range caps there.
    ACTION_NETWORK_SYNC_PER_PAGE: numberInRange(config, "ACTION_NETWORK_SYNC_PER_PAGE", 1, 25, 25, errors),
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
    // Documented Action Network limit: 4 API calls per second per key.
    ACTION_NETWORK_SYNC_REQUESTS_PER_SECOND: numberInRange(
      config,
      "ACTION_NETWORK_SYNC_REQUESTS_PER_SECOND",
      1,
      200,
      4,
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
