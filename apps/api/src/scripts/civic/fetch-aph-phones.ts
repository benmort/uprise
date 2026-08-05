import "reflect-metadata";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseCsv } from "../demographics/abs-parse";

/**
 * Fetch the APH's published contact CSVs (House members + senators) and emit
 * ONE CSV in the phone-loader's format (`name`, `electorate`, `phone`,
 * `jurisdiction`) — then load it with civic:phones. The APH WAF blocks default
 * curl/node user agents, so the fetch presents a browser UA.
 *
 * Members map by ELECTORATE (unique per seat); senators carry no electorate in
 * civic, so they match by NAME (the loader's fallback). The electorate-office
 * number is preferred; the Parliament House number is the fallback.
 *
 * Run: `pnpm --filter api civic:phones:aph` (fetch + load in one step)
 *  or  `ts-node src/scripts/civic/fetch-aph-phones.ts --out <path>` (fetch only).
 */

const MEMBERS_URL =
  "https://www.aph.gov.au/-/media/03_Senators_and_Members/Address_Labels_and_CSV_files/StateRepsCSV.csv";
const SENATORS_URL =
  "https://www.aph.gov.au/-/media/03_Senators_and_Members/Address_Labels_and_CSV_files/Senators/allsenel.csv";

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  Accept: "text/csv,text/plain,*/*",
};

type LoaderRow = { name: string; electorate: string; phone: string };

async function fetchCsv(url: string): Promise<string[][]> {
  const res = await fetch(url, { headers: BROWSER_HEADERS });
  const text = await res.text();
  if (!res.ok || text.includes("WAF Block")) {
    throw new Error(`APH fetch refused (${res.status}) for ${url}`);
  }
  return parseCsv(text).filter((r) => r.some((f) => f.trim() !== ""));
}

/** Case-insensitive header lookup returning a per-row getter (or null). */
function getter(header: string[], name: string): ((row: string[]) => string) | null {
  const idx = header.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase());
  return idx >= 0 ? (row) => (row[idx] ?? "").trim() : null;
}

function transform(rows: string[][], kind: "members" | "senators"): LoaderRow[] {
  const header = rows[0];
  const first = getter(header, "Preferred Name");
  const firstFallback = getter(header, "First Name");
  const surname = getter(header, "Surname");
  const electorate = getter(header, "Electorate");
  const electoratePhone = getter(header, "Electorate Telephone");
  const phPhone = getter(header, "Telephone");
  if (!surname || (!first && !firstFallback) || (!electoratePhone && !phPhone)) {
    throw new Error(`Unexpected APH ${kind} CSV header: ${header.join(", ")}`);
  }
  const out: LoaderRow[] = [];
  for (const row of rows.slice(1)) {
    const given = (first?.(row) || firstFallback?.(row) || "").trim();
    const last = surname(row).trim();
    if (!last) continue;
    const phone = (electoratePhone?.(row) || "").trim() || (phPhone?.(row) || "").trim();
    if (!phone) continue;
    out.push({
      name: `${given} ${last}`.trim(),
      // Senators have no seat in civic — match by name only.
      electorate: kind === "members" ? (electorate?.(row) ?? "").trim() : "",
      phone,
    });
  }
  return out;
}

function toCsv(rows: LoaderRow[]): string {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [
    "name,electorate,phone,jurisdiction",
    ...rows.map((r) => [r.name, r.electorate, r.phone, "FEDERAL"].map(esc).join(",")),
  ].join("\n");
}

async function main(): Promise<void> {
  const outArgIdx = process.argv.indexOf("--out");
  const [members, senators] = await Promise.all([
    fetchCsv(MEMBERS_URL),
    fetchCsv(SENATORS_URL),
  ]);
  const rows = [...transform(members, "members"), ...transform(senators, "senators")];
  const outPath =
    outArgIdx >= 0
      ? process.argv[outArgIdx + 1]
      : join(mkdtempSync(join(tmpdir(), "aph-phones-")), "aph-phones.csv");
  writeFileSync(outPath, toCsv(rows));
  // eslint-disable-next-line no-console
  console.log(
    `civic:phones:aph fetched — members=${transform(members, "members").length} senators=${transform(senators, "senators").length} → ${outPath}`,
  );
  // With --load (the civic:phones:aph path), chain straight into the loader.
  if (process.argv.includes("--load")) {
    const run = spawnSync(
      "npx",
      ["ts-node", "src/scripts/civic/backfill-politician-phones.ts", "--file", outPath, "--source", "aph_csv"],
      { stdio: "inherit" },
    );
    if (run.status !== 0) throw new Error(`loader exited ${run.status}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("civic:phones:aph fetch failed:", error); // eslint-disable-line no-console
    process.exit(1);
  });
