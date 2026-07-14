import "reflect-metadata";
import type { ConfigService } from "@nestjs/config";
import { SendGridProvisioningClient, type LinkBranding } from "../../email/sendgrid-provisioning.client";
import { DnsimpleClient } from "../../email/dnsimple.client";

/**
 * Rename the SendGrid **Link Branding** (click-tracking) host to `email.uprise.org.au`.
 *
 * Link branding is the account-level host every send's tracked links use — today an
 * auto-generated `url####.uprise.org.au`. This creates `email.uprise.org.au`, writes its
 * CNAMEs to DNSimple, validates, sets it as the account default, and (opt-in) removes the old
 * host. It does NOT touch the From address (`info@uprise.org.au` stays) or create a sending domain.
 *
 * Nest-free (bare clients + an env-backed ConfigService shim) so it carries no Redis/queue boot.
 * Every stage is idempotent — safe to re-run while DNS propagates to reach `validate`.
 *
 * Safety: dry-run by DEFAULT; it only mutates SendGrid/DNS when passed `--apply`. Point the env
 * at the real platform SendGrid account + the DNSimple zone deliberately.
 *
 *   pnpm --filter api email:link-branding                       # dry-run report
 *   pnpm --filter api email:link-branding -- --apply            # create + DNS + validate + default
 *   pnpm --filter api email:link-branding -- --apply --remove-old  # also delete the old url#### host
 *
 * Env: SENDGRID_API_KEY, DNSIMPLE_API_TOKEN, DNSIMPLE_ACCOUNT_ID, DNSIMPLE_ZONE (default uprise.org.au).
 * Flags: --subdomain=<name> (default "email").
 */

const APPLY = process.argv.includes("--apply");
const REMOVE_OLD = process.argv.includes("--remove-old");
const SUBDOMAIN = (process.argv.find((a) => a.startsWith("--subdomain="))?.split("=")[1] ?? "email").trim();

// eslint-disable-next-line no-console
const log = (...a: unknown[]) => console.log(...a);

/** Minimal ConfigService shim over process.env — the clients only call `.get(key, fallback)`. */
const config = {
  get: (key: string, fallback?: string) => process.env[key] ?? fallback ?? "",
} as unknown as ConfigService;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function main() {
  const sg = new SendGridProvisioningClient(config);
  const dns = new DnsimpleClient(config);
  const creds = sg.masterCreds(); // throws a clear message if SENDGRID_API_KEY is unset
  const domain = dns.zone(); // DNSIMPLE_ZONE, e.g. uprise.org.au
  const targetHost = `${SUBDOMAIN}.${domain}`;

  log(`\n${APPLY ? "APPLY" : "DRY-RUN"} · link branding → ${targetHost}\n`);
  if (!dns.isConfigured()) {
    log("⚠  DNSimple is not configured (DNSIMPLE_API_TOKEN / DNSIMPLE_ACCOUNT_ID). DNS records will be");
    log("   reported only — add them by hand, or set the vars and re-run.\n");
  }

  // 1. Inventory the current link brandings.
  const existing = await sg.listLinkBrandings(creds);
  const current = existing.find((l) => l.default);
  log(`Existing link brandings (${existing.length}):`);
  for (const l of existing) {
    log(`  · ${l.subdomain}.${l.domain}  [id ${l.id}]  ${l.valid ? "valid" : "pending"}${l.default ? " · DEFAULT" : ""}`);
  }
  log("");

  // 2. Create (or reuse) the target link branding.
  let target = existing.find((l) => l.subdomain === SUBDOMAIN && l.domain === domain) ?? null;
  if (target) {
    log(`✓ ${targetHost} already exists [id ${target.id}]`);
  } else if (APPLY) {
    target = await sg.createLinkBranding(creds, { domain, subdomain: SUBDOMAIN, default: true });
    log(`✓ created ${targetHost} [id ${target.id}]`);
  } else {
    log(`→ would create link branding ${targetHost} (POST /v3/whitelabel/links)`);
  }

  // 3. Ensure the DNS CNAMEs for the target.
  if (target) {
    log(`\nDNS records for ${targetHost}:`);
    for (const r of target.dns) {
      const name = dns.relativise(r.host);
      log(`  ${name}  ${r.type}  →  ${r.data}`);
      if (APPLY && dns.isConfigured()) {
        await dns.ensureRecord({ name, type: r.type, content: r.data });
        log(`    ✓ ensured in DNSimple`);
      } else if (!dns.isConfigured()) {
        log(`    (add this CNAME manually)`);
      } else {
        log(`    → would ensure in DNSimple`);
      }
    }
  }

  // 4. Validate (poll — DNS propagation may not be ready yet).
  if (target && APPLY) {
    log(`\nValidating ${targetHost}…`);
    let valid = target.valid;
    for (let attempt = 1; attempt <= 5 && !valid; attempt++) {
      const res = await sg.validateLinkBranding(creds, target.id);
      valid = res.valid;
      log(`  attempt ${attempt}: ${valid ? "valid ✓" : "not yet propagated"}`);
      if (!valid && attempt < 5) await sleep(10_000);
    }
    if (!valid) {
      log(`\n⚠  ${targetHost} hasn't validated yet — DNS can take up to an hour. Re-run --apply later to`);
      log(`   finish (set default) once the CNAMEs resolve. Nothing was set as default this run.`);
      return;
    }
    // 5. Make it the default.
    await sg.setDefaultLinkBranding(creds, target.id);
    log(`✓ set ${targetHost} as the account default link branding`);
  } else if (target && !APPLY) {
    log(`\n→ would validate then set ${targetHost} as default (--apply)`);
  }

  // 6. Remove the old host (opt-in, only once the target is live).
  const old = existing.filter(
    (l) => l.id !== target?.id && (l === current || /^url\d+$/i.test(l.subdomain)),
  );
  if (old.length === 0) {
    log(`\nNo old url#### link branding to remove.`);
  } else if (!REMOVE_OLD) {
    log(`\nOld link branding still present (pass --remove-old to delete once the new host is green):`);
    for (const l of old) log(`  · ${l.subdomain}.${l.domain} [id ${l.id}]`);
  } else if (APPLY) {
    for (const l of old) {
      for (const r of l.dns) {
        if (!dns.isConfigured()) continue;
        const name = dns.relativise(r.host);
        const found = await dns.findRecords(name, r.type);
        for (const rec of found) {
          await dns.deleteRecord(rec.id);
          log(`  ✓ deleted DNS ${name} ${r.type} [${rec.id}]`);
        }
      }
      await sg.deleteLinkBranding(creds, l.id);
      log(`  ✓ deleted link branding ${l.subdomain}.${l.domain} [id ${l.id}]`);
    }
  } else {
    for (const l of old) log(`→ would delete old link branding ${l.subdomain}.${l.domain} [id ${l.id}] + its CNAMEs`);
  }

  log(`\nDone.${APPLY ? "" : " (dry-run — nothing changed; re-run with --apply)"}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("\n✗ link-branding setup failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
