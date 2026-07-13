import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../../app.module";
import { PrismaService } from "../../prisma/prisma.service";
import { GeoService } from "../../geo/geo.service";
import { CampaignsService } from "../../canvassing/campaigns.service";

/**
 * Fill out a tenant's campaigns to one per VIC state lower-house electorate (geo.sed_lower, 88
 * districts). Existing campaigns are matched to their district (suffix-stripped, "Hawthorne"↔
 * "Hawthorn"), re-prioritised and renamed — their boundary is LEFT ALONE so any cut turf survives.
 * Missing districts are created with the whole-electorate boundary. Every campaign ends up named
 * "<District> - VIC State Election 2026".
 *
 * Reusable across states/elections (parallels the canvass:cut-turf meshblock tool):
 *   pnpm --filter api canvass:vic-campaigns                     # dry-run, VIC, common-threads
 *   pnpm --filter api canvass:vic-campaigns --apply             # create/rename/prioritise
 *   pnpm --filter api canvass:vic-campaigns --tenant=<slug> --state="New South Wales" \
 *        --suffix=" - NSW State Election 2027" --apply
 *
 * Flags: --tenant=<slug> (default common-threads), --state=<full name> (default Victoria),
 *        --suffix=<name suffix> (default " - VIC State Election 2026"). Needs the priority migration
 *        applied first. Priority tiers below are name-matched, so they no-op for other states.
 */
const PRIORITY_1 = new Set(["Caulfield", "Hawthorn", "Kew", "Malvern", "Prahran"]);
const PRIORITY_2 = new Set(["Richmond", "Northcote", "Brunswick", "Melbourne"]);
const DEFAULT_PRIORITY = 3;
// Existing campaign base-name → district name where they differ.
const ALIAS: Record<string, string> = { Hawthorne: "Hawthorn" };

const has = (name: string) => process.argv.includes(`--${name}`);
const arg = (name: string, dflt?: string) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
};
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const priorityOf = (district: string) => (PRIORITY_1.has(district) ? 1 : PRIORITY_2.has(district) ? 2 : DEFAULT_PRIORITY);

async function main(): Promise<void> {
  const apply = has("apply");
  const tenantSlug = arg("tenant", "common-threads")!;
  const state = arg("state", "Victoria")!;
  const suffix = arg("suffix", " - VIC State Election 2026")!;
  const stripSuffix = (n: string) => n.replace(new RegExp(`\\s*${escapeRe(suffix.trim())}\\s*$`, "i"), "").trim();
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error", "warn"] });
  const prisma = app.get(PrismaService);
  const geo = app.get(GeoService);
  const campaigns = app.get(CampaignsService);
  const log = (...a: unknown[]) => console.log(...a); // eslint-disable-line no-console

  try {
    const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!tenant) throw new Error(`No tenant with slug "${tenantSlug}"`);

    const divisions = (await geo.listDivisions("sed_lower")) as Array<{ code: string; name: string; state: string }>;
    const vic = divisions.filter((d) => d.state === state).sort((a, b) => a.name.localeCompare(b.name));

    // Map existing campaigns to their district (suffix-stripped + alias).
    const existing = await prisma.canvassCampaign.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, name: true, priority: true },
    });
    const byDistrict = new Map<string, { id: string; name: string; priority: number }>();
    for (const c of existing) {
      const base = stripSuffix(c.name);
      byDistrict.set(ALIAS[base] ?? base, c);
    }

    log(`${apply ? "APPLY" : "DRY-RUN"} · tenant=${tenantSlug} · ${state} · ${vic.length} districts · ${existing.length} existing campaign(s)\n`);
    const totals = { created: 0, renamed: 0, failed: 0, byPriority: {} as Record<number, number> };

    for (const d of vic) {
      const priority = priorityOf(d.name);
      totals.byPriority[priority] = (totals.byPriority[priority] ?? 0) + 1;
      const name = `${d.name}${suffix}`;
      const current = byDistrict.get(d.name);
      const action = current ? "rename+prioritise (keep boundary)" : "create+boundary";
      if (!apply) {
        log(`  P${priority}  ${current ? "↻" : "＋"} ${name}${current ? "" : "  [sed_lower " + d.code + "]"}`);
        continue;
      }
      try {
        if (current) {
          await campaigns.update(tenant.id, current.id, { name, priority });
          totals.renamed++;
        } else {
          const c = await campaigns.create(tenant.id, { name, priority });
          await campaigns.setBoundary(tenant.id, (c as { id: string }).id, [
            { kind: "division", type: "sed_lower", code: d.code },
          ]);
          totals.created++;
        }
      } catch (error) {
        totals.failed++;
        log(`  ! ${name}: ${(error as Error).message}`);
      }
      if ((totals.created + totals.renamed + totals.failed) % 20 === 0) {
        log(`  … ${totals.created + totals.renamed}/${vic.length}`);
      }
    }

    const pr = Object.entries(totals.byPriority).map(([p, n]) => `P${p}:${n}`).join(" ");
    log(`\n${apply ? "done" : "dry-run"} — ${vic.length} districts (${pr})` +
      (apply ? `, created ${totals.created}, renamed ${totals.renamed}${totals.failed ? `, ${totals.failed} FAILED` : ""}` : ""));
  } finally {
    await app.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("canvass:vic-campaigns failed:", error); // eslint-disable-line no-console
    process.exit(1);
  });
