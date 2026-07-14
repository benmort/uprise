import { randomBytes } from "crypto";
import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { withRetry } from "../common/utils/retry.utils";

/** Credentials for a provisioning call: the platform master key (optionally
 *  acting on behalf of a subuser) or a tenant's BYO key. */
export type SendGridCreds = { apiKey: string; onBehalfOf?: string };

export type DomainAuthDnsRecord = { record: string; host: string; type: string; data: string; valid: boolean };

export type DomainAuthResult = {
  sendgridDomainId: string;
  domain: string;
  dns: DomainAuthDnsRecord[];
};

/** A SendGrid Link Branding (click-tracking) entry — the account-level branded-links host. */
export type LinkBranding = {
  id: string;
  domain: string;
  subdomain: string;
  valid: boolean;
  default: boolean;
  dns: DomainAuthDnsRecord[];
};

const BASE = "https://api.sendgrid.com";

/** SendGrid's domain-auth `dns` ships as an object keyed by record name, but
 *  some API versions return an array — normalise both defensively. */
function normaliseDns(
  dns: unknown,
): DomainAuthDnsRecord[] {
  const entries: Array<[string, { host?: string; type?: string; data?: string; valid?: boolean }]> =
    Array.isArray(dns)
      ? dns.map((r, i) => [String((r as { record?: string })?.record ?? i), r ?? {}])
      : Object.entries((dns ?? {}) as Record<string, { host?: string; type?: string; data?: string; valid?: boolean }>);
  return entries.map(([record, r]) => ({
    record,
    host: String(r?.host ?? ""),
    type: String(r?.type ?? "cname").toUpperCase(),
    data: String(r?.data ?? ""),
    valid: Boolean(r?.valid),
  }));
}

/**
 * SendGrid provisioning surface for per-tenant email identities: subusers,
 * on-behalf-of API keys, domain authentication + validation, per-subuser event
 * webhooks. Mirrors TwilioProvisioningClient (fetch + withRetry, explicit creds
 * per call, ServiceUnavailable when unconfigured).
 */
@Injectable()
export class SendGridProvisioningClient {
  constructor(private readonly config: ConfigService) {}

  masterCreds(): SendGridCreds {
    const apiKey = this.config.get<string>("SENDGRID_API_KEY", "").trim();
    if (!apiKey) throw new ServiceUnavailableException("SENDGRID_API_KEY is not configured");
    return { apiKey };
  }

