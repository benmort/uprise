import { createPublicKey, createVerify } from "crypto";
import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { withRetry } from "../common/utils/retry.utils";
import type { ResolvedEmailSender } from "./email-sender.resolver";

export interface SendGridSendInput {
  to: string;
  /** Required for ad-hoc sends; optional when a dynamic template supplies it. */
  subject?: string;
  /** text/plain body. Provide body and/or html, or a templateId. */
  body?: string;
  /** text/html body (ordered after text/plain per SendGrid's content rules). */
  html?: string;
  /** SendGrid dynamic template id; subject/content then come from the template. */
  templateId?: string;
  dynamicTemplateData?: Record<string, unknown>;
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

  /** Whether the signed-event-webhook verification key is configured. */
  isWebhookVerificationConfigured(): boolean {
    return Boolean(this.config.get<string>("SENDGRID_WEBHOOK_VERIFICATION_KEY", "").trim());
  }

  /**
   * Verify SendGrid's Signed Event Webhook (doc 07): ECDSA-P256/SHA-256 over
   * `timestamp + rawPayload`, with the base64 signature + timestamp headers and
   * the base64 DER (SPKI) public key from the console. Returns false on any
   * mismatch / missing input.
   */
  verifyEventWebhookSignature(rawPayload: string, signature: string, timestamp: string): boolean {
    const publicKeyB64 = this.config.get<string>("SENDGRID_WEBHOOK_VERIFICATION_KEY", "").trim();
    return this.verifyEventWebhookSignatureWithKey(publicKeyB64, rawPayload, signature, timestamp);
  }

  /** Verify with an explicit public key — per-subuser webhooks each sign with their own. */
  verifyEventWebhookSignatureWithKey(
    publicKeyB64: string,
    rawPayload: string,
    signature: string,
    timestamp: string,
  ): boolean {
    if (!publicKeyB64 || !signature || !timestamp) return false;
    try {
      const publicKey = createPublicKey({
        key: Buffer.from(publicKeyB64, "base64"),
        format: "der",
        type: "spki",
      });
      const verifier = createVerify("sha256");
      verifier.update(timestamp + rawPayload);
      verifier.end();
      return verifier.verify(publicKey, Buffer.from(signature, "base64"));
    } catch {
      return false;
    }
  }

  async send(input: SendGridSendInput, sender?: ResolvedEmailSender): Promise<SendGridSendResult> {
    // Per-tenant sender (subuser/BYO key + identity from-address) beats the
    // platform env pair; absent sender = the pre-multi-tenant behaviour.
    const apiKey = sender?.apiKey ?? this.config.get<string>("SENDGRID_API_KEY", "").trim();
    const from = sender?.fromEmail ?? this.config.get<string>("SENDGRID_FROM_EMAIL", "").trim();
    if (!apiKey || !from) {
      throw new ServiceUnavailableException(
        "SendGrid is not configured. Set SENDGRID_API_KEY and SENDGRID_FROM_EMAIL.",
      );
    }
    // SendGrid requires either content[] or a template_id. text/plain must precede
    // text/html in content[].
    const content: Array<{ type: string; value: string }> = [];
    if (input.body) content.push({ type: "text/plain", value: input.body });
    if (input.html) content.push({ type: "text/html", value: input.html });
    if (!input.templateId && content.length === 0) {
      throw new ServiceUnavailableException(
        "SendGrid send requires a body, html, or templateId.",
      );
    }
    const payload = {
      personalizations: [
        {
          to: [{ email: input.to }],
          ...(input.dynamicTemplateData
            ? { dynamic_template_data: input.dynamicTemplateData }
            : {}),
          ...(input.customArgs ? { custom_args: input.customArgs } : {}),
        },
      ],
      from: { email: from, ...(sender?.fromName ? { name: sender.fromName } : {}) },
      ...(input.subject ? { subject: input.subject } : {}),
      ...(content.length > 0 ? { content } : {}),
      ...(input.templateId ? { template_id: input.templateId } : {}),
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
