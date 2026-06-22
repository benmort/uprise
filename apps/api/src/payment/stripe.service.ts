import { createHmac, timingSafeEqual } from "crypto";
import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { withRetry } from "../common/utils/retry.utils";

/**
 * Stripe adapter (meld doc 08). Config-gated, like TwilioService/SendGridService.
 * Uses the Stripe REST API via fetch (no `stripe` SDK dependency) and verifies
 * webhook signatures with manual HMAC (Stripe's documented scheme), so no SDK is
 * needed. prog's Noop adapter is the test double.
 */
@Injectable()
export class StripeService {
  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.config.get<string>("STRIPE_SECRET_KEY", "").trim());
  }

  /**
   * Verify a Stripe-Signature header (`t=…,v1=…`) over the RAW request body.
   * Returns false on any mismatch / missing secret. Tolerance: 5 minutes.
   */
  verifyWebhookSignature(rawBody: string, signatureHeader: string, toleranceSec = 300): boolean {
    const secret = this.config.get<string>("STRIPE_WEBHOOK_SECRET", "").trim();
    if (!secret || !signatureHeader) return false;
    const parts = Object.fromEntries(
      signatureHeader.split(",").map((p) => {
        const i = p.indexOf("=");
        return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
      }),
    );
    const timestamp = parts["t"];
    const signature = parts["v1"];
    if (!timestamp || !signature) return false;
    const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
    const skew = Math.abs(Date.now() / 1000 - Number(timestamp));
    return Number.isFinite(skew) && skew <= toleranceSec;
  }

  private secret(): string {
    const key = this.config.get<string>("STRIPE_SECRET_KEY", "").trim();
    if (!key) throw new ServiceUnavailableException("Stripe is not configured. Set STRIPE_SECRET_KEY.");
    return key;
  }

  /** Stripe uses application/x-www-form-urlencoded with bracket nesting. */
  private encodeForm(obj: Record<string, unknown>, prefix = ""): string[] {
    const pairs: string[] = [];
    for (const [k, v] of Object.entries(obj)) {
      if (v === undefined || v === null) continue;
      const key = prefix ? `${prefix}[${k}]` : k;
      if (typeof v === "object") pairs.push(...this.encodeForm(v as Record<string, unknown>, key));
      else pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
    }
    return pairs;
  }

  private async post<T = Record<string, unknown>>(path: string, params: Record<string, unknown>): Promise<T> {
    const key = this.secret();
    return withRetry(
      async () => {
        const r = await fetch(`https://api.stripe.com/v1/${path}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
          body: this.encodeForm(params).join("&"),
        });
        if (!r.ok) {
          const text = await r.text().catch(() => "");
          throw new Error(`Stripe ${path} failed (${r.status}): ${text}`);
        }
        return (await r.json()) as T;
      },
      { retries: 2, baseDelayMs: 400, maxDelayMs: 8000 },
    );
  }

  async createCheckoutSession(input: {
    mode: "payment" | "subscription";
    successUrl: string;
    cancelUrl: string;
    lineItems: Array<{ price: string; quantity: number }>;
    customer?: string;
    metadata?: Record<string, string>;
  }): Promise<{ id: string; url: string }> {
    const res = await this.post<{ id: string; url: string }>("checkout/sessions", {
      mode: input.mode,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      line_items: input.lineItems,
      ...(input.customer ? { customer: input.customer } : {}),
      ...(input.metadata ? { metadata: input.metadata } : {}),
    });
    return { id: res.id, url: res.url };
  }

  async createPortalSession(input: { customer: string; returnUrl: string }): Promise<{ id: string; url: string }> {
    const res = await this.post<{ id: string; url: string }>("billing_portal/sessions", {
      customer: input.customer,
      return_url: input.returnUrl,
    });
    return { id: res.id, url: res.url };
  }
}
