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

@Injectable()
export class TwilioService {
  private readonly client: Twilio.Twilio | null;
  private readonly sendRatePerSecond: number;
  private readonly maxConcurrentSends: number;
  private readonly defaultCooldownMs: number;
  private availableTokens: number;
  private tokenLastRefillAt = Date.now();
  private inFlightSends = 0;
  private cooldownUntilMs = 0;

  constructor(private readonly config: ConfigService) {
    const sid = this.config.get<string>("TWILIO_ACCOUNT_SID");
    const token = this.config.get<string>("TWILIO_AUTH_TOKEN");
    this.client = sid && token ? Twilio(sid, token) : null;
    this.sendRatePerSecond = Math.max(
      1,
      Number(this.config.get<string>("TWILIO_SEND_RATE_PER_SECOND", "475")) || 475,
    );
    this.maxConcurrentSends = Math.max(
      1,
      Number(this.config.get<string>("TWILIO_SEND_MAX_CONCURRENT", "47")) || 47,
    );
    this.defaultCooldownMs = Math.max(
      0,
      Number(this.config.get<string>("TWILIO_RATE_LIMIT_COOLDOWN_MS", "114000")) || 114000,
    );
    this.availableTokens = this.sendRatePerSecond;
  }

  private getClient(): Twilio.Twilio {
    if (!this.client) {
      throw new ServiceUnavailableException(
        "Twilio is not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.",
      );
    }
    return this.client;
  }

  private getStatusCallbackUrl(): string | null {
    const explicit = this.config.get<string>("TWILIO_STATUS_CALLBACK_URL", "").trim();
    if (explicit) return explicit;
    const apiBaseUrl = this.config.get<string>("API_BASE_URL", "").trim();
    if (!apiBaseUrl) return null;
    return `${apiBaseUrl.replace(/\/+$/, "")}/api/v1/twilio-status-callback`;
  }

  private async sleep(ms: number): Promise<void> {
    if (ms <= 0) return;
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private refillTokens(nowMs: number): void {
    const elapsedMs = Math.max(0, nowMs - this.tokenLastRefillAt);
    if (elapsedMs <= 0) return;
    const refill = (elapsedMs / 1000) * this.sendRatePerSecond;
    this.availableTokens = Math.min(this.sendRatePerSecond, this.availableTokens + refill);
    this.tokenLastRefillAt = nowMs;
  }

  private async acquireSendPermit(): Promise<void> {
    while (true) {
      const now = Date.now();
      const cooldownWait = Math.max(0, this.cooldownUntilMs - now);
      if (cooldownWait > 0) {
        await this.sleep(Math.min(cooldownWait, 250));
        continue;
      }
      this.refillTokens(now);
      if (this.inFlightSends < this.maxConcurrentSends && this.availableTokens >= 1) {
        this.availableTokens -= 1;
        this.inFlightSends += 1;
        return;
      }
      const tokenWaitMs =
        this.availableTokens >= 1 ? 0 : Math.ceil(((1 - this.availableTokens) / this.sendRatePerSecond) * 1000);
      await this.sleep(Math.max(20, tokenWaitMs));
    }
  }

  private releaseSendPermit(): void {
    this.inFlightSends = Math.max(0, this.inFlightSends - 1);
  }

  private triggerRateLimitCooldown(error: unknown): void {
    const retryAfterMs = parseRetryAfterMs(error) ?? this.defaultCooldownMs;
    this.cooldownUntilMs = Math.max(this.cooldownUntilMs, Date.now() + retryAfterMs);
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

  async sendMessage(to: string, body: string): Promise<TwilioMessage> {
    const client = this.getClient();
    const from = this.config.get<string>("TWILIO_PHONE_NUMBER");
    if (!from?.trim()) {
      throw new ServiceUnavailableException("TWILIO_PHONE_NUMBER is not set.");
    }
    const statusCallback = this.getStatusCallbackUrl();
    await this.acquireSendPermit();
    try {
      const created = await withRetry(
        async () => {
          try {
            return await client.messages.create({
              from: from.trim(),
              to: to.trim(),
              body: body.trim(),
              ...(statusCallback ? { statusCallback } : {}),
            });
          } catch (error) {
            if (isTwilioRateLimitError(error)) {
              this.triggerRateLimitCooldown(error);
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
      this.releaseSendPermit();
    }
  }
}
