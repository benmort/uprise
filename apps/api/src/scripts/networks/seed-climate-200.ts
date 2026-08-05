import { PrismaClient } from "@uprise/db";

/**
 * Seed the Climate 200 network: the Network row (Scale plan – unlocks the tenant
 * switcher + multi-brand for its members), one client tenant per parliamentarian,
 * the existing `climate-200` tenant attached as the hub, and OWNER memberships for
 * the starting admin user across all of them.
 *
 * Standalone on purpose (no Nest boot – mirrors sync-plans-standalone.ts) so it runs
 * identically against dev and production. Idempotent: re-running upserts and reports.
 * DRY-RUN by default; pass --apply to write. Outbox rows ride the same transaction
 * (house rule: state writes that matter emit their domain event atomically).
 *
 * Run: `pnpm --filter api seed:climate-200 [--apply]`
 * Prod: DATABASE_URL=<unpooled prod url> npx ts-node src/scripts/networks/seed-climate-200.ts --apply
 */

const NETWORK_NAME = "Climate 200";
const NETWORK_PLAN = "scale";
const ADMIN_EMAIL = "contact@upriselabs.org";
const HUB_SLUG = "climate-200";

/** Name – Electorate (en-dash, honorifics dropped); slug = kebab name. */
const CLIENT_TENANTS: Array<{ slug: string; name: string }> = [
  // Federal (10)
  { slug: "david-pocock", name: "David Pocock – ACT" },
  { slug: "nicolette-boele", name: "Nicolette Boele – Bradfield" },
  { slug: "kate-chaney", name: "Kate Chaney – Curtin" },
  { slug: "helen-haines", name: "Helen Haines – Indi" },
  { slug: "monique-ryan", name: "Monique Ryan – Kooyong" },
  { slug: "sophie-scamps", name: "Sophie Scamps – Mackellar" },
  { slug: "rebekha-sharkie", name: "Rebekha Sharkie – Mayo" },
  { slug: "allegra-spender", name: "Allegra Spender – Wentworth" },
  { slug: "zali-steggall", name: "Zali Steggall – Warringah" },
  { slug: "andrew-wilkie", name: "Andrew Wilkie – Clark" },
  // State (4)
  { slug: "alex-greenwich", name: "Alex Greenwich – Sydney" },
  { slug: "jacqui-scruby", name: "Jacqui Scruby – Pittwater" },
  { slug: "peter-george", name: "Peter George – Franklin" },
  { slug: "clare-glade-wright", name: "Clare Glade-Wright – Huon" },
];

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const prisma = new PrismaClient();
  try {
    const dbHost = (process.env.DATABASE_URL ?? "").split("@")[1]?.split("/")[0] ?? "(unknown)";
    console.log(`seed:climate-200 target=${dbHost} mode=${apply ? "APPLY" : "DRY-RUN"}`);

    const hub = await prisma.tenant.findUnique({ where: { slug: HUB_SLUG } });
    if (!hub || hub.deletedAt) {
      throw new Error(`Hub tenant "${HUB_SLUG}" is missing (or deleted) in this database — refusing to continue.`);
    }
    const existingUser = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
    const existingNetwork = await prisma.network.findFirst({ where: { name: NETWORK_NAME } });
    const existingSlugs = new Set(
      (
        await prisma.tenant.findMany({
          where: { slug: { in: CLIENT_TENANTS.map((t) => t.slug) } },
          select: { slug: true },
        })
      ).map((t) => t.slug),
    );

    console.log(
      `plan: user ${existingUser ? "exists" : "CREATE"}; network ${existingNetwork ? "exists" : "CREATE"}; ` +
        `tenants create=${CLIENT_TENANTS.length - existingSlugs.size} update=${existingSlugs.size} + hub attach; ` +
        `memberships upsert=${CLIENT_TENANTS.length + 1}`,
    );
    if (!apply) {
      console.log("dry-run only — re-run with --apply to write.");
      return;
    }

    const summary = await prisma.$transaction(
      async (tx) => {
        const user =
          (await tx.user.findUnique({ where: { email: ADMIN_EMAIL } })) ??
          (await tx.user.create({
            data: { email: ADMIN_EMAIL, displayName: "Uprise Labs", emailVerified: true },
          }));

        let network = await tx.network.findFirst({ where: { name: NETWORK_NAME } });
        let networkCreated = false;
        if (!network) {
          network = await tx.network.create({
            data: {
              name: NETWORK_NAME,
              ownerId: user.id,
              planName: NETWORK_PLAN,
              subscriptionStatus: "active",
              hubTenantId: hub.id,
            },
          });
          networkCreated = true;
          await tx.outboxEvent.create({
            data: {
              tenantId: network.id, // no tenant yet; the network id is the aggregate scope
              eventType: "tenant.network.created",
              aggregateId: network.id,
              payload: { networkId: network.id, name: network.name },
              metadata: {},
            },
          });
        } else if (network.planName !== NETWORK_PLAN || network.hubTenantId !== hub.id) {
          network = await tx.network.update({
            where: { id: network.id },
            data: { planName: NETWORK_PLAN, hubTenantId: hub.id },
          });
        }

        await tx.tenant.update({ where: { id: hub.id }, data: { networkId: network.id } });

        let tenantsCreated = 0;
        const tenantIds: string[] = [hub.id];
        for (const t of CLIENT_TENANTS) {
          const existing = await tx.tenant.findUnique({ where: { slug: t.slug } });
          if (existing) {
            await tx.tenant.update({
              where: { id: existing.id },
              data: { networkId: network.id, name: t.name },
            });
            tenantIds.push(existing.id);
            continue;
          }
          const created = await tx.tenant.create({
            data: { slug: t.slug, name: t.name, networkId: network.id },
          });
          tenantsCreated += 1;
          tenantIds.push(created.id);
          await tx.outboxEvent.create({
            data: {
              tenantId: created.id,
              eventType: "tenant.tenant.created",
              aggregateId: created.id,
              payload: { tenantId: created.id, slug: t.slug, name: t.name, networkId: network.id },
              metadata: {},
            },
          });
        }

        let membershipsCreated = 0;
        for (const tenantId of tenantIds) {
          const existing = await tx.tenantMember.findUnique({
            where: { tenantId_userId: { tenantId, userId: user.id } },
          });
          if (existing) continue;
          await tx.tenantMember.create({
            data: { tenantId, userId: user.id, role: "OWNER", addedBy: user.id },
          });
          membershipsCreated += 1;
          await tx.outboxEvent.create({
            data: {
              tenantId,
              eventType: "tenant.member.added",
              aggregateId: user.id,
              payload: { tenantId, userId: user.id, role: "OWNER" },
              metadata: {},
            },
          });
        }

        return { networkId: network.id, networkCreated, tenantsCreated, membershipsCreated };
      },
      { maxWait: 15_000, timeout: 180_000 },
    );

    console.log(
      `seed:climate-200 done — network=${summary.networkId}${summary.networkCreated ? " (created)" : ""} ` +
        `tenantsCreated=${summary.tenantsCreated} membershipsCreated=${summary.membershipsCreated}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  console.error("seed:climate-200 failed:", error);
  process.exit(1);
});
