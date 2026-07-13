import "reflect-metadata";
import { readFile, access } from "node:fs/promises";
import { resolve } from "node:path";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../../app.module";
import { PrismaService } from "../../prisma/prisma.service";
import { ImageUploadService } from "../../common/storage/image-upload.service";

/**
 * Seed the production-kept tenants' real logos onto `OrgProfile` (the brand the switcher, auth
 * volunteer flow, field PWA and public insights all render). Idempotent: keys are stable
 * (`org-logos/<tenantId>.<ext>`) and overwritten in place, and the OrgProfile row is upserted.
 *
 * Sources, in priority order per tenant:
 *   1. `localFile`   — a repo asset (licence-clean, no fetch). getup + climate-200 ship one.
 *   2. convention    — `apps/api/src/scripts/civic/org-logos/<slug>.{png,svg,jpg,jpeg,webp}`
 *                      (drop a verified WHITE-BACKGROUND-LEGIBLE mark here before the run).
 *   3. `remoteUrl`   — mirrored via ImageUploadService (respect robots; no UA spoofing).
 * A tenant with no resolvable source is SKIPPED with a warning — never a hard failure.
 *
 * Needs BLOB_READ_WRITE_TOKEN + DATABASE_URL. Run: `pnpm --filter api seed:org-logos`.
 * Dev writes under the `development/` blob prefix; prod runs with NODE_ENV=production.
 */

// apps/api/src/scripts/civic -> repo root is four levels up.
const REPO = resolve(__dirname, "../../../../..");
const CONVENTION_DIR = resolve(__dirname, "org-logos");
const EXTS = ["png", "svg", "jpg", "jpeg", "webp"] as const;

/** Which brand slot the asset fills. The other slot is left untouched so the landscape→block
 *  resolver (`logoLandscapeUrl ?? logoBlockUrl`) still works when only one shape is seeded. */
type Kind = "landscape" | "block";

type LogoSource = {
  slug: string;
  kind: Kind;
  localFile?: string; // repo-relative
  remoteUrl?: string;
};

const SOURCES: LogoSource[] = [
  // Repo assets, each verified legible on white (navy/orange/teal marks, not white-on-transparent).
  { slug: "getup", kind: "landscape", localFile: "apps/product-marketing/public/images/logos/getup.png" },
  { slug: "climate-200", kind: "landscape", localFile: "apps/product-marketing/public/images/logos/climate-200.png" },
  { slug: "common-threads", kind: "landscape", localFile: "apps/product-marketing/public/images/logos/common-threads.webp" },
  { slug: "uprise-labs", kind: "block", localFile: "apps/organisation-marketing/public/labs-icon.svg" },
  // The product-marketing australian-progress.webp is the WHITE (dark-bg) variant — invisible on
  // white — so it's sourced fresh (colour mark) into the convention dir instead.
  { slug: "australian-progress", kind: "landscape" },
  { slug: "democracy-in-colour", kind: "landscape" },
  { slug: "victoria-trades-hall", kind: "landscape" },
  { slug: "gellung-warl", kind: "landscape" },
];

const CONTENT_TYPE: Record<string, string> = {
  png: "image/png",
  svg: "image/svg+xml",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** First convention-dir file that exists for a slug, or null. */
async function conventionFile(slug: string): Promise<string | null> {
  for (const ext of EXTS) {
    const path = resolve(CONVENTION_DIR, `${slug}.${ext}`);
    if (await exists(path)) return path;
  }
  return null;
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error", "warn", "log"] });
  const prisma = app.get(PrismaService);
  const images = app.get(ImageUploadService);
  if (!images.enabled) {
    // eslint-disable-next-line no-console
    console.error("seed:org-logos: image storage not configured (BLOB_READ_WRITE_TOKEN / BLOB_STORE_ID)");
    await app.close();
    process.exit(1);
  }

  const summary = { set: 0, skipped: 0, missingTenant: 0 };
  try {
    for (const src of SOURCES) {
      const tenant = await prisma.tenant.findUnique({ where: { slug: src.slug } });
      if (!tenant) {
        // eslint-disable-next-line no-console
        console.warn(`  · ${src.slug}: no such tenant — skipped`);
        summary.missingTenant++;
        continue;
      }

      // Resolve bytes → a Blob URL. Local/convention files are read + put; a remoteUrl is mirrored.
      const localPath = src.localFile
        ? resolve(REPO, src.localFile)
        : await conventionFile(src.slug);

      let url: string | null = null;
      if (localPath && (await exists(localPath))) {
        const ext = images.extFrom(localPath, "png");
        const buffer = await readFile(localPath);
        const out = await images.put(buffer, {
          key: `org-logos/${tenant.id}.${ext}`,
          contentType: CONTENT_TYPE[ext] ?? "application/octet-stream",
          allowOverwrite: true,
        });
        url = out.url;
      } else if (src.remoteUrl) {
        const ext = images.extFrom(src.remoteUrl, "png");
        const out = await images.mirror(src.remoteUrl, {
          key: `org-logos/${tenant.id}.${ext}`,
          allowOverwrite: true,
        });
        url = out?.url ?? null;
      }

      if (!url) {
        // eslint-disable-next-line no-console
        console.warn(`  · ${src.slug}: no logo source (add ${src.slug}.png under org-logos/, or a remoteUrl) — skipped`);
        summary.skipped++;
        continue;
      }

      // Set the slot matching the asset's shape; upsert the tenantId-keyed OrgProfile (no @@unique).
      const column = src.kind === "landscape" ? { logoLandscapeUrl: url } : { logoBlockUrl: url };
      const existing = await prisma.orgProfile.findFirst({ where: { tenantId: tenant.id } });
      if (existing) {
        await prisma.orgProfile.update({ where: { id: existing.id }, data: column });
      } else {
        await prisma.orgProfile.create({ data: { tenantId: tenant.id, name: tenant.name, ...column } });
      }
      // eslint-disable-next-line no-console
      console.log(`  ✓ ${src.slug}: ${src.kind} logo → ${url}`);
      summary.set++;
    }
    // eslint-disable-next-line no-console
    console.log("seed:org-logos done —", JSON.stringify(summary));
  } finally {
    await app.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("seed:org-logos failed:", error); // eslint-disable-line no-console
    process.exit(1);
  });