  private async request<T>(
    creds: SendGridCreds,
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    return withRetry(
      async () => {
        const res = await fetch(`${BASE}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${creds.apiKey}`,
            "Content-Type": "application/json",
            ...(creds.onBehalfOf ? { "on-behalf-of": creds.onBehalfOf } : {}),
          },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`SendGrid ${method} ${path} failed (${res.status}): ${text.slice(0, 300)}`);
        }
        if (res.status === 204) return null as T;
        return (await res.json()) as T;
      },
      { retries: 2 },
    );
  }

  /** IPs on the master account — subuser creation requires at least one. */
  async listIps(creds: SendGridCreds): Promise<string[]> {
    const rows = await this.request<Array<{ ip: string }>>(creds, "GET", "/v3/ips");
    return (rows ?? []).map((r) => r.ip);
  }

  async findSubuser(creds: SendGridCreds, username: string): Promise<boolean> {
    const rows = await this.request<Array<{ username: string }>>(
      creds,
      "GET",
      `/v3/subusers?username=${encodeURIComponent(username)}`,
    );
    return (rows ?? []).some((r) => r.username === username);
  }

  /** Create a subuser (idempotent: reuses an existing username on retry). The
   *  password is random and discarded — all access is via the API key. */
  async createSubuser(creds: SendGridCreds, input: { username: string; email: string; ips: string[] }): Promise<void> {
    try {
      if (await this.findSubuser(creds, input.username)) return;
      await this.request(creds, "POST", "/v3/subusers", {
        username: input.username,
        email: input.email,
        password: `Up!${randomBytes(24).toString("base64url")}`,
        ips: input.ips,
      });
    } catch (err) {
      // Free-tier accounts 403 the subusers API — surface the real remedy on the
      // run's timeline instead of a bare permission error.
      if (String(err).includes("(403)") || String(err).toLowerCase().includes("permission")) {
        throw new Error(
          "SendGrid plan does not support subusers — upgrade the platform account to Pro (or use a BYO tenant account)",
        );
      }
      throw err;
    }
  }

  /** API key scoped to sending, created ON BEHALF OF the subuser. */
  async createSubuserApiKey(creds: SendGridCreds, subuser: string, name: string): Promise<string> {
    const created = await this.request<{ api_key?: string }>(
      { ...creds, onBehalfOf: subuser },
      "POST",
      "/v3/api_keys",
      { name, scopes: ["mail.send"] },
    );
    if (!created?.api_key) throw new Error("SendGrid did not return an api_key for the subuser");
    return created.api_key;
  }

  /** Create domain authentication (automatic security = CNAME/DKIM records). */
  async createDomainAuth(creds: SendGridCreds, domain: string): Promise<DomainAuthResult> {
    const created = await this.request<{
      id: number | string;
      domain: string;
      subdomain?: string;
      dns?: Record<string, { host?: string; type?: string; data?: string; valid?: boolean }>;
    }>(creds, "POST", "/v3/whitelabel/domains", {
      domain,
      automatic_security: true,
      default: false,
    });
    return {
      sendgridDomainId: String(created.id),
      domain: created.domain,
      dns: normaliseDns(created.dns),
    };
  }

  async getDomainAuth(creds: SendGridCreds, sendgridDomainId: string): Promise<DomainAuthResult> {
    const row = await this.request<{
      id: number | string;
      domain: string;
      dns?: Record<string, { host?: string; type?: string; data?: string; valid?: boolean }>;
    }>(creds, "GET", `/v3/whitelabel/domains/${sendgridDomainId}`);
    return {
      sendgridDomainId: String(row.id),
      domain: row.domain,
      dns: normaliseDns(row.dns),
    };
  }

  /** Associate an authenticated domain with a subuser. */
  async assignDomainToSubuser(creds: SendGridCreds, sendgridDomainId: string, username: string): Promise<void> {
    await this.request(creds, "POST", `/v3/whitelabel/domains/${sendgridDomainId}/subuser`, { username });
  }

  async validateDomain(
    creds: SendGridCreds,
    sendgridDomainId: string,
  ): Promise<{ valid: boolean; results: Record<string, unknown> }> {
    const res = await this.request<{ valid?: boolean; validation_results?: Record<string, unknown> }>(
      creds,
      "POST",
      `/v3/whitelabel/domains/${sendgridDomainId}/validate`,
    );
    return { valid: Boolean(res?.valid), results: res?.validation_results ?? {} };
  }

  /** Point the (sub)account's event webhook at our handler. */
  async configureEventWebhook(creds: SendGridCreds, url: string): Promise<void> {
    await this.request(creds, "PATCH", "/v3/user/webhooks/event/settings", {
      enabled: true,
      url,
      delivered: true,
      bounce: true,
      dropped: true,
      open: true,
      click: true,
      processed: false,
      deferred: false,
      spam_report: true,
      unsubscribe: true,
      group_resubscribe: false,
      group_unsubscribe: false,
    });
  }

  /** Enable the signed event webhook; returns the verification public key. */
  async enableSignedWebhook(creds: SendGridCreds): Promise<string> {
    const res = await this.request<{ public_key?: string }>(
      creds,
      "PATCH",
      "/v3/user/webhooks/event/settings/signed",
      { enabled: true },
    );
    if (!res?.public_key) throw new Error("SendGrid did not return the signed-webhook public key");
    return res.public_key;
  }

  async deleteSubuser(creds: SendGridCreds, username: string): Promise<void> {
    await this.request(creds, "DELETE", `/v3/subusers/${encodeURIComponent(username)}`);
  }

  async deleteDomainAuth(creds: SendGridCreds, sendgridDomainId: string): Promise<void> {
    await this.request(creds, "DELETE", `/v3/whitelabel/domains/${sendgridDomainId}`);
  }

  // ── Link Branding (click-tracking host, e.g. email.uprise.org.au) ──────────
  // Account-level, not per-tenant: the branded host every send's tracked links use.
  // `dns` ships keyed `domain_cname` / `owner_cname`; normaliseDns handles the object.

  private toLinkBranding(row: {
    id: number | string;
    domain: string;
    subdomain?: string;
    valid?: boolean;
    default?: boolean;
    dns?: unknown;
  }): LinkBranding {
    return {
      id: String(row.id),
      domain: row.domain,
      subdomain: String(row.subdomain ?? ""),
      valid: Boolean(row.valid),
      default: Boolean(row.default),
      dns: normaliseDns(row.dns),
    };
  }

  async listLinkBrandings(creds: SendGridCreds): Promise<LinkBranding[]> {
    const rows = await this.request<Array<Parameters<typeof this.toLinkBranding>[0]>>(
      creds,
      "GET",
      "/v3/whitelabel/links",
    );
    return (rows ?? []).map((r) => this.toLinkBranding(r));
  }

  /** Create a branded link host `${subdomain}.${domain}` (automatic security = managed CNAMEs). */
  async createLinkBranding(
    creds: SendGridCreds,
    input: { domain: string; subdomain: string; default?: boolean },
  ): Promise<LinkBranding> {
    const created = await this.request<Parameters<typeof this.toLinkBranding>[0]>(
      creds,
      "POST",
      "/v3/whitelabel/links",
      { domain: input.domain, subdomain: input.subdomain, default: input.default ?? true, automatic_security: true },
    );
    return this.toLinkBranding(created);
  }

  async validateLinkBranding(
    creds: SendGridCreds,
    id: string,
  ): Promise<{ valid: boolean; results: Record<string, unknown> }> {
    const res = await this.request<{ valid?: boolean; validation_results?: Record<string, unknown> }>(
      creds,
      "POST",
      `/v3/whitelabel/links/${id}/validate`,
    );
    return { valid: Boolean(res?.valid), results: res?.validation_results ?? {} };
  }

  /** Make this link branding the account default (so all sends' tracked links use it). */
  async setDefaultLinkBranding(creds: SendGridCreds, id: string): Promise<void> {
    await this.request(creds, "PATCH", `/v3/whitelabel/links/${id}`, { default: true });
  }

  async deleteLinkBranding(creds: SendGridCreds, id: string): Promise<void> {
    await this.request(creds, "DELETE", `/v3/whitelabel/links/${id}`);
  }
}
