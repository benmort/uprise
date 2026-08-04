import "reflect-metadata";
import { readFileSync } from "node:fs";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../../app.module";
import { PrismaService } from "../../prisma/prisma.service";
import { parseCsv } from "../demographics/abs-parse";

/**
 * Backfill electorate-office phone numbers onto civic.Politician from a curated
 * CSV — the autodialer's electoral targeting dials these. Sourcing the
 * authoritative dataset (APH / state parliament contact lists) is an open
 * decision; this script is the idempotent loader for whatever CSV is curated.
 *
 * CSV (header row, case-insensitive): `phone` plus `electorate` and/or `name`;
 * optional `jurisdiction` (default FEDERAL, or --jurisdiction). Matching is by
 * electorate name first (unique per jurisdiction+chamber), then exact member
 * name. Numbers are normalised to E.164 (+61…); mobiles are accepted (targets
 * are dialled, not used as caller ID).
 *
 * Run: `pnpm --filter api civic:phones -- --file phones.csv [--source aph_csv] [--jurisdiction FEDERAL] [--dry-run]`
 */

type Args = { file: string; source: string; jurisdiction: string; dryRun: boolean };

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const idx = argv.indexOf(flag);
    return idx >= 0 ? argv[idx + 1] : undefined;
  };
  const file = get("--file");
  if (!file) {
    console.error("Usage: civic:phones -- --file <csv> [--source aph_csv|parliament_site|manual] [--jurisdiction FEDERAL] [--dry-run]"); // eslint-disable-line no-console
    process.exit(2);
  }
  return {
    file,
    source: get("--source") ?? "manual",
    jurisdiction: get("--jurisdiction") ?? "FEDERAL",
    dryRun: argv.includes("--dry-run"),
  };
}

/** "02 6277 4022" / "(03) 9123 4567" / "0400 000 000" → +61… (null if not an AU number). */
export function normaliseAuPhone(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, "");
  const e164 = digits.startsWith("+61")
    ? digits
    : digits.startsWith("61") && digits.length >= 10
      ? `+${digits}`
      : digits.startsWith("0")
        ? `+61${digits.slice(1)}`
        : null;
  return e164 && /^\+61\d{8,9}$/.test(e164) ? e164 : null;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const rows = parseCsv(readFileSync(args.file, "utf8")).filter((r) => r.some((f) => f.trim() !== ""));
  if (rows.length < 2) throw new Error("CSV has no data rows");
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string): number => header.indexOf(name);
  const phoneCol = col("phone");
  const electorateCol = col("electorate");
  const nameCol = col("name");
  const jurisdictionCol = col("jurisdiction");
  if (phoneCol < 0 || (electorateCol < 0 && nameCol < 0)) {
    throw new Error('CSV needs a "phone" column plus "electorate" and/or "name"');
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error", "warn"] });
  const summary = { updated: 0, unchanged: 0, unmatched: [] as string[], invalidPhone: [] as string[] };
  try {
    const prisma = app.get(PrismaService);
    for (const row of rows.slice(1)) {
      const label =
        (electorateCol >= 0 ? row[electorateCol]?.trim() : "") ||
        (nameCol >= 0 ? row[nameCol]?.trim() : "") ||
        "(blank)";
      const phone = normaliseAuPhone(row[phoneCol] ?? "");
      if (!phone) {
        summary.invalidPhone.push(label);
        continue;
      }
      const jurisdiction = (jurisdictionCol >= 0 && row[jurisdictionCol]?.trim()) || args.jurisdiction;

      const electorate = electorateCol >= 0 ? row[electorateCol]?.trim() : "";
      const name = nameCol >= 0 ? row[nameCol]?.trim() : "";
      const politician =
        (electorate
          ? await prisma.politician.findFirst({
              where: { jurisdiction, electorate: { equals: electorate, mode: "insensitive" } },
              orderBy: { name: "asc" },
            })
          : null) ??
        (name
          ? await prisma.politician.findFirst({
              where: { jurisdiction, name: { equals: name, mode: "insensitive" } },
            })
          : null);
      if (!politician) {
        summary.unmatched.push(label);
        continue;
      }
      if (politician.phone === phone && politician.phoneSource === args.source) {
        summary.unchanged += 1;
        continue;
      }
      if (!args.dryRun) {
        await prisma.politician.update({
          where: { id: politician.id },
          data: { phone, phoneSource: args.source },
        });
      }
      summary.updated += 1;
    }
  } finally {
    await app.close();
  }
  // eslint-disable-next-line no-console
  console.log(
    `civic:phones ${args.dryRun ? "(dry-run) " : ""}done — updated=${summary.updated} unchanged=${summary.unchanged}` +
      ` unmatched=${summary.unmatched.length}${summary.unmatched.length ? ` [${summary.unmatched.join(", ")}]` : ""}` +
      ` invalidPhone=${summary.invalidPhone.length}${summary.invalidPhone.length ? ` [${summary.invalidPhone.join(", ")}]` : ""}`,
  );
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("civic:phones failed:", error); // eslint-disable-line no-console
      process.exit(1);
    });
}
