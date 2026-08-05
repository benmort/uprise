import { PrismaClient } from "@uprise/db";

/**
 * Brand the Climate 200 client tenants with their politician's headshot: each campaign
 * tenant's OrgProfile.logoBlockUrl gets the civic-mirrored photo (already re-hosted in
 * our Blob store with licence + credit by civic:images), so the switcher, select-tenant
 * list and field brand marks show the member's face instead of a gradient.
 *
 * Standalone + idempotent, dry-run by default (--apply to write). Reads only rows that
 * already exist in THIS database, so the same command is correct for dev and prod.
 * Politicians without a mirrored photo (e.g. senators — deferred by the photo sync) are
 * reported and skipped, never a failure. The hub tenant's Climate 200 logo is seeded by
 * `seed:org-logos` (repo asset), not here.
 *
 * Run: `pnpm --filter api seed:climate-200-branding [--apply]`
 */

const TENANT_POLITICIANS: Array<{ slug: string; politician: string }> = [
  { slug: "david-pocock", politician: "David Pocock" },
  { slug: "nicolette-boele", politician: "Nicolette Boele" },
  { slug: "kate-chaney", politician: "Kate Chaney" },
  { slug: "helen-haines", politician: "Helen Haines" },
  { slug: "monique-ryan", politician: "Monique Ryan" },
  { slug: "sophie-scamps", politician: "Sophie Scamps" },
  { slug: "rebekha-sharkie", politician: "Rebekha Sharkie" },
  { slug: "allegra-spender", politician: "Allegra Spender" },
  { slug: "zali-steggall", politician: "Zali Steggall" },
  { slug: "andrew-wilkie", politician: "Andrew Wilkie" },
  { slug: "alex-greenwich", politician: "Alex Greenwich" },
  { slug: "jacqui-scruby", politician: "Jacqui Scruby" },
  { slug: "peter-george", politician: "Peter George" },
  { slug: "clare-glade-wright", politician: "Clare Glade-Wright" },
];

type Db = PrismaClient;

/** Exact-insensitive first, then all-name-tokens contains (civic names may carry honorifics). */
async function findPolitician(prisma: Db, name: string) {
  const exact = await prisma.politician.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
    select: { id: true, name: true, imageUrl: true },
    orderBy: { imageUrl: "desc" },
  });
  if (exact) return exact;
  const tokens = name.split(/\s+/);
  return prisma.politician.findFirst({
    where: { AND: tokens.map((t) => ({ name: { contains: t, mode: "insensitive" as const } })) },
    select: { id: true, name: true, imageUrl: true },
    orderBy: { imageUrl: "desc" },
  });
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const prisma = new PrismaClient();
  try {
    const dbHost = (process.env.DATABASE_URL ?? "").split("@")[1]?.split("/")[0] ?? "(unknown)";
    console.log(`seed:climate-200-branding target=${dbHost} mode=${apply ? "APPLY" : "DRY-RUN"}`);

    const summary = { set: 0, alreadySet: 0, noPhoto: 0, missing: 0 };
    for (const entry of TENANT_POLITICIANS) {
      const tenant = await prisma.tenant.findUnique({ where: { slug: entry.slug } });
      if (!tenant || tenant.deletedAt) {
        console.warn(`  ✗ ${entry.slug}: tenant missing — run seed:climate-200 first`);
        summary.missing += 1;
        continue;
      }
      const politician = await findPolitician(prisma, entry.politician);
      if (!politician?.imageUrl) {
        console.warn(
          `  – ${entry.slug}: no mirrored photo for "${politician?.name ?? entry.politician}" ` +
            `(senators/state gaps are expected) — skipped`,
        );
        summary.noPhoto += 1;
        continue;
      }
      const existing = await prisma.orgProfile.findFirst({ where: { tenantId: tenant.id } });
      if (existing?.logoBlockUrl === politician.imageUrl) {
        summary.alreadySet += 1;
        continue;
      }
      if (apply) {
        if (existing) {
          await prisma.orgProfile.update({
            where: { id: existing.id },
            data: { logoBlockUrl: politician.imageUrl },
          });
        } else {
          await prisma.orgProfile.create({
            data: { tenantId: tenant.id, name: tenant.name, logoBlockUrl: politician.imageUrl },
          });
        }
      }
      console.log(`  ✓ ${entry.slug}: ${politician.name} → ${politician.imageUrl.slice(0, 80)}…`);
      summary.set += 1;
    }
    console.log(
      `seed:climate-200-branding ${apply ? "done" : "dry-run"} — ` +
        `set=${summary.set} alreadySet=${summary.alreadySet} noPhoto=${summary.noPhoto} missingTenant=${summary.missing}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  console.error("seed:climate-200-branding failed:", error);
  process.exit(1);
});
