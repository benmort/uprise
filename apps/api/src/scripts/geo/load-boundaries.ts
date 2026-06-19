import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { resolve } from "node:path";
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
 * Add more layers (mesh blocks, SA1–4, LGA) to LAYERS as their files are downloaded.
 */
const ROOT = resolve(__dirname, "../../../../..");
const LAYERS: Array<{ table: string; shp: string }> = [
  { table: "geo.ced", shp: "data/geo/ced/CED_2025_AUST_GDA2020.shp" },
  { table: "geo.sed", shp: "data/geo/sed/SED_2025_AUST_GDA2020.shp" },
  { table: "geo.lga", shp: "data/geo/lga/LGA_2024_AUST_GDA2020.shp" },
];

function pick(props: Record<string, unknown>, ...res: RegExp[]): string | null {
  for (const re of res) {
    for (const k of Object.keys(props)) {
      if (re.test(k) && props[k] != null && String(props[k]).trim() !== "") return String(props[k]);
    }
  }
  return null;
}

async function loadLayer(prisma: PrismaService, table: string, shpRel: string): Promise<number> {
  const shp = resolve(ROOT, shpRel);
  const dbf = shp.replace(/\.shp$/, ".dbf");
  const source = await shapefile.open(shp, dbf);
  let n = 0;
  let detected = "";
  for (;;) {
    const r = await source.read();
    if (r.done) break;
    const f = r.value as { geometry: unknown; properties: Record<string, unknown> } | null;
    if (!f?.geometry) continue;
    const props = f.properties || {};
    const code = pick(props, /_CODE/i, /CODE/i);
    const name = pick(props, /_NAME/i, /NAME/i);
    const state = pick(props, /STE_NAME/i, /STATE/i, /STE_CODE/i);
    if (!code) continue;
    if (!detected) {
      detected = `${table}: code←${Object.keys(props).find((k) => /code/i.test(k))} name←${Object.keys(props).find((k) => /name/i.test(k))}`;
      console.log(`  ${detected}`); // eslint-disable-line no-console
    }
    await prisma.$executeRawUnsafe(
      `INSERT INTO ${table} (code,name,state,geom)
       VALUES ($1,$2,$3, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($4),4326)))
       ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, state=EXCLUDED.state, geom=EXCLUDED.geom`,
      code,
      name,
      state,
      JSON.stringify(f.geometry),
    );
    n += 1;
  }
  return n;
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error", "warn"] });
  const prisma = app.get(PrismaService);
  try {
    for (const { table, shp } of LAYERS) {
      console.log(`Loading ${shp} → ${table}…`); // eslint-disable-line no-console
      const n = await loadLayer(prisma, table, shp);
      console.log(`  ✓ ${n} features into ${table}`); // eslint-disable-line no-console
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
