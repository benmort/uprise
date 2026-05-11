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

@Injectable()
export class TwilioService {
  private readonly client: Twilio.Twilio | null;

  constructor(private readonly config: ConfigService) {
    const sid = this.config.get<string>("TWILIO_ACCOUNT_SID");
    const token = this.config.get<string>("TWILIO_AUTH_TOKEN");
    this.client = sid && token ? Twilio(sid, token) : null;
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
    const created = await withRetry(
      () =>
        client.messages.create({
          from: from.trim(),
          to: to.trim(),
          body: body.trim(),
          ...(statusCallback ? { statusCallback } : {}),
        }),
      { retries: 2 },
    );
    return toMessage(created);
  }
}
