import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { resolve } from "node:path";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { AppModule } from "../../app.module";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * Polling-place loader: federal booths from the AEC (direct CSV) + every
 * state/territory from The Tally Room (Ben Raue) xlsx booth masters. Loads point
 * rows into geo.polling_place, then tags each booth with the federal division
 * (geo.ced) and state electorate (geo.sed) that spatially contain it — so a booth
 * links to our boundaries regardless of how its source names the electorate.
 *   npm --prefix apps/api run geo:load-polling-places
 *
 * Sources are downloaded (gitignored) into data/geo/polling-places/<jur>/ first:
 *   federal: curl the AEC GeneralPollingPlacesDownload CSV
 *   states:  pip install gdown && gdown --folder <driveURL>  (keep *-Pollingplaces.xlsx)
 * See apps/api/src/scripts/geo/README.md.
 *
 * ⚠ Licence: The Tally Room data carries no open licence — used here for internal,
 * organiser-only, derived map display with attribution; public redistribution of
 * the data itself needs Ben Raue's written permission. AEC data is CC BY 4.0.
 */
const ROOT = resolve(__dirname, "../../../../..");

type Jurisdiction = "federal" | "nsw" | "vic" | "qld" | "wa" | "sa" | "tas" | "act" | "nt";

/** One booth in our shape (pre-namespacing). Nulls tolerated except id + coords. */
type PlaceRecord = {
  sourceId: string;
  name: string | null;
  premises: string | null;
  address: string | null;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  divisionName: string | null;
  placeType: string | null;
  lat: number;
  lng: number;
};

type Source = {
  jurisdiction: Jurisdiction;
  format: "csv" | "xlsx";
  /** File path relative to ROOT, or a directory scanned for `match`. */
  file: string;
  /** When `file` is a directory, the filename to pick (first match wins). */
  match?: RegExp;
  meta: { sourceUrl: string; releaseDate: string };
  /** Map one raw record (header→cell) to our shape; return null to drop the row. */
  map: (rec: Record<string, string>) => PlaceRecord | null;
};

