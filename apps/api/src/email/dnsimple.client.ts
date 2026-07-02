import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { withRetry } from "../common/utils/retry.utils";

export type DnsimpleRecord = { id: number; name: string; type: string; content: string };

/**
 * DNSimple REST client (uprise.org.au is hosted there) — creates the CNAME
 * records SendGrid domain authentication needs, fully automating uprise-
 * subdomain sender identities. Record `name` is ZONE-RELATIVE (strip the
 * trailing `.{zone}` from SendGrid's host values before creating).
 */
@Injectable()
export class DnsimpleClient {
  constructor(private readonly config: ConfigService) {}

  private base(): { url: string; token: string; zone: string } {
    const token = this.config.get<string>("DNSIMPLE_API_TOKEN", "").trim();
    const account = this.config.get<string>("DNSIMPLE_ACCOUNT_ID", "").trim();
    const zone = this.config.get<string>("DNSIMPLE_ZONE", "uprise.org.au").trim();
    if (!token || !account) {
      throw new ServiceUnavailableException(
        "DNSimple is not configured. Set DNSIMPLE_API_TOKEN and DNSIMPLE_ACCOUNT_ID.",
      );
    }
    return { url: `https://api.dnsimple.com/v2/${account}/zones/${zone}/records`, token, zone };
  }

  isConfigured(): boolean {
    return Boolean(
      this.config.get<string>("DNSIMPLE_API_TOKEN", "").trim() &&
        this.config.get<string>("DNSIMPLE_ACCOUNT_ID", "").trim(),
    );
  }

  /** The configured zone (e.g. "uprise.org.au") — used to relativise host names. */
  zone(): string {
    return this.config.get<string>("DNSIMPLE_ZONE", "uprise.org.au").trim();
  }

  /** Strip the zone suffix from a FQDN, yielding the zone-relative record name. */
  relativise(host: string): string {
    const zone = this.zone();
    return host.endsWith(`.${zone}`) ? host.slice(0, -(zone.length + 1)) : host;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const { url, token } = this.base();
    return withRetry(
      async () => {
        const res = await fetch(`${url}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`DNSimple ${method} failed (${res.status}): ${text.slice(0, 300)}`);
        }
        return (res.status === 204 ? null : (await res.json())?.data) as T;
      },
      { retries: 2 },
    );
  }

  async findRecords(name: string, type: string): Promise<DnsimpleRecord[]> {
    const rows = await this.request<DnsimpleRecord[]>(
      "GET",
      `?name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`,
    );
    return rows ?? [];
  }

  /** Create a record; idempotent via check-then-create (safe on step retry). */
  async ensureRecord(input: { name: string; type: string; content: string; ttl?: number }): Promise<DnsimpleRecord> {
    const existing = await this.findRecords(input.name, input.type);
    const match = existing.find((r) => r.content.replace(/\.$/, "") === input.content.replace(/\.$/, ""));
    if (match) return match;
    return this.request<DnsimpleRecord>("POST", "", {
      name: input.name,
      type: input.type,
      content: input.content,
      ttl: input.ttl ?? 3600,
    });
  }

  async deleteRecord(id: number): Promise<void> {
    await this.request<null>("DELETE", `/${id}`);
  }
}
