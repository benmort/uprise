import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { AppModule } from "../../app.module";
import { PrismaService } from "../../prisma/prisma.service";
import {
  INDICATORS,
  CENSUS_G02_FILES,
  CENSUS_G01_FILE,
  CENSUS_G37_FILE,
  G01_SHARES,
  G37_SHARES,
  SEIFA_FILES,
  SEIFA_SUMMARY_SHEET,
  censusRows,
  seifaRows,
  shareRows,
  type Level,
  type ValueRow,
} from "./abs-parse";

/**
 * ABS demographics loader → geo.abs_indicator (catalogue) + geo.abs_value (tall values).
 * The read API (apps/api/src/demographics) + the /data/demographics UI shipped without this, so
 * both tables are empty and every view renders "no data" until this runs. Mirrors the other geo
 * loaders (load-referendum.ts, load-polling-places.ts): read operator-staged ABS files from
 * data/geo/abs/ (gitignored), upsert idempotently, stamp geo.dataset_meta. Parsing + the indicator
 * catalogue + the file/column config live in ./abs-parse.ts (unit-tested); this file is I/O only.
 *
 * Sources (confirmed scope): SEIFA 2021 (IRSD/IRSAD/IER/IEO deciles + IRSD score, SA1+SA2, from the
 * .xlsx cube) and Census 2021 GCP table G02 "Selected Medians and Averages" (SA1–SA4, from the small
 * per-level DataPack CSVs). Any file that isn't staged is skipped. Adjust the column maps in
 * ./abs-parse.ts to match your download. See RUNBOOK-prod.md → §6 "ABS demographics".
 *
 *   DATABASE_URL=… npm --prefix apps/api run geo:load-abs
 *
 * Licence: ABS © Commonwealth of Australia (CC BY 4.0).
 */

const ROOT = resolve(__dirname, "../../../../..");
const DATA_DIR = resolve(ROOT, "data/geo/abs");