// ── helpers ─────────────────────────────────────────────────────────────────
function num(v: string | null | undefined): number | null {
  if (v == null || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** First non-empty cell whose header matches one of the regexes (in order). */
function pick(rec: Record<string, string>, res: RegExp[]): string | null {
  for (const re of res) {
    for (const k of Object.keys(rec)) {
      if (re.test(k) && rec[k] != null && String(rec[k]).trim() !== "") return String(rec[k]).trim();
    }
  }
  return null;
}

// ── RFC4180-ish CSV (AEC quotes premises names/addresses that contain commas) ──
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\r") { /* ignore */ }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** CSV → records keyed by header. Skips leading banner lines (AEC prepends one);
 *  the header is the first row that looks like a booth header. */
function csvRecords(text: string): Record<string, string>[] {
  const rows = parseCsv(text).filter((r) => r.some((f) => f.trim() !== ""));
  // The header is a multi-column row; the AEC prepends a single-cell banner line
  // that also contains the words "Polling Places", so require >1 field here.
  const hIdx = rows.findIndex((r) => r.length > 1 && r.some((f) => /polling.?place|latitude/i.test(f)));
  const start = hIdx >= 0 ? hIdx : 0;
  const header = rows[start].map((h) => h.trim());
  return rows.slice(start + 1)
    .filter((r) => r.some((f) => f.trim() !== ""))
    .map((r) => {
      const o: Record<string, string> = {};
      header.forEach((h, i) => (o[h] = (r[i] ?? "").trim()));
      return o;
    });
}

/** xlsx → records keyed by header (first sheet). Lazy-loads SheetJS so the CSV
 *  path has no dependency; the states step (Phase C) adds `xlsx` as a devDep. */
function xlsxRecords(path: string): Record<string, string>[] {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const XLSX = require("xlsx") as typeof import("xlsx");
  const wb = XLSX.readFile(path);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  return raw.map((r) => {
    const o: Record<string, string> = {};
    for (const [k, v] of Object.entries(r)) o[String(k).trim()] = v == null ? "" : String(v).trim();
    return o;
  });
}

/** Resolve a Source's file to an absolute path (scanning a dir for `match`). */
function resolveFile(src: Source): string | null {
  const p = resolve(ROOT, src.file);
  if (!existsSync(p)) return null;
  if (!src.match) return p;
  const hit = readdirSync(p).find((f) => src.match!.test(f));
  return hit ? resolve(p, hit) : null;
}

/**
 * The Tally Room booth master (`<JUR>-<YEAR>-Pollingplaces.xlsx`) has a mostly
 * stable schema, but column names drift per jurisdiction (premises|pp_premises,
 * address|pp_address, suburb|pp_suburb|locality), so map fuzzily. The file has no
 * state column, so `state` comes from the jurisdiction. Rows without coordinates
 * (declared-institution/postal booths) are dropped.
 */
function tallyRoomMap(stateAbbrev: string) {
  return (r: Record<string, string>): PlaceRecord | null => {
    const lat = num(pick(r, [/^latitude$/i, /^lat$/i]));
    const lng = num(pick(r, [/^longitude$/i, /^long/i, /^lng$/i]));
    if (lat === null || lng === null) return null;
    const sourceId = pick(r, [/^pp_id$/i, /pp.?id/i, /^id$/i]);
    if (!sourceId) return null;
    return {
      sourceId,
      name: pick(r, [/^pp_name$/i, /pp.?name/i, /^name$/i]),
      premises: pick(r, [/^premises$/i, /pp_premises/i, /premises/i, /venue/i]),
      address: pick(r, [/^address$/i, /pp_address/i, /address/i, /street/i]),
      suburb: pick(r, [/^suburb$/i, /pp_suburb/i, /^locality$/i, /suburb/i]),
      postcode: pick(r, [/^postcode$/i, /post.?code/i]),
      divisionName: pick(r, [/^district_name$/i, /district.?name/i, /electorate/i, /division/i]),
      placeType: pick(r, [/^pp_type$/i, /pp.?type/i]),
      lat,
      lng,
      state: stateAbbrev,
    };
  };
}

// ── Sources: federal (AEC direct CSV) + state/territory (The Tally Room xlsx) ──
const AEC_FILE = "data/geo/polling-places/federal/GeneralPollingPlacesDownload-31496.csv";
const TALLY_ROOM: Array<{ jur: Jurisdiction; state: string; year: string }> = [
  { jur: "nsw", state: "NSW", year: "2023" },
  { jur: "vic", state: "VIC", year: "2022" },
  { jur: "qld", state: "QLD", year: "2024" },
  { jur: "wa", state: "WA", year: "2025" },
  { jur: "sa", state: "SA", year: "2026" },
  { jur: "tas", state: "TAS", year: "2025" },
  { jur: "act", state: "ACT", year: "2024" },
  { jur: "nt", state: "NT", year: "2024" },
];

const SOURCES: Source[] = [
  {
    jurisdiction: "federal",
    format: "csv",
    file: AEC_FILE,
    meta: {
      sourceUrl: "https://results.aec.gov.au/31496/Website/Downloads/GeneralPollingPlacesDownload-31496.csv",
      releaseDate: "AEC 2025 federal election",
    },
    map: (r) => {
      // Keep fixed booths only: 1 = election-day, 5 = pre-poll voting centre.
      // Mobile teams (2/3/4) are "Multiple sites" with no single coordinate.
      const type = r.PollingPlaceTypeID;
      if (type !== "1" && type !== "5") return null;
      const lat = num(r.Latitude);
      const lng = num(r.Longitude);
      if (lat === null || lng === null) return null;
      return {
        sourceId: r.PollingPlaceID,
        name: r.PollingPlaceNm || null,
        premises: r.PremisesNm || null,
        address: [r.PremisesAddress1, r.PremisesAddress2, r.PremisesAddress3].filter((s) => s && s.trim()).join(", ") || null,
        suburb: r.PremisesSuburb || null,
        state: r.PremisesStateAb || r.State || null,
        postcode: r.PremisesPostCode || null,
        divisionName: r.DivisionNm || null,
        placeType: type === "5" ? "pre_poll" : "election_day",
        lat,
        lng,
      };
    },
  },
  ...TALLY_ROOM.map(
    ({ jur, state, year }): Source => ({
      jurisdiction: jur,
      format: "xlsx",
      file: `data/geo/polling-places/${jur}`,
      match: /-Pollingplaces\.xlsx$/i, // the booth master (plural), not the -PollingPlace vote files
      meta: { sourceUrl: "https://www.tallyroom.com.au/data", releaseDate: `${state} ${year} election` },
      map: tallyRoomMap(state),
    }),
  ),
];

const COLS = [
  "id", "jurisdiction", "source_id", "name", "premises", "address", "suburb",
  "state", "postcode", "division_name", "place_type", "lat", "lng",
];
const BATCH = 500;

async function loadSource(prisma: PrismaService, src: Source): Promise<number> {
  const path = resolveFile(src);
  if (!path) {
    console.warn(`  ⚠ skip ${src.jurisdiction}: ${src.file} not found`); // eslint-disable-line no-console
    return -1;
  }
  const raw = src.format === "csv" ? csvRecords(readFileSync(path, "utf8")) : xlsxRecords(path);
  const recs = raw
    .map(src.map)
    .filter((r): r is PlaceRecord => r != null && !!r.sourceId);

  // Collapse duplicate ids within the source (last wins) before batching — a
  // single INSERT can't update the same conflict row twice.
  const byId = new Map<string, PlaceRecord>();
  for (const r of recs) byId.set(`${src.jurisdiction}:${r.sourceId}`, r);
  const rows = [...byId.entries()];

  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const params: unknown[] = [];
    const tuples = slice.map(([id, r]) => {
      const vals = [id, src.jurisdiction, r.sourceId, r.name, r.premises, r.address, r.suburb, r.state, r.postcode, r.divisionName, r.placeType, r.lat, r.lng];
      const ph = vals.map((v) => { params.push(v); return `$${params.length}`; });
      params.push(r.lng, r.lat);
      return `(${ph.join(",")},ST_SetSRID(ST_MakePoint($${params.length - 1},$${params.length}),4326))`;
    });
    await prisma.$executeRawUnsafe(
      `INSERT INTO geo.polling_place (${COLS.join(",")},geom) VALUES ${tuples.join(",")}
       ON CONFLICT (id) DO UPDATE SET
         jurisdiction=EXCLUDED.jurisdiction, source_id=EXCLUDED.source_id, name=EXCLUDED.name,
         premises=EXCLUDED.premises, address=EXCLUDED.address, suburb=EXCLUDED.suburb,
         state=EXCLUDED.state, postcode=EXCLUDED.postcode, division_name=EXCLUDED.division_name,
         place_type=EXCLUDED.place_type, lat=EXCLUDED.lat, lng=EXCLUDED.lng, geom=EXCLUDED.geom`,
      ...params,
    );
  }
  return rows.length;
}

/** Point-in-polygon tag each booth with its federal division + state electorate
 *  (mirrors scripts/geo/map.ts). GIST-indexed, so ~8k×550 polys is quick. */
async function tagDivisions(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(
    `UPDATE geo.polling_place p SET ced_code = d.code
       FROM geo.ced d WHERE p.geom IS NOT NULL AND ST_Contains(d.geom, p.geom)`,
  );
  await prisma.$executeRawUnsafe(
    `UPDATE geo.polling_place p SET sed_code = d.code
       FROM geo.sed d WHERE p.geom IS NOT NULL AND ST_Contains(d.geom, p.geom)`,
  );
}

async function upsertMeta(prisma: PrismaService, sources: Source[]): Promise<void> {
  const total = (await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM geo.polling_place`)) as Array<{ n: number }>;
  const loaded = sources.map((s) => s.jurisdiction).join(", ");
  await prisma.$executeRawUnsafe(
    `INSERT INTO geo.dataset_meta (key,label,source_url,release_date,licence,row_count,status,last_ingested)
     VALUES ('polling_places','Polling places',$1,$2,$3,$4,'loaded',now())
     ON CONFLICT (key) DO UPDATE SET
       label=EXCLUDED.label, source_url=EXCLUDED.source_url, release_date=EXCLUDED.release_date,
       licence=EXCLUDED.licence, row_count=EXCLUDED.row_count, status='loaded',
       last_ingested=now(), updated_at=now()`,
    "https://www.tallyroom.com.au/data (states) · https://results.aec.gov.au (federal)",
    `AEC 2025 + state/territory latest (${loaded})`,
    "AEC © Commonwealth of Australia (CC BY 4.0); state/territory © The Tally Room (Ben Raue)",
    total[0]?.n ?? 0,
  );
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error", "warn"] });
  const prisma = app.get(PrismaService);
  try {
    const loaded: Source[] = [];
    for (const src of SOURCES) {
      console.log(`Loading ${src.jurisdiction} (${src.file})…`); // eslint-disable-line no-console
      const n = await loadSource(prisma, src);
      if (n < 0) continue;
      loaded.push(src);
      console.log(`  ✓ ${n} booths → geo.polling_place [${src.jurisdiction}]`); // eslint-disable-line no-console
    }
    if (loaded.length) {
      console.log("Tagging booths with federal division + state electorate…"); // eslint-disable-line no-console
      await tagDivisions(prisma);
      await upsertMeta(prisma, loaded);
      console.log("  ✓ division tags + dataset_meta updated"); // eslint-disable-line no-console
    }
  } finally {
    await app.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("geo:load-polling-places failed:", e); // eslint-disable-line no-console
    process.exit(1);
  });
