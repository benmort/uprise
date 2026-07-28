import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { createHash } from "node:crypto";
import { AppModule } from "../../app.module";
import { PrismaService } from "../../prisma/prisma.service";
import { CredentialCryptoService } from "../../integrations/credential-crypto.service";

/**
 * Audit (and optionally quarantine) IntegrationConnection rows that were auto-created
 * from a platform-wide env key.
 *
 * IntegrationsService.ensureConnection() used to lazily create a connection for any
 * tenant, seeded from ACTION_NETWORK_API_KEY / INTERNAL_SOURCE_API_KEY. Every tenant that
 * opened the audience page was therefore wired to whichever organisation's key was in env,
 * and anything it imported through that connection is that organisation's data sitting in
 * the wrong tenant. The service no longer does this; this script finds what it already did.
 *
 * Credentials are AES-256-GCM encrypted, so the match cannot be done in SQL — each row is
 * decrypted in-process and compared. Nothing is ever printed in the clear: identification
 * is by a short sha256 prefix only.
 *
 *   pnpm --filter api integrations:audit-connections
 *   pnpm --filter api integrations:audit-connections -- --apply --keep-tenant=common-threads
 *
 * Dry-run by default. --apply deactivates the matching connections and archives the
 * audiences they produced, except in tenants named by --keep-tenant (repeatable, matches
 * on slug). Canonical Contact rows are never deleted — that has consent and blast
 * side-effects — so the report gives the counts and purging stays a separate decision.
 */

type Args = { apply: boolean; keepTenants: string[] };

function parseArgs(argv: string[]): Args {
  const keepTenants: string[] = [];
  let apply = false;
  for (const raw of argv) {
    if (raw === "--apply") apply = true;
    else if (raw.startsWith("--keep-tenant=")) {
      const slug = raw.slice("--keep-tenant=".length).trim();
      if (slug) keepTenants.push(slug);
    }
  }
  return { apply, keepTenants };
}

/** Short, non-reversible label for a secret, so two values can be compared in a log. */
function fingerprint(secret: string): string {
  return createHash("sha256").update(secret).digest("hex").slice(0, 12);
}

const SOURCE_SYSTEM_FOR: Record<string, string> = {
  ACTION_NETWORK: "action_network",
  INTERNAL: "internal_source",
};

async function main(): Promise<void> {
  const { apply, keepTenants } = parseArgs(process.argv.slice(2));
  const log = (...parts: unknown[]) => console.log(...parts); // eslint-disable-line no-console

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error", "warn"] });
  try {
    const prisma = app.get(PrismaService);
    const crypto = app.get(CredentialCryptoService);

    const envKeys = new Map<string, string>();
    for (const [type, envVar] of [
      ["ACTION_NETWORK", "ACTION_NETWORK_API_KEY"],
      ["INTERNAL", "INTERNAL_SOURCE_API_KEY"],
    ] as const) {
      const value = (process.env[envVar] || "").trim();
      if (value) envKeys.set(type, value);
    }

    if (envKeys.size === 0) {
      log("No platform integration keys in env — nothing to match against.");
      log("If the keys have already been removed, run this against an environment that");
      log("still has them, or re-supply them for the duration of the audit.");
      return;
    }
    for (const [type, key] of envKeys) {
      log(`env ${type}: sha256:${fingerprint(key)}`);
    }

    const connections = await prisma.integrationConnection.findMany({
      orderBy: [{ tenantId: "asc" }, { type: "asc" }],
      include: { tenant: { select: { slug: true, name: true } } },
    });
    log(`\nScanning ${connections.length} connection(s)…\n`);

    let matched = 0;
    let quarantinedConnections = 0;
    let archivedAudiences = 0;

    for (const conn of connections) {
      const envKey = envKeys.get(conn.type);
      let decrypted = "";
      try {
        decrypted = crypto.decrypt(conn.encryptedCredential);
      } catch {
        log(`? ${conn.tenant.slug} / ${conn.type} — credential could not be decrypted, skipping`);
        continue;
      }
      const isEnvSeeded = Boolean(envKey) && decrypted === envKey;
      if (!isEnvSeeded) continue;
      matched += 1;

      const kept = keepTenants.includes(conn.tenant.slug);
      const sourceSystem = SOURCE_SYSTEM_FOR[conn.type];
      const [syncJobs, audiences, sourceRecords] = await Promise.all([
        prisma.integrationSyncJob.count({ where: { integrationConnectionId: conn.id } }),
        prisma.audience.findMany({
          where: {
            tenantId: conn.tenantId,
            source: conn.type === "ACTION_NETWORK" ? "ACTION_NETWORK" : "INTERNAL",
          },
          select: { id: true, name: true, status: true, _count: { select: { contacts: true } } },
        }),
        prisma.contactSourceRecord.count({ where: { tenantId: conn.tenantId, sourceSystem } }),
      ]);
      const importedContacts = audiences.reduce((sum, a) => sum + a._count.contacts, 0);

      log(
        `! ${conn.tenant.slug} (${conn.tenant.name}) / ${conn.type}` +
          `${kept ? "  [kept]" : ""}\n` +
          `    connection ${conn.id}  status=${conn.status}  created=${conn.createdAt.toISOString()}\n` +
          `    credential sha256:${fingerprint(decrypted)} — matches the platform env key\n` +
          `    ${syncJobs} sync job(s), ${audiences.length} audience(s), ` +
          `${importedContacts} audience contact(s), ${sourceRecords} source record(s)`,
      );
      for (const a of audiences) {
        log(`      – ${a.status.padEnd(8)} ${a._count.contacts.toString().padStart(6)}  ${a.name}`);
      }

      if (!apply || kept) continue;

      await prisma.integrationConnection.update({
        where: { id: conn.id },
        data: { status: "INACTIVE" },
      });
      quarantinedConnections += 1;
      const archived = await prisma.audience.updateMany({
        where: {
          tenantId: conn.tenantId,
          source: conn.type === "ACTION_NETWORK" ? "ACTION_NETWORK" : "INTERNAL",
          status: "ACTIVE",
        },
        data: { status: "ARCHIVED", archivedAt: new Date() },
      });
      archivedAudiences += archived.count;
      log(`    → deactivated the connection and archived ${archived.count} audience(s)`);
    }

    log(
      `\n${matched} of ${connections.length} connection(s) were seeded from a platform env key.`,
    );
    if (apply) {
      log(
        `Applied: ${quarantinedConnections} connection(s) deactivated, ` +
          `${archivedAudiences} audience(s) archived.`,
      );
      log("Canonical Contact rows were left in place — decide on those separately.");
    } else if (matched > 0) {
      log("Dry run — nothing changed. Re-run with --apply to deactivate and archive.");
    }
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err); // eslint-disable-line no-console
  process.exit(1);
});
