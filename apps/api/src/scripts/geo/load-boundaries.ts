import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { AppModule } from "../../app.module";
import { PrismaService } from "../../prisma/prisma.service";

// `shapefile` ships no types; it streams GeoJSON features from .shp/.dbf.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const shapefile: {
  open: (
    shp: string,
    dbf: string,
  ) => Promise<{ read: () => Promise<{ done: boolean; value: unknown }> }>;
} = require("shapefile");

/**
 * No-GDAL boundary loader: streams ESRI shapefile features → geo.* via
 * ST_GeomFromGeoJSON (the `shapefile` package emits GeoJSON, so no ogr2ogr needed).
 * GDA2020 lat/long is treated as 4326 (sub-metre offset — fine for canvassing).
 *   npm --prefix apps/api run geo:load-boundaries
 *
 * Each layer carries a column spec (shapefile field → table column) because the
 * tables differ: ced/sed/sa4 are (code,name,state); sa1–3 carry a parent code;
 * meshblock is (mb_code + sa1–4 codes + state). Shapefile DBF field names are
 * truncated to 10 chars (SA1_CODE21, MB_CODE21, STE_NAME21…) so the field regexes
 * match loosely. Inserts are batched (national meshblock ≈358k rows). Missing
 * shapefiles are skipped with a warning so a partial set still loads.
 */
const ROOT = resolve(__dirname, "../../../../..");

type ColSpec = { col: string; from: RegExp[] };
type LayerSpec = {
  table: string;
  shp: string;
  pk: string; // ON CONFLICT target (must be one of cols)
  cols: ColSpec[]; // first col is the code/PK; geom is appended automatically
  meta: { key: string; label: string; releaseDate: string; sourceUrl: string; licence: string };
};

const ABS = "https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs-edition-3";
const CCBY = "CC BY 4.0";

const LAYERS: LayerSpec[] = [
  {
    table: "geo.ced",
    shp: "data/geo/ced/CED_2025_AUST_GDA2020.shp",
    pk: "code",
    cols: [
      { col: "code", from: [/CED_CODE/i, /_CODE/i] },
      { col: "name", from: [/CED_NAME/i, /_NAME/i] },
      { col: "state", from: [/STE_NAME/i, /STATE/i] },
    ],
    meta: { key: "ced", label: "Federal divisions", releaseDate: "2025", sourceUrl: "https://www.aec.gov.au/electorates/", licence: CCBY },
  },
  {
    table: "geo.sed",
    shp: "data/geo/sed/SED_2025_AUST_GDA2020.shp",
    pk: "code",
    cols: [
      { col: "code", from: [/SED_CODE/i, /_CODE/i] },
      { col: "name", from: [/SED_NAME/i, /_NAME/i] },
      { col: "state", from: [/STE_NAME/i, /STATE/i] },
    ],
    meta: { key: "sed", label: "State electorates", releaseDate: "2025", sourceUrl: ABS, licence: CCBY },
  },
  {
    table: "geo.meshblock",
    shp: "data/geo/meshblock/MB_2021_AUST_GDA2020.shp",
    pk: "mb_code",
    cols: [
      { col: "mb_code", from: [/MB_CODE/i] },
      { col: "sa1_code", from: [/SA1_CODE/i] },
      { col: "sa2_code", from: [/SA2_CODE/i] },
      { col: "sa3_code", from: [/SA3_CODE/i] },
      { col: "sa4_code", from: [/SA4_CODE/i] },
      { col: "state", from: [/STE_NAME/i, /STATE/i] },
    ],
    meta: { key: "asgs_mb", label: "Meshblocks", releaseDate: "ASGS Ed3 2021", sourceUrl: ABS, licence: CCBY },
  },
  {
    table: "geo.sa1",
    shp: "data/geo/sa1/SA1_2021_AUST_GDA2020.shp",
    pk: "code",
    cols: [
      { col: "code", from: [/SA1_CODE/i] },
      { col: "sa2_code", from: [/SA2_CODE/i] },
    ],
    meta: { key: "sa1", label: "Statistical Area 1", releaseDate: "ASGS Ed3 2021", sourceUrl: ABS, licence: CCBY },
  },
  {
    table: "geo.sa2",
    shp: "data/geo/sa2/SA2_2021_AUST_GDA2020.shp",
    pk: "code",
    cols: [
      { col: "code", from: [/SA2_CODE/i] },
      { col: "name", from: [/SA2_NAME/i] },
      { col: "sa3_code", from: [/SA3_CODE/i] },
    ],
    meta: { key: "sa2", label: "Statistical Area 2", releaseDate: "ASGS Ed3 2021", sourceUrl: ABS, licence: CCBY },
  },
  {
    table: "geo.sa3",
    shp: "data/geo/sa3/SA3_2021_AUST_GDA2020.shp",
    pk: "code",
    cols: [
      { col: "code", from: [/SA3_CODE/i] },
      { col: "name", from: [/SA3_NAME/i] },
      { col: "sa4_code", from: [/SA4_CODE/i] },
    ],
    meta: { key: "sa3", label: "Statistical Area 3", releaseDate: "ASGS Ed3 2021", sourceUrl: ABS, licence: CCBY },
  },
  {
    table: "geo.sa4",
    shp: "data/geo/sa4/SA4_2021_AUST_GDA2020.shp",
    pk: "code",
    cols: [
      { col: "code", from: [/SA4_CODE/i] },
      { col: "name", from: [/SA4_NAME/i] },
      { col: "state", from: [/STE_NAME/i, /STATE/i] },
    ],
    meta: { key: "sa4", label: "Statistical Area 4", releaseDate: "ASGS Ed3 2021", sourceUrl: ABS, licence: CCBY },
  },
];

