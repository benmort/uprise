import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { PrismaService } from "../prisma/prisma.service";
import { PRIMARY_TENANT } from "../shared-seed/tenants.seed";
import { looksLikeProduction } from "./seed-demo.guard";

/**
 * Delete the rows the browser e2e suite leaves behind in the demo tenant.
 *
 * `apps/admin/e2e/forms.spec.ts` creates a real campaign and a real shift on every run and does
 * not clean up, so the tenant accumulates "New campaign" and "E2E Campaign <stamp>" rows. They
 * are not cosmetic: the dashboard aggregates across all campaigns, so a pile of empty ones drags
 * "doors today", "turf complete" and "contact rate" to zero — which is exactly how the marketing
 * captures ended up photographing a dead-looking install.
 *
 * This only removes rows matching the e2e naming patterns, never the seeded demo fixtures.
 *
 *   npm --prefix apps/api run clear:test-residue
 *
 * Guarded like seed:clear — it deletes by name pattern, so it refuses to run against a
 * production-looking database without --force.
 */
const CAMPAIGN_PATTERNS = ["New campaign", "E2E Campaign "];
const SHIFT_PATTERN = "E2E Shift ";
const CONTENT_PATTERNS = ["E2E Disp ", "E2E Canned ", "E2E Survey ", "E2E Script ", "E2E Validation "];

async function main(): Promise<void> {
  if (looksLikeProduction(process.env) && !process.argv.includes("--force")) {
    // eslint-disable-next-line no-console
    console.error("Refusing to run against a non-local database. Re-run with --force if intended.");
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error", "warn"] });
  try {
    const prisma = app.get(PrismaService);
    /**
     * Every tenant the browser suite writes into: the primary demo tenant, plus the
     * `e2e-worker-<n>` tenants global-setup provisions for a parallel run.
     *
     * Cleaning only the primary one stopped being enough the moment those existed. The worker
     * tenants kept every campaign, shift and invitation from every parallel run, and the piled-up
     * seats eventually made invite acceptance answer 403 — which reads as a broken invite flow
     * rather than as a dirty database, and only ever in parallel runs.
     */
    const tenants = await prisma.tenant.findMany({
      where: { OR: [{ slug: PRIMARY_TENANT.slug }, { slug: { startsWith: "e2e-worker-" } }] },
      select: { id: true, slug: true },
    });
    if (tenants.length === 0) {
      // eslint-disable-next-line no-console
      console.log("Primary tenant not found — nothing to clean.");
      return;
    }

    for (const { id: tenantId, slug } of tenants) {

    const campaigns = await prisma.canvassCampaign.findMany({
      where: { tenantId, OR: CAMPAIGN_PATTERNS.map((p) => ({ name: { startsWith: p } })) },
      select: { id: true, name: true },
    });
    // Shift seats first — ShiftAssignment FKs the shift.
    const shifts = await prisma.shift.findMany({
      where: { tenantId, name: { startsWith: SHIFT_PATTERN } },
      select: { id: true },
    });
    await prisma.shiftAssignment.deleteMany({ where: { tenantId, shiftId: { in: shifts.map((s) => s.id) } } });
    const removedShifts = await prisma.shift.deleteMany({ where: { tenantId, id: { in: shifts.map((s) => s.id) } } });
    const removedCampaigns = await prisma.canvassCampaign.deleteMany({
      where: { tenantId, id: { in: campaigns.map((c) => c.id) } },
    });
    const removedDisp = await prisma.dispositionDef.deleteMany({
      where: { tenantId, label: { startsWith: "E2E Disp " } },
    });
    const removedCanned = await prisma.cannedResponse.deleteMany({
      where: { tenantId, OR: CONTENT_PATTERNS.map((p) => ({ title: { startsWith: p } })) },
    });
    const removedSurveys = await prisma.survey.deleteMany({
      where: { tenantId, OR: CONTENT_PATTERNS.map((p) => ({ name: { startsWith: p } })) },
    });
    const removedScripts = await prisma.script.deleteMany({
      where: { tenantId, OR: CONTENT_PATTERNS.map((p) => ({ name: { startsWith: p } })) },
    });

    // Invitation-journey residue. Unlike the content above this MUST be swept, not merely
    // tidied: every accepted invite consumes a team seat, and the demo tenant falls back to
    // the default Growth plan (teamMembers: 10). Left alone, the journey starts failing with
    // PLAN_LIMIT 403 after a handful of local runs — a confusing failure that looks like a
    // product bug rather than accumulated test data.
    const e2eUsers = await prisma.user.findMany({
      where: { email: { startsWith: "e2e.invite." } },
      select: { id: true },
    });
    const e2eUserIds = e2eUsers.map((u) => u.id);
    await prisma.tenantMember.deleteMany({ where: { userId: { in: e2eUserIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: e2eUserIds } } });
    await prisma.userProfile.deleteMany({ where: { userId: { in: e2eUserIds } } });
    const removedUsers = await prisma.user.deleteMany({ where: { id: { in: e2eUserIds } } });
    const removedInvites = await prisma.tenantInvitation.deleteMany({
      where: { email: { startsWith: "e2e.invite." } },
    });

    // eslint-disable-next-line no-console
    console.log(
      [
        `[${slug}]`,
        `campaigns: ${removedCampaigns.count}`,
        `shifts: ${removedShifts.count}`,
        `dispositions: ${removedDisp.count}`,
        `canned: ${removedCanned.count}`,
        `surveys: ${removedSurveys.count}`,
        `scripts: ${removedScripts.count}`,
        `e2e-invite users: ${removedUsers.count}`,
        `e2e invitations: ${removedInvites.count}`,
      ].join("  "),
    );
    }
  } finally {
    await app.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error("Residue sweep failed:", error);
    process.exit(1);
  });
