import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { withRetry } from "../common/utils/retry.utils";

export interface SendGridSendInput {
  to: string;
  subject: string;
  body: string;
  customArgs?: Record<string, string>;
}

export interface SendGridSendResult {
  providerMessageId: string;
}

/**
 * SendGrid adapter (meld doc 07), modelled on TwilioService: config-gated, with
 * retry, throws ServiceUnavailable when unconfigured. Uses the SendGrid REST API
 * via fetch (no @sendgrid/mail dependency). prog's Noop adapter is the test double.
 */
@Injectable()
export class SendGridService {
  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.config.get<string>("SENDGRID_API_KEY", "").trim());
  }

  async send(input: SendGridSendInput): Promise<SendGridSendResult> {
    const apiKey = this.config.get<string>("SENDGRID_API_KEY", "").trim();
    const from = this.config.get<string>("SENDGRID_FROM_EMAIL", "").trim();
    if (!apiKey || !from) {
      throw new ServiceUnavailableException(
        "SendGrid is not configured. Set SENDGRID_API_KEY and SENDGRID_FROM_EMAIL.",
      );
    }
    const payload = {
      personalizations: [
        {
          to: [{ email: input.to }],
          ...(input.customArgs ? { custom_args: input.customArgs } : {}),
        },
      ],
      from: { email: from },
      subject: input.subject,
      content: [{ type: "text/plain", value: input.body }],
    };
    const res = await withRetry(
      async () => {
        const r = await fetch("https://api.sendgrid.com/v3/mail/send", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!r.ok) {
          const text = await r.text().catch(() => "");
          throw new Error(`SendGrid send failed (${r.status}): ${text}`);
        }
        return r;
      },
      { retries: 3, baseDelayMs: 400, maxDelayMs: 8000 },
    );
    return { providerMessageId: res.headers.get("x-message-id") ?? "" };
  }
}