async function upsertIndicators(prisma: PrismaService): Promise<void> {
  for (const ind of INDICATORS) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO geo.abs_indicator (key,name,category,unit,format,description,source,polarity,levels,sort,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
       ON CONFLICT (key) DO UPDATE SET
         name=EXCLUDED.name, category=EXCLUDED.category, unit=EXCLUDED.unit, format=EXCLUDED.format,
         description=EXCLUDED.description, source=EXCLUDED.source, polarity=EXCLUDED.polarity,
         levels=EXCLUDED.levels, sort=EXCLUDED.sort, updated_at=now()`,
      ind.key, ind.name, ind.category, ind.unit, ind.format, ind.description ?? null,
      ind.source, ind.polarity, ind.levels, ind.sort,
    );
  }
}

async function upsertValues(prisma: PrismaService, rows: ValueRow[]): Promise<void> {
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const params: unknown[] = [];
    const tuples = slice.map((r) => {
      params.push(r.level, r.code, r.indicator_key, r.value);
      const b = params.length;
      return `($${b - 3},$${b - 2},$${b - 1},$${b})`;
    });
    await prisma.$executeRawUnsafe(
      `INSERT INTO geo.abs_value (level,code,indicator_key,value) VALUES ${tuples.join(",")}
       ON CONFLICT (level,code,indicator_key) DO UPDATE SET value=EXCLUDED.value`,
      ...params,
    );
  }
}

async function upsertMeta(prisma: PrismaService, key: string, label: string, source: string, rowCount: number): Promise<void> {
  await prisma.$executeRawUnsafe(
    `INSERT INTO geo.dataset_meta (key,label,source_url,release_date,licence,row_count,status,last_ingested)
     VALUES ($1,$2,$3,NULL,$4,$5,'loaded',now())
     ON CONFLICT (key) DO UPDATE SET
       label=EXCLUDED.label, source_url=EXCLUDED.source_url, licence=EXCLUDED.licence,
       row_count=EXCLUDED.row_count, status='loaded', last_ingested=now(), updated_at=now()`,
    key, label, source, "ABS © Commonwealth of Australia (CC BY 4.0)", rowCount,
  );
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error", "warn"] });
  const prisma = app.get(PrismaService);
  const log = (m: string) => console.log(m); // eslint-disable-line no-console
  try {
    await upsertIndicators(prisma);
    log(`  ✓ seeded ${INDICATORS.length} indicators → geo.abs_indicator`);

    // Census G02 — one small CSV per level.
    const censusValues: ValueRow[] = [];
    for (const level of ["sa1", "sa2", "sa3", "sa4"] as Level[]) {
      const path = resolve(DATA_DIR, CENSUS_G02_FILES[level]);
      if (!existsSync(path)) { log(`  – ${CENSUS_G02_FILES[level]} not staged; skipping ${level.toUpperCase()} census`); continue; }
      const rows = censusRows(level, readFileSync(path, "utf8"));
      for (const r of rows) censusValues.push(r); // not push(...rows): a level can be 100k+ rows → stack overflow
      log(`  · ${level.toUpperCase()} G02: ${rows.length} values`);
    }
    if (censusValues.length) {
      await upsertValues(prisma, censusValues);
      await upsertMeta(prisma, "abs_census_2021", "ABS Census 2021 (General Community Profile)", "https://www.abs.gov.au/census", censusValues.length);
      log(`  ✓ upserted ${censusValues.length} census values + dataset_meta (abs_census_2021)`);
    }

    // Derived shares — G01 (persons: CALD / First Nations / 18–24) + G37 (tenure) at SA1.
    for (const { file, defs, label } of [
      { file: CENSUS_G01_FILE, defs: G01_SHARES, label: "G01 shares" },
      { file: CENSUS_G37_FILE, defs: G37_SHARES, label: "G37 shares" },
    ]) {
      const path = resolve(DATA_DIR, file);
      if (!existsSync(path)) { log(`  – ${file} not staged; skipping ${label}`); continue; }
      const { rows, missing } = shareRows("sa1", readFileSync(path, "utf8"), defs);
      if (missing.length) log(`  ⚠ ${label}: column(s) missing for ${missing.join(", ")} — check the DataPack vintage`);
      if (rows.length) {
        await upsertValues(prisma, rows);
        log(`  · SA1 ${label}: ${rows.length} values`);
      }
    }

    // SEIFA — one "Indexes" xlsx per level; read the "Table 1" Summary sheet.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const XLSX = require("xlsx") as typeof import("xlsx");
    const seifaValues: ValueRow[] = [];
    for (const level of ["sa1", "sa2"] as const) {
      const path = resolve(DATA_DIR, SEIFA_FILES[level]);
      if (!existsSync(path)) { log(`  – ${SEIFA_FILES[level]} not staged; skipping ${level.toUpperCase()} SEIFA`); continue; }
      const sheet = XLSX.readFile(path).Sheets[SEIFA_SUMMARY_SHEET];
      if (!sheet) { log(`  – SEIFA sheet "${SEIFA_SUMMARY_SHEET}" not in ${SEIFA_FILES[level]}; skipping ${level.toUpperCase()}`); continue; }
      const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false });
      const rows = seifaRows(level, grid);
      for (const r of rows) seifaValues.push(r); // not push(...rows): SA1 is ~300k rows → stack overflow
      log(`  · ${level.toUpperCase()} SEIFA: ${rows.length} values`);
    }
    if (seifaValues.length) {
      await upsertValues(prisma, seifaValues);
      await upsertMeta(prisma, "seifa_2021", "ABS SEIFA 2021", "https://www.abs.gov.au/statistics/people/people-and-communities/socio-economic-indexes-areas-seifa-australia/2021", seifaValues.length);
      log(`  ✓ upserted ${seifaValues.length} SEIFA values + dataset_meta (seifa_2021)`);
    }

    log("ABS demographics load complete.");
  } finally {
    await app.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("geo:load-abs failed:", e); // eslint-disable-line no-console
    process.exit(1);
  });
