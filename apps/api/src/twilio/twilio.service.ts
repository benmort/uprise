import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Twilio from "twilio";
import { withRetry } from "../common/utils/retry.utils";

export type TwilioMessage = {
  sid: string;
  body: string | null;
  from: string;
  to: string;
  dateCreated: string;
  dateSent: string | null;
  dateUpdated: string;
  direction: string;
  status: string;
  errorCode: number | null;
  errorMessage: string | null;
  numMedia: string;
  numSegments: string;
};

export type MessagesPage = {
  messages: TwilioMessage[];
  nextPageToken: string | null;
  previousPageToken: string | null;
};

export type SendChannel = "SMS" | "WHATSAPP";

/**
 * A resolved per-tenant sender (TelephonySenderResolver). When absent, sends
 * use the platform TWILIO_* env credentials — the pre-multi-tenant behaviour.
 * Exactly one of `from` / `messagingServiceSid` addresses the message.
 */
export type ResolvedSender = {
  accountSid: string;
  authToken: string;
  from?: string;
  messagingServiceSid?: string;
  /** Per-account rate overrides (TelephonyAccount.settings). */
  ratePerSecond?: number;
  maxConcurrent?: number;
};

export interface SendOptions {
  /** Defaults to SMS — the existing behaviour. */
  channel?: SendChannel;
  /** WhatsApp: an approved Content template SID (HX...). Required outside the 24h window. */
  contentSid?: string;
  /** WhatsApp: ordered variable values for the template, keyed "1","2",... */
  contentVariables?: Record<string, string>;
  /** Optional media URLs (WhatsApp media / MMS). */
  mediaUrl?: string[];
  /** Per-tenant sender; omit for the platform env account. */
  sender?: ResolvedSender;
}

/** Normalise an address to a WhatsApp channel address (`whatsapp:+E164`). */
export function toWhatsappAddress(address: string): string {
  const trimmed = String(address || "").trim();
  return trimmed.startsWith("whatsapp:") ? trimmed : `whatsapp:${trimmed}`;
}

