#!/usr/bin/env node
// Bundle budget for the field PWA (canvassers load it on phones in the field).
//
// Sums the gzipped first-load JS for the root route from the app build manifest and
// fails when it exceeds the budget. Exists because a single barrel import in the
// layout once put the ENTIRE @uprise/field package (mapbox included) into every
// route chunk — 15.6MB of route JS in dev — and nothing caught it.
//
//   NEXT_DIST_DIR=.next-validate pnpm --filter field build && node scripts/check-bundle-size.mjs
//
// Budget is on GZIPPED bytes (what actually crosses the wire). The healthy baseline
// after the barrel fix is ~50KB gz (155KB raw "First Load JS"); the budget leaves
// headroom for growth while still catching another barrel-class regression cold.

import { readFileSync, existsSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join, resolve } from "node:path";

const BUDGET_GZIP_BYTES = 250_000; // ~5× the healthy baseline; a barrel regression is 10×+
const ROUTE = "/page";

const distDir = process.env.NEXT_DIST_DIR || ".next-validate";
const base = resolve(process.cwd(), "apps/field", distDir);
const manifestPath = join(base, "app-build-manifest.json");

if (!existsSync(manifestPath)) {
  console.error(`bundle check: no build manifest at ${manifestPath} — build apps/field first (NEXT_DIST_DIR=${distDir})`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const files = manifest.pages?.[ROUTE];
if (!files) {
  console.error(`bundle check: route ${ROUTE} not in manifest (routes: ${Object.keys(manifest.pages ?? {}).join(", ")})`);
  process.exit(1);
}

let raw = 0;
let gz = 0;
for (const f of files) {
  if (!f.endsWith(".js")) continue;
  const p = join(base, f);
  if (!existsSync(p)) continue;
  const buf = readFileSync(p);
  raw += buf.length;
  gz += gzipSync(buf, { level: 6 }).length;
}

const kb = (n) => `${(n / 1024).toFixed(1)}KB`;
console.log(`field first-load JS (${ROUTE}): ${kb(gz)} gzipped (${kb(raw)} raw) — budget ${kb(BUDGET_GZIP_BYTES)} gzipped`);
if (gz > BUDGET_GZIP_BYTES) {
  console.error(
    `✖ over budget by ${kb(gz - BUDGET_GZIP_BYTES)}. Almost always a barrel import on the boot path — ` +
      `check layout/page imports against apps/field/next.config.mjs optimizePackageImports.`,
  );
  process.exit(1);
}
console.log("✔ bundle budget ok");