function pick(props: Record<string, unknown>, res: RegExp[]): string | null {
  for (const re of res) {
    for (const k of Object.keys(props)) {
      if (re.test(k) && props[k] != null && String(props[k]).trim() !== "") return String(props[k]);
    }
  }
  return null;
}

function detectKey(props: Record<string, unknown>, res: RegExp[]): string {
  for (const re of res) {
    const k = Object.keys(props).find((key) => re.test(key));
    if (k) return k;
  }
  return "∅";
}

const BATCH = 600;

async function loadLayer(prisma: PrismaService, spec: LayerSpec): Promise<number> {
  const shp = resolve(ROOT, spec.shp);
  if (!existsSync(shp)) {
    console.warn(`  ⚠ skip ${spec.table}: ${spec.shp} not found`); // eslint-disable-line no-console
    return -1;
  }
  const dbf = shp.replace(/\.shp$/, ".dbf");
  const source = await shapefile.open(shp, dbf);
  const pkIdx = spec.cols.findIndex((c) => c.col === spec.pk);
  const colList = spec.cols.map((c) => c.col).join(",");
  const updates = spec.cols
    .filter((c) => c.col !== spec.pk)
    .map((c) => `${c.col}=EXCLUDED.${c.col}`)
    .concat("geom=EXCLUDED.geom")
    .join(", ");

  let n = 0;
  let logged = false;
  let batch: Array<{ vals: (string | null)[]; geom: string }> = [];

  const flush = async () => {
    if (batch.length === 0) return;
    // Collapse any duplicate PKs within the batch (a single INSERT can't update a
    // conflict row twice); cross-batch dupes are handled by ON CONFLICT.
    const seen = new Set<string>();
    const rows = batch.filter((row) => {
      const k = String(row.vals[pkIdx]);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    const params: unknown[] = [];
    const tuples = rows.map((row) => {
      const colPh = row.vals.map((v) => {
        params.push(v);
        return `$${params.length}`;
      });
      params.push(row.geom);
      return `(${colPh.join(",")},ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($${params.length}),4326)))`;
    });
    await prisma.$executeRawUnsafe(
      `INSERT INTO ${spec.table} (${colList},geom) VALUES ${tuples.join(",")}
       ON CONFLICT (${spec.pk}) DO UPDATE SET ${updates}`,
      ...params,
    );
    n += rows.length;
    batch = [];
  };

  for (;;) {
    const r = await source.read();
    if (r.done) break;
    const f = r.value as { geometry: unknown; properties: Record<string, unknown> } | null;
    if (!f?.geometry) continue;
    const props = f.properties || {};
    const vals = spec.cols.map((c) => pick(props, c.from));
    if (!vals[pkIdx]) continue; // no code → skip
    if (!logged) {
      console.log(`  ${spec.table}: ${spec.cols.map((c) => `${c.col}←${detectKey(props, c.from)}`).join(", ")}`); // eslint-disable-line no-console
      logged = true;
    }
    batch.push({ vals, geom: JSON.stringify(f.geometry) });
    if (batch.length >= BATCH) await flush();
  }
  await flush();
  return n;
}

async function upsertMeta(prisma: PrismaService, spec: LayerSpec, rowCount: number): Promise<void> {
  await prisma.$executeRawUnsafe(
    `INSERT INTO geo.dataset_meta (key,label,source_url,release_date,licence,row_count,status,last_ingested)
     VALUES ($1,$2,$3,$4,$5,$6,'loaded',now())
     ON CONFLICT (key) DO UPDATE SET
       label=EXCLUDED.label, source_url=EXCLUDED.source_url, release_date=EXCLUDED.release_date,
       licence=EXCLUDED.licence, row_count=EXCLUDED.row_count, status='loaded',
       last_ingested=now(), updated_at=now()`,
    spec.meta.key,
    spec.meta.label,
    spec.meta.sourceUrl,
    spec.meta.releaseDate,
    spec.meta.licence,
    rowCount,
  );
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error", "warn"] });
  const prisma = app.get(PrismaService);
  try {
    for (const spec of LAYERS) {
      console.log(`Loading ${spec.shp} → ${spec.table}…`); // eslint-disable-line no-console
      const n = await loadLayer(prisma, spec);
      if (n < 0) continue; // file missing — leave dataset_meta untouched
      await upsertMeta(prisma, spec, n);
      console.log(`  ✓ ${n} features into ${spec.table}`); // eslint-disable-line no-console
    }
  } finally {
    await app.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("geo:load-boundaries failed:", e); // eslint-disable-line no-console
    process.exit(1);
  });
