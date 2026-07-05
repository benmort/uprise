import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SendGridService } from "../email/sendgrid.service";
import { DomainLogger } from "../common/logging/domain-logger.service";

export interface ContactInput {
  name: string;
  email: string;
  company?: string;
  subject?: string;
  message: string;
}
export interface DemoRequestInput {
  name: string;
  email: string;
  company?: string;
  role?: string;
  useCase?: string;
  timeline?: string;
  additionalInfo?: string;
}
export interface NewsletterInput {
  email: string;
}

/**
 * Marketing site form intake. Public and pre-tenant: submissions have no owning tenant,
 * so nothing is persisted — each form emails the platform contact address instead
 * (PLATFORM_CONTACT_EMAIL, default contact@upriselabs.org). Sent via the platform SendGrid
 * sender (no per-tenant sender, no Email row). No consent gating — inbound service mail.
 */
@Injectable()
export class MarketingService {
  constructor(
    private readonly config: ConfigService,
    private readonly sendgrid: SendGridService,
    private readonly logger: DomainLogger,
  ) {}

  private notifyAddress(): string {
    return this.config.get<string>("PLATFORM_CONTACT_EMAIL", "").trim() || "contact@upriselabs.org";
  }

  private async notify(purpose: string, subject: string, message: string): Promise<{ ok: true }> {
    try {
      await this.sendgrid.send({ to: this.notifyAddress(), subject, body: message });
    } catch (err) {
      // Public marketing forms must not surface infra errors to the visitor. SendGrid may
      // be unconfigured; log and degrade to success rather than 500 the form.
      this.logger.warn("marketing", `Notify email failed for ${purpose}`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return { ok: true };
  }

  submitContact(input: ContactInput): Promise<{ ok: true }> {
    const message = [
      `Name: ${input.name}`,
      `Email: ${input.email}`,
      input.company ? `Company: ${input.company}` : null,
      input.subject ? `Subject: ${input.subject}` : null,
      "",
      input.message,
    ]
      .filter((l) => l !== null)
      .join("\n");
    return this.notify("contact_form", `Contact form: ${input.subject || input.name}`, message);
  }

  requestDemo(input: DemoRequestInput): Promise<{ ok: true }> {
    const message = [
      `Name: ${input.name}`,
      `Email: ${input.email}`,
      input.company ? `Company: ${input.company}` : null,
      input.role ? `Role: ${input.role}` : null,
      input.useCase ? `Use case: ${input.useCase}` : null,
      input.timeline ? `Timeline: ${input.timeline}` : null,
      input.additionalInfo ? `Additional info: ${input.additionalInfo}` : null,
    ]
      .filter((l) => l !== null)
      .join("\n");
    return this.notify("demo_request", `Demo request: ${input.name}`, message);
  }

  newsletterSignup(input: NewsletterInput): Promise<{ ok: true }> {
    return this.notify("newsletter_signup", "Newsletter signup", `Newsletter signup: ${input.email}`);
  }
}
