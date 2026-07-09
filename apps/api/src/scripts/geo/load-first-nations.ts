import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../../app.module";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * Load the ABS ASGS Indigenous Structure into geo.ireg / geo.iare / geo.iloc.
 *   npm --prefix apps/api run geo:load-first-nations
 *
 * Unlike every other boundary layer, this one is fetched straight from the ABS ArcGIS
 * FeatureServers rather than a downloaded shapefile. The download convention exists because
 * G-NAF and ASGS boundaries are hundreds of megabytes; this is the inverse — 1,572 polygons
 * total, and ABS emits GeoJSON directly. No zip, no GDAL, no `shapefile` reader.
 * (Reproducibility depends on ABS being up at load time. If offline repeatability is ever
 * needed, cache the three responses under data/geo/first-nations/<level>.geojson.)
 *
 * THE PSEUDO-ROW TRAP. Each level carries exactly 19 non-spatial rows: every jurisdiction
 * has an `x94 "No usual address"` and an `x97 "Migratory - Offshore - Shipping"`, plus one
 * `ZZZ "Outside Australia"`. They have NULL geometry. We exclude on **geometry**, never on a
 * code prefix — a `Z%` filter catches only ZZZ and would load 18 invisible, geometry-less
 * rows that no-op in ST_Contains, render as empty list entries, and pollute address counts.
 * Expect 40 regions / 412 areas / 1,120 locations after filtering.
 *
 * LICENCE. The data.gov.au mirrors of these services report "notspecified"; ABS content is
 * normally CC BY 4.0. We do not assert a licence here — dataset_meta carries a to-confirm
 * string. Confirm with ABS before treating the data as redistributable.
 */
const ABS_BASE = "https://geo.abs.gov.au/arcgis/rest/services/ASGS2021";
const ABS_SOURCE_URL =
  "https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs-edition-3";
const LICENCE_TO_CONFIRM = "ABS ASGS Indigenous Structure – licence to confirm with ABS";

type Level = {
  level: "ireg" | "iare" | "iloc";
  service: string;
  table: string;
  label: string;
  /** Table columns, in order. `code`/`name`/`state` plus any parent codes. */
  cols: string[];
  /** Maps each table column to its ABS attribute name. */
  from: Record<string, string>;
};

const LEVELS: Level[] = [
  {
    level: "ireg",
    service: "IREG",
    table: "geo.ireg",
    label: "Indigenous Regions",
    cols: ["code", "name", "state"],
    from: { code: "ireg_code_2021", name: "ireg_name_2021", state: "state_name_2021" },
  },
  {
    level: "iare",
    service: "IARE",
    table: "geo.iare",
    label: "Indigenous Areas",
    cols: ["code", "name", "ireg_code", "state"],
    from: {
      code: "iare_code_2021",
      name: "iare_name_2021",
      ireg_code: "ireg_code_2021",
      state: "state_name_2021",
    },
  },
  {
    level: "iloc",
    service: "ILOC",
    table: "geo.iloc",
    label: "Indigenous Locations",
    cols: ["code", "name", "iare_code", "ireg_code", "state"],
    from: {
      code: "iloc_code_2021",
      name: "iloc_name_2021",
      iare_code: "iare_code_2021",
      ireg_code: "ireg_code_2021",
      state: "state_name_2021",
    },
  },
];

type Feature = { geometry: unknown | null; properties: Record<string, unknown> };
const PAGE = 2000; // the services' maxRecordCount
const BATCH = 400;

/** Every feature of a layer as GeoJSON. Paginates defensively: all three levels fit in one
 *  page today, but `exceededTransferLimit` is the only contract we should rely on. */
async function fetchLevel(service: string): Promise<Feature[]> {
  const out: Feature[] = [];
  let offset = 0;
  for (;;) {
    const url =
      `${ABS_BASE}/${service}/FeatureServer/0/query` +
      `?where=1%3D1&outFields=*&outSR=4326&f=geojson` +
      `&resultOffset=${offset}&resultRecordCount=${PAGE}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`ABS ${service} returned HTTP ${res.status}`);
    const fc = (await res.json()) as { features?: Feature[]; exceededTransferLimit?: boolean };
    const feats = fc.features ?? [];
    out.push(...feats);
    if (feats.length === 0 || !fc.exceededTransferLimit) break;
    offset += feats.length;
  }
  return out;
}

/** A pseudo-row ("No usual address", "Migratory - Offshore - Shipping", "Outside Australia")
 *  carries no polygon. Geometry presence is the robust discriminator — not the code. */
function hasGeometry(f: Feature): boolean {
  const g = f.geometry as { coordinates?: unknown[] } | null;
  return !!g && Array.isArray(g.coordinates) && g.coordinates.length > 0;
}

async function loadLevel(prisma: PrismaService, spec: Level): Promise<number> {
  const all = await fetchLevel(spec.service);
  const real = all.filter(hasGeometry);
  const dropped = all.length - real.length;
  console.log(`  ${spec.table}: ${all.length} fetched, ${dropped} non-spatial dropped → ${real.length}`); // eslint-disable-line no-console

  const colList = spec.cols.join(",");
  const updates = spec.cols
    .filter((c) => c !== "code")
    .map((c) => `${c}=EXCLUDED.${c}`)
    .concat("geom=EXCLUDED.geom")
    .join(", ");

  for (let i = 0; i < real.length; i += BATCH) {
    const slice = real.slice(i, i + BATCH);
    const params: unknown[] = [];
    const tuples = slice.map((f) => {
      const ph = spec.cols.map((c) => {
        const v = f.properties[spec.from[c]];
        params.push(v == null ? null : String(v));
        return `$${params.length}`;
      });
      params.push(JSON.stringify(f.geometry));
      return `(${ph.join(",")},ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($${params.length}),4326)))`;
    });
    await prisma.$executeRawUnsafe(
      `INSERT INTO ${spec.table} (${colList},geom) VALUES ${tuples.join(",")}
       ON CONFLICT (code) DO UPDATE SET ${updates}`,
      ...params,
    );
  }
  return real.length;
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error", "warn"] });
  const prisma = app.get(PrismaService);
  try {
    console.log("Loading ABS ASGS Indigenous Structure…"); // eslint-disable-line no-console
    for (const spec of LEVELS) {
      const n = await loadLevel(prisma, spec);
      await prisma.$executeRawUnsafe(
        `INSERT INTO geo.dataset_meta (key,label,source_url,release_date,licence,row_count,status,last_ingested)
         VALUES ($1,$2,$3,'ASGS Ed3 2021',$4,$5,'loaded',now())
         ON CONFLICT (key) DO UPDATE SET
           label=EXCLUDED.label, source_url=EXCLUDED.source_url, release_date=EXCLUDED.release_date,
           licence=EXCLUDED.licence, row_count=EXCLUDED.row_count, status='loaded',
           last_ingested=now(), updated_at=now()`,
        spec.level,
        spec.label,
        ABS_SOURCE_URL,
        LICENCE_TO_CONFIRM,
        n,
      );
      console.log(`  ✓ ${n} rows into ${spec.table}`); // eslint-disable-line no-console
    }
    console.log("Done. Run `geo:first-nations` to attribute addresses and publish counts."); // eslint-disable-line no-console
  } finally {
    await app.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("geo:load-first-nations failed:", error); // eslint-disable-line no-console
    process.exit(1);
  });
