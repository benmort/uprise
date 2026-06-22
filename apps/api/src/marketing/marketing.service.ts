import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { EmailService } from "../email/email.service";
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
}
export interface NewsletterInput {
  email: string;
}

/**
 * Marketing site form intake (meld doc 12 / prog marketing-client). Public, pre-tenant:
 * each submission notifies the marketing inbox via the existing transactional email
 * templates (contact_form / demo_request / newsletter), attributed to the default org.
 * No consent gating — this is inbound service mail, not outbound marketing.
 */
@Injectable()
export class MarketingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly email: EmailService,
    private readonly logger: DomainLogger,
  ) {}

  private async defaultTenantId(): Promise<string> {
    const slug = this.config.get<string>("DEFAULT_ORGANIZATION_SLUG", "default");
    const org = await this.prisma.tenant.upsert({
      where: { slug },
      create: { slug, name: "Default Organization" },
      update: {},
    });
    return org.id;
  }

  private notifyAddress(): string {
    return this.config.get<string>("MARKETING_NOTIFY_EMAIL", "").trim() || "hello@example.org";
  }

  private async notify(templateKey: string, purpose: string, message: string): Promise<{ ok: true }> {
    const tenantId = await this.defaultTenantId();
    await this.email.sendTransactional({
      tenantId,
      toAddress: this.notifyAddress(),
      templateKey,
      vars: { message, subject: purpose, body: message },
      purpose,
    });
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
    return this.notify("contact_form", "contact_form", message);
  }

  requestDemo(input: DemoRequestInput): Promise<{ ok: true }> {
    const message = [
      `Name: ${input.name}`,
      `Email: ${input.email}`,
      input.company ? `Company: ${input.company}` : null,
      input.role ? `Role: ${input.role}` : null,
      input.useCase ? `Use case: ${input.useCase}` : null,
    ]
      .filter((l) => l !== null)
      .join("\n");
    return this.notify("demo_request", "demo_request", message);
  }

  newsletterSignup(input: NewsletterInput): Promise<{ ok: true }> {
    return this.notify("newsletter", "newsletter_signup", `Newsletter signup: ${input.email}`);
  }
}