function parsePageToken(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = String(url).match(/[?&]PageToken=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function toMessage(m: any): TwilioMessage {
  return {
    sid: m.sid,
    body: m.body,
    from: m.from,
    to: m.to,
    dateCreated: m.dateCreated?.toISOString?.() ?? String(m.dateCreated),
    dateSent: m.dateSent?.toISOString?.() ?? (m.dateSent != null ? String(m.dateSent) : null),
    dateUpdated: m.dateUpdated?.toISOString?.() ?? String(m.dateUpdated),
    direction: m.direction,
    status: m.status,
    errorCode: m.errorCode,
    errorMessage: m.errorMessage,
    numMedia: String(m.numMedia ?? "0"),
    numSegments: String(m.numSegments ?? "0"),
  };
}

function parseRetryAfterMs(error: unknown): number | null {
  const maybeHeaders = (error as { headers?: Record<string, string> })?.headers;
  if (maybeHeaders && typeof maybeHeaders["retry-after"] === "string") {
    const retryAfter = Number(maybeHeaders["retry-after"]);
    if (Number.isFinite(retryAfter)) return Math.max(0, Math.trunc(retryAfter * 1000));
  }
  const message = String((error as { message?: string })?.message || "");
  const retryAfterMatch = message.match(/retry[- ]after[:= ]+(\d+)/i);
  if (retryAfterMatch) {
    return Math.max(0, Number(retryAfterMatch[1]) * 1000);
  }
  return null;
}

function twilioStatusCode(error: unknown): number | null {
  const status = (error as { status?: unknown })?.status;
  if (typeof status === "number" && Number.isFinite(status)) return status;
  const code = (error as { statusCode?: unknown })?.statusCode;
  if (typeof code === "number" && Number.isFinite(code)) return code;
  return null;
}

function twilioErrorCode(error: unknown): number | null {
  const code = (error as { code?: unknown })?.code;
  if (typeof code === "number" && Number.isFinite(code)) return code;
  return null;
}

function isTwilioRateLimitError(error: unknown): boolean {
  const status = twilioStatusCode(error);
  const code = twilioErrorCode(error);
  if (status === 429) return true;
  if (code === 20429 || code === 14107) return true;
  const text = String((error as { message?: string })?.message || "").toLowerCase();
  return text.includes("rate limit") || text.includes("too many requests");
}

function isRetryableTwilioError(error: unknown): boolean {
  if (isTwilioRateLimitError(error)) return true;
  const status = twilioStatusCode(error);
  if (status === null) return true;
  return status >= 500 || status === 408;
}

/** Token-bucket + concurrency state for ONE Twilio account. */
type RateBucket = {
  ratePerSecond: number;
  maxConcurrent: number;
  availableTokens: number;
  tokenLastRefillAt: number;
  inFlightSends: number;
  cooldownUntilMs: number;
  lastUsedAt: number;
};

/** Cap on cached per-account clients/buckets; idle entries are evicted LRU. */
const MAX_CACHED_ACCOUNTS = 500;

@Injectable()
export class TwilioService {
  private readonly platformAccountSid: string | null;
  private readonly client: Twilio.Twilio | null;
  private readonly clients = new Map<string, Twilio.Twilio>();
  private readonly buckets = new Map<string, RateBucket>();
  private readonly sendRatePerSecond: number;
  private readonly maxConcurrentSends: number;
  private readonly subaccountRatePerSecond: number;
  private readonly subaccountMaxConcurrent: number;
  private readonly defaultCooldownMs: number;

  constructor(private readonly config: ConfigService) {
    const sid = this.config.get<string>("TWILIO_ACCOUNT_SID");
    const token = this.config.get<string>("TWILIO_AUTH_TOKEN");
    this.platformAccountSid = sid || null;
    this.client = sid && token ? Twilio(sid, token) : null;
    this.sendRatePerSecond = Math.max(
      1,
      Number(this.config.get<string>("TWILIO_SEND_RATE_PER_SECOND", "475")) || 475,
    );
    this.maxConcurrentSends = Math.max(
      1,
      Number(this.config.get<string>("TWILIO_SEND_MAX_CONCURRENT", "47")) || 47,
    );
    // A single AU mobile long code sustains ~1 message/sec before carrier
    // filtering — subaccount buckets default far below the platform account.
    this.subaccountRatePerSecond = Math.max(
      1,
      Number(this.config.get<string>("TWILIO_SUBACCOUNT_SEND_RATE_PER_SECOND", "1")) || 1,
    );
    this.subaccountMaxConcurrent = Math.max(
      1,
      Number(this.config.get<string>("TWILIO_SUBACCOUNT_SEND_MAX_CONCURRENT", "5")) || 5,
    );
    this.defaultCooldownMs = Math.max(
      0,
      Number(this.config.get<string>("TWILIO_RATE_LIMIT_COOLDOWN_MS", "114000")) || 114000,
    );
  }

  private getClient(sender?: ResolvedSender): Twilio.Twilio {
    if (sender && sender.accountSid !== this.platformAccountSid) {
      const cached = this.clients.get(sender.accountSid);
      if (cached) return cached;
      const created = Twilio(sender.accountSid, sender.authToken);
      this.evictIdleAccounts();
      this.clients.set(sender.accountSid, created);
      return created;
    }
    if (!this.client) {
      throw new ServiceUnavailableException(
        "Twilio is not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.",
      );
    }
    return this.client;
  }

  /** The rate bucket for the sending account (platform bucket when no sender). */
  private bucketFor(sender?: ResolvedSender): RateBucket {
    const isPlatform = !sender || sender.accountSid === this.platformAccountSid;
    const key = isPlatform ? (this.platformAccountSid ?? "platform") : sender.accountSid;
    const existing = this.buckets.get(key);
    if (existing) {
      existing.lastUsedAt = Date.now();
      // Re-sync overrides on every hit — TelephonyAccount.settings changes must
      // apply on the next send, not after an eventual eviction.
      if (!isPlatform) {
        existing.ratePerSecond = Math.max(1, sender.ratePerSecond ?? this.subaccountRatePerSecond);
        existing.maxConcurrent = Math.max(1, sender.maxConcurrent ?? this.subaccountMaxConcurrent);
        existing.availableTokens = Math.min(existing.availableTokens, existing.ratePerSecond);
      }
      return existing;
    }
    const ratePerSecond = isPlatform
      ? this.sendRatePerSecond
      : Math.max(1, sender.ratePerSecond ?? this.subaccountRatePerSecond);
    const maxConcurrent = isPlatform
      ? this.maxConcurrentSends
      : Math.max(1, sender.maxConcurrent ?? this.subaccountMaxConcurrent);
    const bucket: RateBucket = {
      ratePerSecond,
      maxConcurrent,
      availableTokens: ratePerSecond,
      tokenLastRefillAt: Date.now(),
      inFlightSends: 0,
      cooldownUntilMs: 0,
      lastUsedAt: Date.now(),
    };
    this.evictIdleAccounts();
    this.buckets.set(key, bucket);
    return bucket;
  }

  /**
   * Bound the per-account caches. Idle entries evict first; when everything is
   * mid-send the least-recently-used entries still go (an evicted bucket only
   * loses throttle state — releaseSendPermit holds its own reference), so the
   * cache can never grow unbounded under sustained all-tenants load.
   */
  private evictIdleAccounts(): void {
    if (this.buckets.size < MAX_CACHED_ACCOUNTS && this.clients.size < MAX_CACHED_ACCOUNTS) return;
    const byLru = [...this.buckets.entries()].sort((a, b) => a[1].lastUsedAt - b[1].lastUsedAt);
    const idleFirst = [...byLru.filter(([, b]) => b.inFlightSends === 0), ...byLru.filter(([, b]) => b.inFlightSends > 0)];
    for (const [key] of idleFirst.slice(0, Math.max(1, Math.floor(MAX_CACHED_ACCOUNTS / 10)))) {
      this.buckets.delete(key);
      this.clients.delete(key);
    }
  }

  private getStatusCallbackUrl(): string | null {
    const explicit = this.config.get<string>("TWILIO_STATUS_CALLBACK_URL", "").trim();
    if (explicit) return explicit;
    const apiBaseUrl = this.config.get<string>("API_BASE_URL", "").trim();
    if (!apiBaseUrl) return null;
    return `${apiBaseUrl.replace(/\/+$/, "")}/api/v1/twilio-status-callback`;
  }

  private getVoiceStatusCallbackUrl(): string | null {
    const explicit = this.config.get<string>("TWILIO_VOICE_STATUS_CALLBACK_URL", "").trim();
    if (explicit) return explicit;
    const apiBaseUrl = this.config.get<string>("API_BASE_URL", "").trim();
    if (!apiBaseUrl) return null;
    return `${apiBaseUrl.replace(/\/+$/, "")}/api/v1/voice-status-callback`;
  }

  private getVoiceRecordingCallbackUrl(): string | null {
    const explicit = this.config.get<string>("TWILIO_VOICE_RECORDING_CALLBACK_URL", "").trim();
    if (explicit) return explicit;
    const apiBaseUrl = this.config.get<string>("API_BASE_URL", "").trim();
    if (!apiBaseUrl) return null;
    return `${apiBaseUrl.replace(/\/+$/, "")}/api/v1/voice-recording-callback`;
  }

  // ── Browser voice (WebRTC softphone) ──────────────────────────────────────

  /**
   * Mint a short-lived Twilio Voice access token for the browser softphone. Signed
   * with the placing account's API key; the VoiceGrant points at that account's
   * TwiML App (outbound only). `identity` ties the token to the session.
   */
  mintVoiceToken(params: {
    accountSid: string;
    apiKeySid: string;
    apiKeySecret: string;
    twimlAppSid: string;
    identity: string;
    ttlSeconds?: number;
  }): string {
    const { AccessToken } = Twilio.jwt;
    const token = new AccessToken(params.accountSid, params.apiKeySid, params.apiKeySecret, {
      identity: params.identity,
      ttl: params.ttlSeconds ?? 3600,
    });
    token.addGrant(
      new AccessToken.VoiceGrant({ outgoingApplicationSid: params.twimlAppSid, incomingAllow: false }),
    );
    return token.toJwt();
  }

  /**
   * Create a Voice API key + TwiML App under an account (platform or subaccount) so
   * the browser softphone can place calls from that account's number. Returns the
   * SIDs + the API-key secret (only available at creation — the caller persists it,
   * encrypted). The account is chosen by `sender.accountSid` (platform when it matches).
   */
  async createVoiceApp(
    sender: ResolvedSender,
    voiceUrl: string,
  ): Promise<{ apiKeySid: string; apiKeySecret: string; twimlAppSid: string }> {
    const client = this.getClient(sender);
    const key = await client.newKeys.create({ friendlyName: "uprise-voice" });
    const app = await client.applications.create({
      friendlyName: "uprise-voice",
      voiceUrl,
      voiceMethod: "POST",
    });
    return { apiKeySid: key.sid, apiKeySecret: key.secret ?? "", twimlAppSid: app.sid };
  }

  /**
   * TwiML for a browser-originated outbound call: bridge the softphone leg to the
   * PSTN callee, recording the answered call, threading our Call `callId` through
   * the status + recording callbacks so the existing handlers bind it.
   */
  buildDialTwiml(params: {
    to: string;
    callerId: string;
    callId: string;
    statusCallbackBase: string;
    recordingCallbackBase: string;
  }): string {
    const response = new Twilio.twiml.VoiceResponse();
    const q = `callId=${encodeURIComponent(params.callId)}`;
    const dial = response.dial({
      callerId: params.callerId,
      record: "record-from-answer-dual",
      recordingStatusCallback: `${params.recordingCallbackBase}?${q}`,
      recordingStatusCallbackEvent: ["completed"],
    });
    dial.number(
      {
        statusCallback: `${params.statusCallbackBase}?${q}`,
        statusCallbackMethod: "POST",
        statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
      },
      params.to,
    );
    return response.toString();
  }

  private async sleep(ms: number): Promise<void> {
    if (ms <= 0) return;
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private refillTokens(bucket: RateBucket, nowMs: number): void {
    const elapsedMs = Math.max(0, nowMs - bucket.tokenLastRefillAt);
    if (elapsedMs <= 0) return;
    const refill = (elapsedMs / 1000) * bucket.ratePerSecond;
    bucket.availableTokens = Math.min(bucket.ratePerSecond, bucket.availableTokens + refill);
    bucket.tokenLastRefillAt = nowMs;
  }

  private async acquireSendPermit(bucket: RateBucket): Promise<void> {
    while (true) {
      const now = Date.now();
      const cooldownWait = Math.max(0, bucket.cooldownUntilMs - now);
      if (cooldownWait > 0) {
        await this.sleep(Math.min(cooldownWait, 250));
        continue;
      }
      this.refillTokens(bucket, now);
      if (bucket.inFlightSends < bucket.maxConcurrent && bucket.availableTokens >= 1) {
        bucket.availableTokens -= 1;
        bucket.inFlightSends += 1;
        bucket.lastUsedAt = now;
        return;
      }
      const tokenWaitMs =
        bucket.availableTokens >= 1 ? 0 : Math.ceil(((1 - bucket.availableTokens) / bucket.ratePerSecond) * 1000);
      await this.sleep(Math.max(20, tokenWaitMs));
    }
  }

  private releaseSendPermit(bucket: RateBucket): void {
    bucket.inFlightSends = Math.max(0, bucket.inFlightSends - 1);
  }

  private triggerRateLimitCooldown(bucket: RateBucket, error: unknown): void {
    const retryAfterMs = parseRetryAfterMs(error) ?? this.defaultCooldownMs;
    bucket.cooldownUntilMs = Math.max(bucket.cooldownUntilMs, Date.now() + retryAfterMs);
  }

  async getMessagesPage(opts: { pageSize: number; pageToken?: string | null }): Promise<MessagesPage> {
    const client = this.getClient();
    const pageSize = Math.min(Math.max(1, opts.pageSize || 20), 100);
    const params: { pageSize: number; pageToken?: string } = { pageSize };
    if (opts.pageToken) params.pageToken = opts.pageToken;

    const page = await withRetry(() => client.messages.page(params), { retries: 2 });
    const instances = (page as unknown as { instances?: unknown[] }).instances ?? [];
    const messages = instances.map((m) => toMessage(m));

    const nextUrl =
      (page as unknown as { nextPageUrl?: string }).nextPageUrl ??
      (typeof (page as any).getNextPageUrl === "function" ? (page as any).getNextPageUrl() : null);
    const prevUrl =
      (page as unknown as { previousPageUrl?: string }).previousPageUrl ??
      (typeof (page as any).getPreviousPageUrl === "function"
        ? (page as any).getPreviousPageUrl()
        : null);

    return {
      messages,
      nextPageToken: parsePageToken(nextUrl),
      previousPageToken: parsePageToken(prevUrl),
    };
  }

  async getMessagesForPhoneNumber(phoneNumber: string, limit = 100): Promise<MessagesPage> {
    const client = this.getClient();
    const capped = Math.min(Math.max(1, limit), 200);
    const [toList, fromList] = await Promise.all([
      withRetry(() => client.messages.list({ to: phoneNumber, limit: capped }), { retries: 2 }),
      withRetry(() => client.messages.list({ from: phoneNumber, limit: capped }), { retries: 2 }),
    ]);

    const seen = new Set<string>();
    const merged: TwilioMessage[] = [];
    for (const m of [...toList, ...fromList]) {
      if (seen.has(m.sid)) continue;
      seen.add(m.sid);
      merged.push(toMessage(m));
    }
    merged.sort((a, b) => {
      const da = a.dateSent || a.dateCreated;
      const db = b.dateSent || b.dateCreated;
      return new Date(da).getTime() - new Date(db).getTime();
    });

    return {
      messages: merged,
      nextPageToken: null,
      previousPageToken: null,
    };
  }

  async getLatestByContact(limit = 200): Promise<Record<string, { direction: string; date: string; body: string; status: string }>> {
    const client = this.getClient();
    const list = await withRetry(() => client.messages.list({ limit: Math.min(Math.max(1, limit), 200) }), {
      retries: 2,
    });
    const map: Record<string, { direction: string; date: string; body: string; status: string }> = {};
    for (const m of list) {
      const contact = String(m.direction || "").toLowerCase().startsWith("inbound") ? m.from : m.to;
      if (contact && !map[contact]) {
        const d = m.dateSent ?? m.dateCreated;
        map[contact] = {
          direction: m.direction ?? "",
          date: d ? (typeof d === "string" ? d : d.toISOString?.() ?? String(d)) : "",
          body: m.body ?? "",
          status: m.status ?? "",
        };
      }
    }
    return map;
  }

  /**
   * Build the Twilio create params for the requested channel. SMS uses the
   * configured phone number; WhatsApp prefixes addresses with `whatsapp:` and
   * uses the WhatsApp sender (or a messaging service), optionally via a Content
   * template (required for business-initiated sends outside the 24h window).
   */
  private buildCreateParams(to: string, body: string, opts: SendOptions): Record<string, unknown> {
    const statusCallback = this.getStatusCallbackUrl();
    const channel = opts.channel ?? "SMS";
    const base: Record<string, unknown> = {
      ...(statusCallback ? { statusCallback } : {}),
      ...(opts.mediaUrl && opts.mediaUrl.length ? { mediaUrl: opts.mediaUrl } : {}),
    };

    if (channel === "WHATSAPP") {
      const messagingServiceSid =
        opts.sender?.messagingServiceSid?.trim() ||
        this.config.get<string>("TWILIO_WHATSAPP_MESSAGING_SERVICE_SID", "").trim();
      const from =
        opts.sender?.from?.trim() || this.config.get<string>("TWILIO_WHATSAPP_FROM", "").trim();
      if (!messagingServiceSid && !from) {
        throw new ServiceUnavailableException(
          "WhatsApp sender is not configured. Set TWILIO_WHATSAPP_FROM or TWILIO_WHATSAPP_MESSAGING_SERVICE_SID.",
        );
      }
      return {
        ...base,
        to: toWhatsappAddress(to),
        ...(messagingServiceSid
          ? { messagingServiceSid }
          : { from: toWhatsappAddress(from) }),
        ...(opts.contentSid
          ? {
              contentSid: opts.contentSid,
              ...(opts.contentVariables
                ? { contentVariables: JSON.stringify(opts.contentVariables) }
                : {}),
            }
          : { body: body.trim() }),
      };
    }

    const messagingServiceSid = opts.sender?.messagingServiceSid?.trim();
    if (messagingServiceSid) {
      return { ...base, messagingServiceSid, to: to.trim(), body: body.trim() };
    }
    const from = opts.sender?.from?.trim() || this.config.get<string>("TWILIO_PHONE_NUMBER");
    if (!from?.trim()) {
      throw new ServiceUnavailableException("TWILIO_PHONE_NUMBER is not set.");
    }
    return { ...base, from: from.trim(), to: to.trim(), body: body.trim() };
  }

  /**
   * Fetch WhatsApp Content templates with their approval status from Twilio's
   * Content API. Defensive against SDK shape differences across versions.
   */
  async listWhatsappContentTemplates(): Promise<
    Array<{
      contentSid: string;
      friendlyName: string;
      language: string;
      category: string;
      status: string;
      variables: Record<string, string> | null;
      bodyPreview: string | null;
    }>
  > {
    const client = this.getClient() as any;
    const content = client?.content?.v1;
    if (!content?.contentAndApprovals?.list) return [];
    const rows = await withRetry(() => content.contentAndApprovals.list({ limit: 200 }), {
      retries: 2,
    });
    return (rows as any[]).map((row) => {
      const approval = row.approvalRequests ?? row.approval_requests ?? {};
      const types = row.types ?? {};
      const textType =
        types["twilio/text"] ?? types["whatsapp/card"] ?? Object.values(types)[0] ?? null;
      const bodyPreview =
        (textType && typeof textType === "object" && "body" in textType
          ? String((textType as { body?: unknown }).body ?? "")
          : null) || null;
      return {
        contentSid: String(row.sid ?? ""),
        friendlyName: String(row.friendlyName ?? row.friendly_name ?? row.sid ?? ""),
        language: String(row.language ?? "en"),
        category: String(approval.category ?? "UTILITY").toUpperCase(),
        status: String(approval.status ?? "pending").toLowerCase(),
        variables:
          row.variables && typeof row.variables === "object"
            ? (row.variables as Record<string, string>)
            : null,
        bodyPreview,
      };
    });
  }

  async sendMessage(to: string, body: string, opts: SendOptions = {}): Promise<TwilioMessage> {
    const client = this.getClient(opts.sender);
    const bucket = this.bucketFor(opts.sender);
    const params = this.buildCreateParams(to, body, opts);
    await this.acquireSendPermit(bucket);
    try {
      const created = await withRetry(
        async () => {
          try {
            return await client.messages.create(params as any);
          } catch (error) {
            if (isTwilioRateLimitError(error)) {
              this.triggerRateLimitCooldown(bucket, error);
            }
            throw error;
          }
        },
        {
          retries: 4,
          baseDelayMs: 400,
          maxDelayMs: 10000,
          shouldRetry: (error) => isRetryableTwilioError(error),
        },
      );
      return toMessage(created);
    } finally {
      this.releaseSendPermit(bucket);
    }
  }

  /** Params for a transactional SMS — a distinct sender from marketing so
   *  carriers classify it correctly and reputation is isolated. */
  private buildTransactionalParams(to: string, body: string, sender?: ResolvedSender): Record<string, unknown> {
    const statusCallback = this.getStatusCallbackUrl();
    const messagingServiceSid =
      sender?.messagingServiceSid?.trim() ||
      (sender ? "" : this.config.get<string>("TWILIO_TRANSACTIONAL_MESSAGING_SERVICE_SID", "").trim());
    const from =
      sender?.from?.trim() ||
      (sender
        ? ""
        : this.config.get<string>("TWILIO_TRANSACTIONAL_FROM", "").trim() ||
          this.config.get<string>("TWILIO_PHONE_NUMBER", "").trim());
    if (!messagingServiceSid && !from) {
      throw new ServiceUnavailableException(
        "Transactional sender is not configured. Set TWILIO_TRANSACTIONAL_FROM, TWILIO_TRANSACTIONAL_MESSAGING_SERVICE_SID, or TWILIO_PHONE_NUMBER.",
      );
    }
    return {
      ...(statusCallback ? { statusCallback } : {}),
      to: to.trim(),
      body: body.trim(),
      ...(messagingServiceSid ? { messagingServiceSid } : { from }),
    };
  }

  /**
   * Send a transactional SMS (2FA, verification, receipts). Reuses the rate
   * limiter + retry, but a SEPARATE sender from marketing. Never gated by
   * consent/compliance — that's the caller's contract (TransactionalMessagingService).
   */
  async sendTransactional(to: string, body: string, sender?: ResolvedSender): Promise<TwilioMessage> {
    const client = this.getClient(sender);
    const bucket = this.bucketFor(sender);
    const params = this.buildTransactionalParams(to, body, sender);
    await this.acquireSendPermit(bucket);
    try {
      const created = await withRetry(
        async () => {
          try {
            return await client.messages.create(params as any);
          } catch (error) {
            if (isTwilioRateLimitError(error)) {
              this.triggerRateLimitCooldown(bucket, error);
            }
            throw error;
          }
        },
        {
          retries: 4,
          baseDelayMs: 400,
          maxDelayMs: 10000,
          shouldRetry: (error) => isRetryableTwilioError(error),
        },
      );
      return toMessage(created);
    } finally {
      this.releaseSendPermit(bucket);
    }
  }

  /**
   * Place an outbound voice call (meld doc 09). Twilio requires exactly one of
   * `url` (a TwiML endpoint) or `twiml` (inline TwiML). Subscribes to the call
   * lifecycle so /voice-status-callback drives the Call FSM. Returns the
   * provider CallSid + initial status; reuses the rate limiter + retry.
   */
  async placeCall(input: {
    to: string;
    from?: string;
    url?: string;
    twiml?: string;
  }): Promise<{ sid: string; status: string }> {
    const client = this.getClient();
    const to = input.to.trim();
    const from =
      (input.from?.trim() || "") ||
      this.config.get<string>("TWILIO_VOICE_FROM", "").trim() ||
      this.config.get<string>("TWILIO_PHONE_NUMBER", "").trim();
    if (!from) {
      throw new ServiceUnavailableException(
        "Voice sender is not configured. Set TWILIO_VOICE_FROM or TWILIO_PHONE_NUMBER.",
      );
    }
    const url = input.url ?? this.config.get<string>("TWILIO_VOICE_TWIML_URL", "").trim();
    const twiml = input.twiml;
    if (!url && !twiml) {
      throw new ServiceUnavailableException(
        "A voice call requires `url`, `twiml`, or TWILIO_VOICE_TWIML_URL.",
      );
    }

    const statusCallback = this.getVoiceStatusCallbackUrl();
    const recordingCallback = this.getVoiceRecordingCallbackUrl();
    const params: Record<string, unknown> = {
      to,
      from,
      ...(url ? { url } : { twiml }),
      // Record the call (transactional calls are logged for playback). The recording
      // completes after the call, so bind it via the dedicated recording callback.
      record: true,
      ...(recordingCallback
        ? { recordingStatusCallback: recordingCallback, recordingStatusCallbackEvent: ["completed"] }
        : {}),
      ...(statusCallback
        ? {
            statusCallback,
            statusCallbackMethod: "POST",
            statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
          }
        : {}),
    };

    const bucket = this.bucketFor();
    await this.acquireSendPermit(bucket);
    try {
      const created = await withRetry(
        async () => {
          try {
            return await client.calls.create(params as any);
          } catch (error) {
            if (isTwilioRateLimitError(error)) {
              this.triggerRateLimitCooldown(bucket, error);
            }
            throw error;
          }
        },
        {
          retries: 4,
          baseDelayMs: 400,
          maxDelayMs: 10000,
          shouldRetry: (error) => isRetryableTwilioError(error),
        },
      );
      return { sid: String((created as any).sid), status: String((created as any).status ?? "queued") };
    } finally {
      this.releaseSendPermit(bucket);
    }
  }
}
